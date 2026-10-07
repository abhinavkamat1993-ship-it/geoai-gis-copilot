from fastapi import HTTPException
from pydantic import ValidationError

from app.ai.intent_parser import parse_intent
from app.data.repository import GeoJsonRepository
from app.models.gis import CopilotQuery, CopilotResponse
from app.services.gis_service import execute_intent
from app.services.knowledge_service import KnowledgeService


def answer_query(repository: GeoJsonRepository, request: CopilotQuery,
                 knowledge_service: KnowledgeService | None = None) -> CopilotResponse:
    try:
        intent = parse_intent(request.message, request.selected_location)
    except ValidationError as error:
        message = "That distance is outside the supported range. Use a positive distance up to 500 kilometers."
        return CopilotResponse(success=False, summary=message, clarification=message, warnings=[str(error)])
    if intent is None:
        lower = request.message.casefold()
        if "near" in lower and not any(unit in lower for unit in ("meter", "metre", " km", "kilometer", "kilometre")):
            message = "What search distance should I use? Include an asset ID or select a point on the map as the reference."
        elif "station" in lower and "critical asset" in lower:
            message = "I could not resolve that station name to a record. Use its station ID (for example, STA-2001) or select the station on the map."
        else:
            message = "I could not determine a supported GIS operation. Try a layer name and an action such as find, count, validate, or search within a distance."
        return CopilotResponse(success=False, summary=message, clarification=message)
    # The optional retrieval contract is intentionally unconfigured in this deterministic phase.
    if knowledge_service is not None:
        knowledge_service.retrieve_context(request.message)
    return execute_intent(repository, intent)
