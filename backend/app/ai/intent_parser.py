import re

from app.models.gis import GisIntent


LAYER_TERMS = {
    "valves": ("valves", "valve"),
    "stations": ("pump stations", "compressor stations", "stations", "station"),
    "pipelines": ("pipelines", "pipeline"),
    "pipeline_segments": ("pipeline segments", "segments"),
    "facilities": ("facilities", "facility"),
    "terminals": ("terminals", "terminal"),
    "incidents": ("incidents", "incident"),
    "leak_events": ("leak events", "leaks", "leak"),
    "work_orders": ("work orders", "work order"),
    "inspections": ("inspections", "inspection"),
    "corrosion_records": ("corrosion records", "corrosion"),
    "right_of_way": ("right of way", "row"),
    "environmental_areas": ("environmental areas", "wetlands", "habitat"),
    "operating_areas": ("operating areas", "operating area"),
    "public_pipeline_routes": ("public pipeline routes", "reference pipelines"),
}

ID_PATTERN = re.compile(r"\b(?:INC|VAL|V|STA|PL|SEG|FAC|TRM|LEAK|WO|INSP|COR|ROW|ENV)-\d+(?:-\d+)?\b", re.I)
DISTANCE_PATTERN = re.compile(r"\b(\d+(?:\.\d+)?)\s*(meters?|metres?|m|kilometers?|kilometres?|km)\b", re.I)


def parse_intent(message: str, selected_location: dict[str, float] | None = None) -> GisIntent | None:
    text = message.strip()
    lower = text.casefold()
    identifier_match = ID_PATTERN.search(text)
    identifier = identifier_match.group(0).upper() if identifier_match else None
    if identifier and identifier.startswith("V-"):
        identifier = "VAL-" + identifier[2:]
    layer = next((name for name, terms in LAYER_TERMS.items()
                  if any(re.search(r"\b" + re.escape(term) + r"\b", lower) for term in terms)), None)
    distance_match = DISTANCE_PATTERN.search(lower)
    distance = float(distance_match.group(1)) if distance_match else None
    unit = "kilometers" if distance_match and distance_match.group(2).lower() in ("km", "kilometer", "kilometers", "kilometre", "kilometres") else "meters"
    filters: dict[str, str] = {}
    for field, values in {
        "status": ("active", "inactive", "open", "closed", "completed", "under maintenance"),
        "criticality": ("critical", "high", "moderate", "low"),
        "severity": ("critical", "high", "moderate", "low"),
    }.items():
        found = next((value for value in values if re.search(r"\b" + re.escape(value) + r"\b", lower)), None)
        if found:
            filters[field] = found.title()
            break
    area_match = re.search(r"\bin\s+([a-z][a-z -]*\barea)\b", lower)
    if area_match:
        filters["operating_area"] = area_match.group(1).title()
    if "more than" in lower and layer == "valves" and "pipeline" in lower:
        return GisIntent(type="SPATIAL_VALIDATION", layer="valves", distance=distance or 25, distance_unit=unit)
    if "cross" in lower and layer:
        target_layer = "public_rivers" if "river" in lower else "public_roads" if "road" in lower else None
        return GisIntent(type="INTERSECT_ANALYSIS", layer=layer, target_layer=target_layer)
    if "associated with" in lower and identifier:
        return GisIntent(type="IMPACT_SUMMARY", asset_id=identifier, reference_asset_id=identifier)
    if "impact" in lower or "affected" in lower:
        return GisIntent(type="IMPACT_SUMMARY", asset_id=identifier, reference_asset_id=identifier)
    if "validate" in lower:
        kind = "SPATIAL_VALIDATION" if "near" in lower or "distance" in lower else "ATTRIBUTE_VALIDATION"
        return GisIntent(type=kind, layer=layer or "valves", reference_asset_id=identifier, distance=distance, distance_unit=unit)
    if "near" in lower and distance is None:
        return None
    if ("critical asset" in lower and re.search(r"\bof\s+station\b", lower)
            and identifier is None):
        return None
    if identifier and distance is not None:
        return GisIntent(type="NEARBY_ASSETS", layer=layer, reference_asset_id=identifier,
                         distance=distance, distance_unit=unit, filters=filters)
    if distance is not None and selected_location:
        return GisIntent(type="BUFFER_ANALYSIS", layer=layer, distance=distance,
                         distance_unit=unit, selected_location=selected_location, filters=filters)
    if identifier and layer and (lower.startswith("find") or lower.startswith("show") or lower.startswith("get")):
        return GisIntent(type="ASSET_DETAILS", layer=layer, asset_id=identifier)
    if identifier and not layer:
        return GisIntent(type="ASSET_DETAILS", asset_id=identifier)
    if layer and "count" in lower:
        return GisIntent(type="COUNT_ASSETS", layer=layer, filters=filters)
    if layer and filters:
        return GisIntent(type="FILTER_ASSETS", layer=layer, filters=filters)
    if layer and distance is not None:
        return GisIntent(type="BUFFER_ANALYSIS", layer=layer, distance=distance,
                         distance_unit=unit, selected_location=selected_location, filters=filters)
    if layer:
        return GisIntent(type="FIND_ASSETS", layer=layer, filters=filters)
    return None
