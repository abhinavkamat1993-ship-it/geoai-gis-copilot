from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


IntentType = Literal[
    "FIND_ASSETS", "FILTER_ASSETS", "NEARBY_ASSETS", "BUFFER_ANALYSIS",
    "INTERSECT_ANALYSIS", "COUNT_ASSETS", "ASSET_DETAILS",
    "ATTRIBUTE_VALIDATION", "SPATIAL_VALIDATION", "IMPACT_SUMMARY",
]


class CopilotQuery(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    selected_location: dict[str, float] | None = None


class GisIntent(BaseModel):
    type: IntentType
    layer: str | None = None
    asset_id: str | None = None
    reference_asset_id: str | None = None
    distance: float | None = Field(default=None, gt=0, le=500_000)
    distance_unit: Literal["meters", "kilometers"] = "meters"
    filters: dict[str, Any] = Field(default_factory=dict)
    target_layer: str | None = None
    selected_location: dict[str, float] | None = None

    @model_validator(mode="after")
    def validate_distance_range(self):
        distance_m = self.distance * (1000 if self.distance_unit == "kilometers" else 1) if self.distance is not None else None
        if distance_m is not None and distance_m > 500_000:
            raise ValueError("Distance cannot exceed 500 kilometers")
        return self


class FeatureResult(BaseModel):
    id: str
    layer: str
    attributes: dict[str, Any]
    geometry: dict[str, Any] | None = None
    distance_m: float | None = None


class CopilotResponse(BaseModel):
    success: bool
    intent: GisIntent | None = None
    summary: str
    features: list[FeatureResult] = Field(default_factory=list)
    analysis_geometry: dict[str, Any] | None = None
    analysis: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    clarification: str | None = None
    trust: dict[str, str] = Field(default_factory=dict)
