from fastapi import APIRouter, Depends

from app.data.repository import GeoJsonRepository
from app.models.gis import CopilotQuery, CopilotResponse
from app.services.copilot_service import answer_query
from app.api.routes.gis import get_repository

router = APIRouter(prefix="/api/copilot", tags=["copilot"])


@router.post("/query", response_model=CopilotResponse)
def query_copilot(request: CopilotQuery, repository: GeoJsonRepository = Depends(get_repository)):
    return answer_query(repository, request)
