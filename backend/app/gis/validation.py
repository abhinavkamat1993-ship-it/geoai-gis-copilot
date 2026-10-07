from typing import Any

from fastapi import HTTPException

from app.data.repository import GeoJsonRepository
from app.models.gis import GisIntent


FILTERABLE_FIELDS = {
    "status", "criticality", "operating_area", "severity", "incident_type",
    "condition", "priority", "work_type", "pipeline_id", "asset_id", "region",
}


def validate_intent(intent: GisIntent, repository: GeoJsonRepository) -> None:
    for layer in (intent.layer, intent.target_layer):
        if layer and layer not in repository.layer_names():
            raise HTTPException(status_code=422, detail=f"Unknown or unsupported layer: {layer}")
    if intent.filters:
        unsupported = set(intent.filters) - FILTERABLE_FIELDS
        if unsupported:
            raise HTTPException(status_code=422, detail=f"Filtering by these fields is not allowed: {', '.join(sorted(unsupported))}")
        if intent.layer:
            if not repository.is_local_layer(intent.layer):
                raise HTTPException(status_code=422, detail=f"Attribute filters are not available for remote layer: {intent.layer}")
            available = {key for feature in repository.features(intent.layer)
                         for key in (feature.get("properties") or {})}
            missing = set(intent.filters) - available
            if missing:
                raise HTTPException(status_code=422, detail=f"Field not present on {intent.layer}: {', '.join(sorted(missing))}")
    if intent.selected_location:
        lat = intent.selected_location.get("latitude")
        lon = intent.selected_location.get("longitude")
        if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise HTTPException(status_code=422, detail="Selected location must include valid latitude and longitude")


def matches_filters(properties: dict[str, Any], filters: dict[str, Any]) -> bool:
    return all(str(properties.get(field, "")).casefold() == str(value).casefold()
               for field, value in filters.items())
