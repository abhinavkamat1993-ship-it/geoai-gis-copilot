from typing import Any

import geopandas as gpd
from shapely.geometry import Point, mapping

from app.data.repository import GeoJsonRepository
from app.gis.geometry import projected_frame, to_geometry
from app.gis.queries import find_features
from app.gis.validation import matches_filters


def calculate_distance(first: dict[str, Any], second: dict[str, Any]) -> float | None:
    a, b = to_geometry(first), to_geometry(second)
    if a is None or b is None:
        return None
    frame, crs = projected_frame([first, second])
    if len(frame) != 2:
        return None
    return float(frame.geometry.iloc[0].distance(frame.geometry.iloc[1]))


def find_nearby_features(repository: GeoJsonRepository, layer: str, reference: dict[str, Any], distance_m: float,
                         filters: dict[str, Any] | None = None) -> list[tuple[dict[str, Any], float]]:
    reference_geometry = to_geometry(reference)
    if reference_geometry is None:
        return []
    candidates = find_features(repository, layer, filters)
    frame, crs = projected_frame([reference])
    if len(frame) < 1:
        return []
    reference_projected = frame.geometry.iloc[0]
    candidate_geometries = [(feature, to_geometry(feature)) for feature in candidates]
    candidate_geometries = [(feature, geometry) for feature, geometry in candidate_geometries
                            if geometry is not None and not geometry.is_empty]
    if not candidate_geometries:
        return []
    projected = gpd.GeoSeries([geometry for _, geometry in candidate_geometries], crs="EPSG:4326").to_crs(crs)
    output = []
    for index, (feature, _) in enumerate(candidate_geometries):
        distance = float(reference_projected.distance(projected.iloc[index]))
        if distance <= distance_m:
            output.append((feature, distance))
    return output


def buffer_features(repository: GeoJsonRepository, layer: str, location: dict[str, float], distance_m: float,
                    filters: dict[str, Any] | None = None) -> list[tuple[dict[str, Any], float]]:
    point_feature = {"geometry": mapping(Point(location["longitude"], location["latitude"]))}
    return find_nearby_features(repository, layer, point_feature, distance_m, filters)


def create_analysis_buffer(reference: dict[str, Any], distance_m: float, location: dict[str, float] | None = None) -> dict[str, Any] | None:
    geometry = to_geometry(reference) if reference else None
    if geometry is None and location:
        geometry = Point(location["longitude"], location["latitude"])
    if geometry is None:
        return None
    frame, crs = projected_frame([{"geometry": mapping(geometry)}])
    if frame.empty:
        return None
    projected_buffer = frame.geometry.iloc[0].buffer(distance_m)
    geographic_buffer = gpd.GeoSeries([projected_buffer], crs=crs).to_crs("EPSG:4326").iloc[0]
    return mapping(geographic_buffer)


def intersect_layers(repository: GeoJsonRepository, first_layer: str, second_layer: str) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    first, second = repository.features(first_layer), repository.features(second_layer)
    second_geometries = [(item, to_geometry(item)) for item in second]
    second_geometries = [(item, geometry) for item, geometry in second_geometries if geometry is not None]
    return [(item, other) for item in first if (geometry := to_geometry(item)) is not None
            for other, other_geometry in second_geometries if geometry.intersects(other_geometry)]


def validate_asset_location(repository: GeoJsonRepository, layer: str = "valves", threshold_m: float = 25,
                            pipeline_id: str | None = None) -> list[dict[str, Any]]:
    assets = repository.features(layer)
    pipelines = repository.features("pipelines")
    by_id = {str((item.get("properties") or {}).get("pipeline_id")): item for item in pipelines}
    findings = []
    for feature in assets:
        properties = feature.get("properties") or {}
        if pipeline_id and str(properties.get("pipeline_id", "")).casefold() != pipeline_id.casefold():
            continue
        pipeline = by_id.get(str(properties.get("pipeline_id")))
        if not pipeline:
            findings.append({"feature": feature, "distance_m": None, "issue": "Assigned pipeline not found"})
            continue
        distance = calculate_distance(feature, pipeline)
        if distance is None:
            findings.append({"feature": feature, "distance_m": None, "issue": "Missing geometry"})
        elif distance > threshold_m:
            findings.append({"feature": feature, "distance_m": distance, "issue": "Asset is farther than the configured threshold from its assigned pipeline"})
    return findings


def find_pipeline_asset_mismatches(repository: GeoJsonRepository, layer: str = "valves",
                                   threshold_m: float = 25) -> list[dict[str, Any]]:
    return validate_asset_location(repository, layer, threshold_m)


def validate_required_attributes(repository: GeoJsonRepository, layer: str) -> list[dict[str, Any]]:
    required = {"valves": ("asset_id", "status", "pipeline_id"), "incidents": ("incident_id", "status", "asset_id"),
                "pipelines": ("pipeline_id", "pipeline_type", "status")}.get(layer, ())
    findings = []
    for feature in repository.features(layer):
        properties = feature.get("properties") or {}
        missing = [field for field in required if properties.get(field) in (None, "")]
        if missing:
            findings.append({"feature": feature, "issue": f"Missing required fields: {', '.join(missing)}"})
    return findings


def summarize_features(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"count": len(features), "layers": sorted({item.get("layer", "") for item in features})}
