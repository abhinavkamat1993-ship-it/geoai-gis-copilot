import json
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException
from shapely.geometry import LineString, MultiLineString


DATASETS: dict[str, dict[str, str]] = {
    "valves": {"file": "operational/valves.geojson", "id": "asset_id"},
    "stations": {"file": "operational/stations.geojson", "id": "asset_id"},
    "pipelines": {"file": "operational/pipelines.geojson", "id": "pipeline_id"},
    "pipeline_segments": {"file": "operational/pipeline_segments.geojson", "id": "segment_id"},
    "facilities": {"file": "operational/facilities.geojson", "id": "facility_id"},
    "terminals": {"file": "operational/terminals.geojson", "id": "terminal_id"},
    "incidents": {"file": "operational/incidents.geojson", "id": "incident_id"},
    "leak_events": {"file": "operational/leak_events.geojson", "id": "leak_id"},
    "work_orders": {"file": "operational/work_orders.geojson", "id": "work_order_id"},
    "inspections": {"file": "operational/inspections.geojson", "id": "inspection_id"},
    "corrosion_records": {"file": "operational/corrosion_records.geojson", "id": "corrosion_id"},
    "right_of_way": {"file": "operational/row_records.geojson", "id": "row_id"},
    "environmental_areas": {"file": "operational/environmental_areas.geojson", "id": "environmental_area_id"},
    "operating_areas": {"file": "operational/operating_areas.geojson", "id": "area_id"},
    "public_pipeline_routes": {"file": "reference/pipelines.geojson", "id": "pipeline_id"},
}

REMOTE_LAYERS: dict[str, dict[str, str]] = {
    "public_rivers": {"query_url": "https://3dhp.nationalmap.gov/arcgis/rest/services/usgs_3dhp_all/FeatureServer/50/query", "id": "OBJECTID"},
    "public_waterbodies": {"query_url": "https://3dhp.nationalmap.gov/arcgis/rest/services/usgs_3dhp_all/FeatureServer/60/query", "id": "OBJECTID"},
    "public_roads": {"query_url": "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer/2/query", "id": "OBJECTID"},
}


class GeoJsonRepository:
    def __init__(self, data_root: Path):
        self.data_root = data_root

    def layer_names(self) -> list[str]:
        return list(DATASETS) + list(REMOTE_LAYERS)

    def is_local_layer(self, layer: str) -> bool:
        return layer in DATASETS

    def service_features_near(self, layer: str, geometry) -> list[dict[str, Any]]:
        service = REMOTE_LAYERS.get(layer)
        if service is None:
            raise HTTPException(status_code=422, detail=f"Unknown GIS layer: {layer}")
        if geometry.geom_type in ("LineString", "MultiLineString", "GeometryCollection"):
            lines = [geometry] if isinstance(geometry, LineString) else [part for part in getattr(geometry, "geoms", []) if isinstance(part, LineString)]
            if isinstance(geometry, MultiLineString):
                lines = list(geometry.geoms)
            paths = [[[float(x), float(y)] for x, y, *_ in line.coords] for line in lines if len(line.coords) >= 2]
            query_geometry = json.dumps({"paths": paths, "spatialReference": {"wkid": 4326}})
            geometry_type = "esriGeometryPolyline"
        else:
            xmin, ymin, xmax, ymax = geometry.bounds
            query_geometry = json.dumps({"xmin": xmin, "ymin": ymin, "xmax": xmax, "ymax": ymax})
            geometry_type = "esriGeometryEnvelope"
        params = {
            "geometry": query_geometry,
            "geometryType": geometry_type, "inSR": "4326", "outSR": "4326",
            "spatialRel": "esriSpatialRelIntersects", "returnGeometry": "true",
            "outFields": "*", "f": "geojson", "resultRecordCount": "2000",
        }
        try:
            output: list[dict[str, Any]] = []
            seen_ids: set[str] = set()
            for offset in range(0, 10_000, 2_000):
                response = httpx.post(service["query_url"], data={**params, "resultOffset": str(offset)}, timeout=30.0)
                response.raise_for_status()
                payload = response.json()
                if payload.get("error"):
                    raise ValueError(payload["error"].get("message", "Service query failed"))
                page = payload.get("features")
                if not isinstance(page, list):
                    raise ValueError("Service response did not contain GeoJSON features")
                new_features = []
                for feature in page:
                    identifier = str((feature.get("properties") or {}).get(service["id"], ""))
                    if identifier and identifier in seen_ids:
                        continue
                    if identifier:
                        seen_ids.add(identifier)
                    new_features.append(feature)
                output.extend(new_features)
                if len(page) < 2_000 or not new_features:
                    return output
            raise HTTPException(status_code=503, detail=f"Public GIS service {layer} returned more than 10,000 records; narrow the analysis area.")
        except (httpx.HTTPError, ValueError) as error:
            raise HTTPException(status_code=503, detail=f"Public GIS service {layer} is unavailable: {error}") from error

    def features(self, layer: str) -> list[dict[str, Any]]:
        definition = DATASETS.get(layer)
        if definition is None:
            raise HTTPException(status_code=422, detail=f"Unknown or unsupported layer: {layer}")
        path = self.data_root / definition["file"]
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            features = payload.get("features")
            if not isinstance(features, list):
                raise ValueError("GeoJSON FeatureCollection must contain a features array")
            return features
        except FileNotFoundError as error:
            raise HTTPException(status_code=503, detail=f"Local GIS dataset is unavailable: {layer}") from error
        except (json.JSONDecodeError, ValueError) as error:
            raise HTTPException(status_code=500, detail=f"Malformed GeoJSON dataset: {layer}") from error

    def id_field(self, layer: str) -> str:
        if layer in REMOTE_LAYERS:
            return REMOTE_LAYERS[layer]["id"]
        if layer not in DATASETS:
            raise HTTPException(status_code=422, detail=f"Unknown or unsupported layer: {layer}")
        return DATASETS[layer]["id"]

    def find_by_id(self, layer: str, identifier: str) -> dict[str, Any] | None:
        if layer in REMOTE_LAYERS:
            return None
        field = self.id_field(layer)
        return next((feature for feature in self.features(layer)
                     if str((feature.get("properties") or {}).get(field, "")).casefold() == identifier.casefold()), None)
