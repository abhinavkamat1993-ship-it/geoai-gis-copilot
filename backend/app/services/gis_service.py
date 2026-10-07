from typing import Any

from fastapi import HTTPException
from shapely.ops import unary_union

from app.data.repository import DATASETS, GeoJsonRepository
from app.gis.geometry import to_geometry
from app.gis.geometry import to_geometry
from app.gis.queries import find_features
from app.gis.spatial_analysis import (buffer_features, find_nearby_features, intersect_layers,
                                      create_analysis_buffer, validate_asset_location, validate_required_attributes)
from app.models.gis import CopilotResponse, FeatureResult, GisIntent
from app.gis.validation import validate_intent


def _result(layer: str, feature: dict[str, Any], distance: float | None = None, repository: GeoJsonRepository | None = None) -> FeatureResult:
    properties = dict(feature.get("properties") or {})
    asset_types = {"valves": "Valve", "stations": properties.get("station_type", "Station"),
                   "facilities": "Facility", "terminals": "Terminal", "pipelines": "Pipeline",
                   "pipeline_segments": "Pipeline Segment"}
    if layer in asset_types:
        properties.setdefault("asset_type", asset_types[layer])
    key = repository.id_field(layer) if repository else "id"
    return FeatureResult(id=str(properties.get(key, "unknown")), layer=layer, attributes=properties,
                         geometry=feature.get("geometry"), distance_m=round(distance, 2) if distance is not None else None)


