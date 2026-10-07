from typing import Any

from app.data.repository import GeoJsonRepository
from app.gis.validation import matches_filters


def find_features(repository: GeoJsonRepository, layer: str, filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    if not repository.is_local_layer(layer):
        raise ValueError(f"Attribute search is not available for remote layer: {layer}")
    return [feature for feature in repository.features(layer)
            if matches_filters(feature.get("properties") or {}, filters or {})]


def filter_features(repository: GeoJsonRepository, layer: str, filters: dict[str, Any]) -> list[dict[str, Any]]:
    return find_features(repository, layer, filters)


def get_feature_by_id(repository: GeoJsonRepository, layer: str, identifier: str) -> dict[str, Any] | None:
    return repository.find_by_id(layer, identifier)


def count_features(repository: GeoJsonRepository, layer: str, filters: dict[str, Any] | None = None) -> int:
    return len(find_features(repository, layer, filters))
