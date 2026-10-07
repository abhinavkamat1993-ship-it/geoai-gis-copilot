from fastapi import APIRouter, Depends, Request

from app.data.repository import GeoJsonRepository

router = APIRouter(prefix="/api/gis", tags=["gis"])


def get_repository(request: Request) -> GeoJsonRepository:
    return request.app.state.repository


@router.get("/layers")
def list_layers(repository: GeoJsonRepository = Depends(get_repository)):
    return {"layers": repository.layer_names()}