def execute_intent(repository: GeoJsonRepository, intent: GisIntent) -> CopilotResponse:
    validate_intent(intent, repository)
    analysis: list[str] = [f"Validated {intent.type} intent."]
    features: list[FeatureResult] = []
    warnings: list[str] = []
    clarification = None
    analysis_geometry = None
    layer = intent.layer
    if intent.type in ("FIND_ASSETS", "FILTER_ASSETS", "COUNT_ASSETS"):
        if not layer:
            clarification = "Which asset layer should I use?"
            return CopilotResponse(success=True, intent=intent, summary=clarification, clarification=clarification)
        matches = find_features(repository, layer, intent.filters)
        analysis.extend([f"Read {layer} from the configured GeoJSON repository.", "Applied the requested attribute filters."])
        features = [_result(layer, item, repository=repository) for item in matches[:500]]
        if intent.type == "COUNT_ASSETS":
            summary = f"Found {len(matches)} {layer.replace('_', ' ')} matching the filters."
        else:
            summary = f"Found {len(matches)} {layer.replace('_', ' ')} matching the request."
    elif intent.type in ("ASSET_DETAILS",):
        if not intent.asset_id:
            clarification = "Which asset ID should I look up?"
            return CopilotResponse(success=True, intent=intent, summary=clarification, clarification=clarification)
        search_layers = [layer] if layer else repository.layer_names()
        found = next(((name, repository.find_by_id(name, intent.asset_id)) for name in search_layers
                      if repository.find_by_id(name, intent.asset_id)), None)
        if not found:
            raise HTTPException(status_code=404, detail=f"Asset not found: {intent.asset_id}")
        layer, feature = found
        features = [_result(layer, feature, repository=repository)]
        analysis.append(f"Looked up {intent.asset_id} by the configured layer identifier.")
        summary = f"Found {intent.asset_id} in {layer.replace('_', ' ')}."
    elif intent.type in ("NEARBY_ASSETS", "BUFFER_ANALYSIS"):
        if not layer:
            clarification = "Which asset type should I search for?"
            return CopilotResponse(success=True, intent=intent, summary=clarification, clarification=clarification)
        distance_m = (intent.distance or 0) * (1000 if intent.distance_unit == "kilometers" else 1)
        if intent.type == "NEARBY_ASSETS":
            if not intent.reference_asset_id:
                clarification = "Which asset or incident should I use as the reference location?"
                return CopilotResponse(success=True, intent=intent, summary=clarification, clarification=clarification)
            ref = next((repository.find_by_id(name, intent.reference_asset_id) for name in repository.layer_names()
                        if repository.find_by_id(name, intent.reference_asset_id)), None)
            if not ref:
                raise HTTPException(status_code=404, detail=f"Reference asset not found: {intent.reference_asset_id}")
            if to_geometry(ref) is None:
                return CopilotResponse(success=False, intent=intent,
                                       summary=f"Reference asset {intent.reference_asset_id} has no geometry, so a distance analysis cannot be calculated.",
                                       warnings=["No spatial result was produced because the reference geometry is missing."])
            analysis.append(f"Located reference feature {intent.reference_asset_id}.")
        else:
            location = intent.selected_location
            if not location:
                clarification = "Select a location on the map, or include a reference asset ID."
                return CopilotResponse(success=True, intent=intent, summary=clarification, clarification=clarification)
            ref = None
            analysis.append("Used the selected map coordinate as the reference location.")
        if ref:
            matches = find_nearby_features(repository, layer, ref, distance_m, intent.filters)
            analysis_geometry = create_analysis_buffer(ref, distance_m)
        else:
            matches = buffer_features(repository, layer, location, distance_m, intent.filters)
            analysis_geometry = create_analysis_buffer({}, distance_m, location)
        features = [_result(layer, item, distance, repository) for item, distance in matches[:500]]
        if intent.type == "NEARBY_ASSETS":
            skipped = sum(1 for item in repository.features(layer) if to_geometry(item) is None)
            if skipped:
                warnings.append(f"Skipped {skipped} target records with missing geometry; they cannot be included in a distance query.")
        analysis.extend([f"Created a {distance_m:g} meter analysis buffer around the reference geometry.",
                         f"Queried the {layer} dataset for intersecting features.",
                         "Projected geometries to a local UTM coordinate system for distance calculations.",
                         f"Applied a {distance_m:g} meter search distance and requested attribute filters."])
        summary = f"Found {len(matches)} {layer.replace('_', ' ')} within {distance_m:g} meters."
    elif intent.type == "INTERSECT_ANALYSIS":
        if not layer or not intent.target_layer:
            clarification = "Name the two layers to compare. For example: find pipelines crossing rivers."
            return CopilotResponse(success=True, intent=intent, summary=clarification, clarification=clarification,
                                   warnings=[])
        if not repository.is_local_layer(layer):
            return CopilotResponse(success=False, intent=intent,
                                   summary=f"The first input layer is a remote service ({layer}) and cannot be scanned by this operation.",
                                   warnings=["Choose a local GeoJSON layer as the first input."])
        try:
            if repository.is_local_layer(intent.target_layer):
                pairs = intersect_layers(repository, layer, intent.target_layer)
            else:
                local_features = repository.features(layer)
                local_geometries = [to_geometry(item) for item in local_features]
                valid_geometries = [geometry for geometry in local_geometries if geometry is not None]
                service_features = repository.service_features_near(intent.target_layer, unary_union(valid_geometries)) if valid_geometries else []
                service_geometries = [(item, to_geometry(item)) for item in service_features]
                service_geometries = [(item, geometry) for item, geometry in service_geometries if geometry is not None]
                pairs = [(item, remote) for item in local_features if (geometry := to_geometry(item)) is not None
                         for remote, other_geometry in service_geometries if geometry.intersects(other_geometry)]
        except HTTPException as error:
            return CopilotResponse(success=False, intent=intent,
                                   summary="The public GIS service could not be queried, so the intersection result is unavailable.",
                                   warnings=[str(error.detail)])
        unique_features = {}
        for first, _ in pairs:
            properties = first.get("properties") or {}
            identifier = str(properties.get(repository.id_field(layer), ""))
            unique_features.setdefault(identifier or str(len(unique_features)), first)
        features = [_result(layer, feature, repository=repository)
                    for feature in list(unique_features.values())[:500]]
        summary = (f"Found {len(unique_features)} unique features in {layer.replace('_', ' ')} intersecting "
                   f"{intent.target_layer.replace('_', ' ')} ({len(pairs)} feature pairs).")
        analysis.append("Compared local GeoJSON geometry with features queried from the public GIS service by the local data extent." if not repository.is_local_layer(intent.target_layer)
                        else "Compared actual geometries from the configured local datasets.")
    elif intent.type in ("ATTRIBUTE_VALIDATION", "SPATIAL_VALIDATION"):
        if intent.type == "ATTRIBUTE_VALIDATION":
            findings = validate_required_attributes(repository, layer or "valves")
            summary = f"Found {len(findings)} records with required-attribute issues."
            features = [_result(layer or "valves", item["feature"], repository=repository) for item in findings[:500]]
            analysis.append("Checked required fields against the configured layer QA rules.")
        else:
            threshold = (intent.distance or 25) * (1000 if intent.distance_unit == "kilometers" else 1)
            findings = validate_asset_location(repository, layer or "valves", threshold, intent.reference_asset_id)
            summary = f"Found {len(findings)} assets with a missing assignment/geometry or more than {threshold:g} meters from their assigned pipeline."
            features = [_result(layer or "valves", item["feature"], item.get("distance_m"), repository) for item in findings[:500]]
            analysis.append("Compared each asset geometry with the geometry of its assigned pipeline.")
    elif intent.type == "IMPACT_SUMMARY":
        if not intent.asset_id:
            clarification = "Which incident or asset ID should I summarize?"
            return CopilotResponse(success=True, intent=intent, summary=clarification, clarification=clarification)
        related = []
        for name in ("incidents", "leak_events", "work_orders", "inspections", "corrosion_records"):
            key = repository.id_field(name)
            for feature in repository.features(name):
                props = feature.get("properties") or {}
                if intent.asset_id in {str(props.get("asset_id")), str(props.get("incident_id")), str(props.get("pipeline_id"))}:
                    related.append(_result(name, feature, repository=repository))
        features = related[:500]
        summary = f"Found {len(related)} linked operational records for {intent.asset_id}. These are synthetic demonstration records."
        warnings.append("Operational records are synthetic demonstration data, not live incident or dispatch information.")
        analysis.append("Matched the supplied ID against incident, leak, maintenance, inspection, and corrosion relationships.")
    else:
        raise HTTPException(status_code=422, detail=f"Unsupported GIS intent: {intent.type}")

    if any(repository.is_local_layer(item.layer)
           and DATASETS[item.layer]["file"].startswith("operational/") for item in features):
        warnings.append("Operational results are synthetic demonstration data, not live operator, incident, or SCADA records.")
    if len(features) >= 500:
        warnings.append("Results are capped at 500 features. Refine the request to narrow the result set.")
    return CopilotResponse(
        success=True, intent=intent, summary=summary, features=features, analysis_geometry=analysis_geometry,
        analysis=analysis, warnings=warnings,
        trust={"fact": summary, "inference": "Spatial proximity or linked records describe data relationships only.",
               "recommendation": "Review relevant records with an authorized GIS or operations professional."},
    )
