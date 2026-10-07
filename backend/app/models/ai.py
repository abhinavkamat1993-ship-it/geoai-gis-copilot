from typing import Protocol

from app.models.gis import GisIntent


class AIProvider(Protocol):
    """Constrained provider contract; implementations return data, never executable code."""

    async def parse_intent(self, message: str) -> GisIntent: ...

    async def generate_explanation(self, facts: dict[str, object]) -> str: ...
