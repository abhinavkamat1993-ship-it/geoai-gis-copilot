from pathlib import Path

import pytest

from app.data.repository import GeoJsonRepository


@pytest.fixture
def repository() -> GeoJsonRepository:
    root = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data" / "midstream"
    return GeoJsonRepository(root)
