from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import copilot, gis
from app.config.settings import get_settings
from app.data.repository import GeoJsonRepository

settings = get_settings()
app = FastAPI(title="GeoAI Copilot API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings["frontend_origins"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)
app.state.repository = GeoJsonRepository(settings["data_root"])
app.include_router(copilot.router)
app.include_router(gis.router)


@app.get("/health")
def health():
    return {"status": "ok"}
