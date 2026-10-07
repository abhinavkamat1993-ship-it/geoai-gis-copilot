from functools import lru_cache
from pathlib import Path
import os


@lru_cache
def get_settings() -> dict[str, object]:
    backend_root = Path(__file__).resolve().parents[2]
    configured_root = os.getenv("GIS_DATA_ROOT", "../frontend/public/data/midstream")
    data_root = Path(configured_root)
    if not data_root.is_absolute():
        data_root = (backend_root / data_root).resolve()
    origins = os.getenv(
        "FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    )
    return {
        "data_root": data_root,
        "frontend_origins": [origin.strip() for origin in origins.split(",") if origin.strip()],
    }
