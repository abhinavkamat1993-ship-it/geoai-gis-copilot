# GeoAI Copilot API

The backend owns deterministic query interpretation and spatial calculations. The React/ArcGIS frontend remains responsible for mapping and user interaction.

## Setup

Use Python 3.11 or newer. From this folder:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

The default data path points to the checked-in GeoJSON under `frontend/public/data/midstream`. Override `GIS_DATA_ROOT` in `.env` when needed. No database or AI credentials are required for the deterministic prototype.

## Run

```powershell
uvicorn app.main:app --host 127.0.0.1 --reload --port 8000 --env-file .env
```

Health check: `GET http://127.0.0.1:8000/health`.

## API

- `POST /api/copilot/query` accepts `{ "message": "Find active valves within 500 meters of INC-2001", "selected_location": { "latitude": 31.7, "longitude": -102.9 } }`.
- `GET /api/gis/layers` lists locally supported layers.

The natural-language parser is deterministic; no LLM provider is connected. Results are computed from local GeoJSON and capped at 500 returned features. Pipeline–river intersection requests query the USGS river service using the local pipeline geometries; that query depends on external network availability. Other public context services are not queried by the backend. Operational records remain synthetic demonstration data.

## Validate

```powershell
pytest
```

See [the root project guide](../README.md) and [data source notes](../docs/data-sources-and-connectors.md) for the frontend and data foundation.
