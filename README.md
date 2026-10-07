# GeoAI Copilot

An enterprise-style GIS workspace prototype for midstream oil and gas operations. It combines an ArcGIS map, layer management, spatial analysis, and a rule-based natural-language query assistant.

> **Project status:** the React frontend uses a deterministic FastAPI GIS Copilot backend. The parser is not an LLM. Bundled midstream operational datasets are synthetic demonstration GeoJSON. A small set of U.S. Census and USGS reference layers use public ArcGIS services. There is no ArcGIS Enterprise authentication or database integration yet.

## Contents

- [Run the application](#run-the-application)
- [Project layout](#project-layout)
- [Where to change a feature](#where-to-change-a-feature)
- [How the application works](#how-the-application-works)
- [Data sources and trust labels](#data-sources-and-trust-labels)
- [Important development notes](#important-development-notes)
- [More documentation](#more-documentation)

## Run the application

Start the backend and frontend in separate terminals. Use Python 3.11+ and Node.js/npm compatible with the installed Vite version.

```powershell
cd frontend
npm install
npm run dev
```

In a second terminal, follow [`backend/README.md`](backend/README.md) to create a Python environment and start FastAPI on port 8000. Set `VITE_GIS_API_URL` in `frontend/.env.local` if the API uses a different address.

Vite prints the local address after startup. The other available scripts, run from `frontend/`, are:

```powershell
npm run build    # TypeScript project build and optimized Vite build
npm run lint     # ESLint
npm run preview  # Serve the production build locally
```

## Project layout

```text
GeoAI-Copilot/
├── README.md                         # This project guide and file finder
├── docs/
│   ├── architecture.md               # Frontend boundaries, data flow, and migration notes
│   └── data-sources-and-connectors.md # Data provenance, public services, and access limits
├── backend/
│   ├── app/                          # FastAPI routes, controlled intent parsing, GIS engine, GeoJSON repository
│   ├── tests/                        # GIS and Copilot behavior checks
│   ├── requirements.txt              # Python runtime and test dependencies
│   └── README.md                     # Backend setup and API guide
└── frontend/
    ├── package.json                  # Dependencies and dev/build/lint scripts
    ├── vite.config.ts                # Vite development/build configuration
    ├── tsconfig*.json                # TypeScript configuration
    ├── index.html                    # Browser entry document
    ├── public/data/midstream/
    │   ├── reference/                # Clipped public pipeline route reference snapshot
    │   ├── operational/              # Linked synthetic operations GeoJSON
    │   ├── snapshots/                # Previous/current valve snapshots and change manifest
    │   ├── metadata/                 # Dictionary, relationships, QA rules, and sources
    │   └── manifest.json             # Generated counts and study extent
    ├── src/
        ├── main.tsx                  # React bootstrap and global ArcGIS setup
        ├── index.css                 # Global/reset styles
        ├── app/
        │   ├── App.tsx               # Root app composition
        │   └── App.css               # Workspace, panels, map overlays, and feature styles
        ├── core/config/
        │   └── mapConfig.ts           # Initial map extent, basemap, and public-service extent
        └── features/
            ├── ai/                   # Chat UI, backend API client, and chat types
            ├── gis-tools/            # GIS tool identifiers/types and measurement helpers
            ├── layers/               # Layer catalog, source connectors, layer UI/helpers
            ├── map/                  # Map UI and graphic symbol factories
            ├── spatial-analysis/     # Buffer/query operations and result panel
            └── workspace/            # Workspace composition, shared state, and orchestration
    └── scripts/
        ├── build-midstream-data.mjs  # Deterministically rebuild the synthetic datasets
        └── validate-midstream-data.mjs # Check GeoJSON, links, counts, and snapshots
```

### Feature file map

| Folder / file | Responsibility |
|---|---|
| `frontend/src/main.tsx` | Starts React, loads global styles, and initializes ArcGIS/Calcite web components. |
| `frontend/src/app/App.tsx` | Application entry component; composes `GeoAiWorkspace`. |
| `frontend/src/app/App.css` | Main visual system and layout styles. Search here for panel widths, layer typography, map controls, responsive layout, and chat/result styles. |
| `frontend/src/core/config/mapConfig.ts` | Default map center/zoom/basemap and bounded extent used when zooming to U.S. public-service layers. |
| `frontend/src/features/workspace/GeoAiWorkspace.tsx` | Connects the workspace hook to the layer panel, map, analysis results, and assistant components. Mostly composition; keep business logic in the hook/services. |
| `frontend/src/features/workspace/hooks/useGeoAiWorkspace.ts` | Cross-feature state and orchestration: map/layer lifecycle, visibility sync, map click and selected point, location search/current location, buffer toggle, drawing/identify interactions, chat submission, and result graphics. This is the most sensitive integration point. |
| `frontend/src/features/workspace/types.ts` | Shared types used across workspace components and state. |
| `frontend/src/features/workspace/components/WorkspaceHeader.tsx` | Top application header and global question/search input. |
| `frontend/src/features/layers/layerDefinitions.ts` | Central layer registry: names, categories, source URLs, provenance/status, query aliases, and per-layer metadata. Add or edit layer entries here. |
| `frontend/src/features/layers/connectors.ts` | Turns a registry entry into a queryable ArcGIS `GeoJSONLayer` or `FeatureLayer`. Add connector support here when adding a new source format. |
| `frontend/src/features/layers/services/layerService.ts` | Layer operations such as lookup, zoom-to-layer extent, and associated layer helpers. |
| `frontend/src/features/layers/components/LayerManager.tsx` | Left panel: layer categories, search, visibility toggles, collapse/expand, zoom action, and add-layer UI. Receives state and callbacks from the workspace. |
| `frontend/src/features/map/components/MapCanvas.tsx` | ArcGIS map element and map-facing controls: location search, zoom, current location, Street View action, buffer toggle, basemap selector, map legend, and clear action. |
| `frontend/src/features/map/services/symbolService.ts` | Shared ArcGIS symbols for selected location, result features, and other map graphics. |
| `frontend/src/features/spatial-analysis/services/bufferService.ts` | Creates the geodesic buffer geometry used for distance analysis. |
| `frontend/src/features/spatial-analysis/services/spatialQueryService.ts` | Queries visible/queryable layers, filters spatial matches, and produces result/source summaries. |
| `frontend/src/features/spatial-analysis/components/AnalysisResults.tsx` | Analysis counts, radius/status, result table/export actions, and clear-results UI. |
| `frontend/src/features/ai/services/copilotApi.ts` | Sends a user question and optional map point to the FastAPI service. |
| `frontend/src/features/ai/services/geoJsonGeometry.ts` | Converts backend GeoJSON geometries into ArcGIS geometry objects for map display. |
| `frontend/src/features/ai/types/ai.ts` | Copilot request/response and chat message types. |
| `frontend/src/features/ai/components/AiAssistant.tsx` | Chat, history/tools tabs, suggested prompts, and message input UI. |
| `frontend/src/features/gis-tools/types/gisTool.ts` | Available map tool IDs and shared GIS tool types. |
| `frontend/src/features/gis-tools/services/measurementService.ts` | Distance/area measurement calculations and related measurement helpers. Sketch/drawing lifecycle coordination currently remains in the workspace hook. |
| `frontend/public/data/midstream/reference/pipelines.geojson` | Clipped DOE/NETL public route snapshot with source-published fields only. |
| `frontend/public/data/midstream/operational/` | Synthetic pipelines, segments, valves, stations, terminals, facilities, incidents, work orders, inspections, corrosion, ROW, and areas. |
| `frontend/public/data/midstream/snapshots/` | Previous/current valve snapshots and an explicit five-change manifest. |
| `frontend/public/data/midstream/metadata/` | Data dictionary, relationships, source registry, and intentional QA cases/rules. |
| `frontend/scripts/build-midstream-data.mjs` | Rebuilds the deterministic synthetic records from the stored public route snapshot. |
| `frontend/scripts/validate-midstream-data.mjs` | Checks GeoJSON, IDs, foreign keys, record counts, metadata, and snapshot changes. |

## Where to change a feature

| If you want to change… | Start here | Also check |
|---|---|---|
| App layout, left/right panel width, spacing, colors, or typography | `frontend/src/app/App.css` | `GeoAiWorkspace.tsx` if the component arrangement itself changes |
| A layer's displayed name, category, source, badge/provenance, or query aliases | `frontend/src/features/layers/layerDefinitions.ts` | `docs/data-sources-and-connectors.md` for source requirements and caveats |
| A local GeoJSON dataset | `frontend/public/data/midstream/` | Update the registry and run `npm run data:build` if generated synthetic data changes |
| A public ArcGIS Feature Service | `layerDefinitions.ts` | `connectors.ts`; then verify actual service schema, permissions, CORS, and query behavior |
| Layer panel controls or layer row appearance | `frontend/src/features/layers/components/LayerManager.tsx` | `frontend/src/app/App.css` for styling; workspace hook for behavior |
| Zoom-to-layer behavior | `frontend/src/features/layers/services/layerService.ts` | `useGeoAiWorkspace.ts` for the action flow and `mapConfig.ts` for bounded service extents |
| Map buttons, map search UI, basemap menu, or map overlays | `frontend/src/features/map/components/MapCanvas.tsx` | `useGeoAiWorkspace.ts` for the action implementation; `App.css` for appearance |
| Initial map location or zoom | `frontend/src/core/config/mapConfig.ts` | `useGeoAiWorkspace.ts` where the map view is created |
| Map click, chosen location, location search, current location, Street View, or draw/identify interaction | `frontend/src/features/workspace/hooks/useGeoAiWorkspace.ts` | `MapCanvas.tsx` for controls and `symbolService.ts` for graphics |
| Buffer radius/geometry | `frontend/src/features/spatial-analysis/services/bufferService.ts` | Workspace query flow and buffer graphics in `useGeoAiWorkspace.ts` |
| Which visible layers/features are queried or how results are summarized | `frontend/src/features/spatial-analysis/services/spatialQueryService.ts` | `useGeoAiWorkspace.ts` for invoking the query and updating UI state |
| Supported natural-language query patterns and intent validation | `backend/app/ai/intent_parser.py` and `backend/app/gis/validation.py` | GIS operations in `backend/app/gis/` |
| Chat layout, history, suggested prompts, or message rendering | `frontend/src/features/ai/components/AiAssistant.tsx` | `App.css` for visual styles; workspace hook for behavior |
| Analysis cards or result table UI | `frontend/src/features/spatial-analysis/components/AnalysisResults.tsx` | `useGeoAiWorkspace.ts` for result data and `spatialQueryService.ts` for summary logic |
| Available GIS tools or measurement behavior | `gis-tools/types/gisTool.ts` and `gis-tools/services/measurementService.ts` | Sketch interaction setup in `useGeoAiWorkspace.ts` |

**Safe-change note:** keep `MapCanvas` focused on rendering and callbacks, keep data/query operations in services, and use `useGeoAiWorkspace` to coordinate state. Map click, selected-point, buffer, and sketch behavior are linked there; make focused changes and preserve existing callbacks unless the behavior itself must change.

## How the application works

```text
User action / question
        ↓
GeoAiWorkspace + useGeoAiWorkspace (shared state and orchestration)
        ├── LayerManager → layer registry → ArcGIS layer connector
        ├── MapCanvas → ArcGIS MapView and map graphics
        ├── AiAssistant → FastAPI Copilot API client
        └── Backend GIS engine → query results → map + result panel
```

The Copilot spatial question flow is:

1. React sends the message and optional selected map point to `POST /api/copilot/query`.
2. FastAPI parses a constrained intent, validates layer/fields/IDs/filters, and dispatches a backend GIS operation.
3. GeoPandas/PyProj project features before metric distance operations; Shapely performs geometry comparisons and buffers.
4. The API returns results, analysis steps, trust labels, and warnings; React converts returned GeoJSON into ArcGIS graphics and presents the result table.

The map interaction lifecycle is coordinated by `useGeoAiWorkspace.ts`. `MapCanvas.tsx` forwards events and displays controls; it should not independently own duplicate map/query state.

## Data sources and trust labels

- The local DOE/NETL pipeline routes are a bounded public reference snapshot. The bundled operational pipelines and all maintenance/incident records are **synthetic demo** data derived around those routes; they are not company records and must not be used for dispatch, integrity, environmental, or safety decisions.
- U.S. Census TIGERweb roads/counties and USGS 3D Hydrography are live public reference services. They have U.S. coverage, depend on external service availability, and may not be suitable for operational decisions.
- The registry in `layerDefinitions.ts` is the source of truth for app layer metadata and labels. `docs/data-sources-and-connectors.md` describes coverage, access, limitations, and future connector guidance.
- Keep new demo data explicitly marked as demo/simulated. Do not imply that a layer is live simply because it is visible in the map.
- Private ArcGIS Enterprise, operator pipeline, Maximo, work order, or incident data is not connected. Add authenticated enterprise access through an approved ArcGIS OAuth flow or a server-side API; never put credentials or long-lived tokens in frontend code.
- Rebuild the dataset with `npm run data:build` and validate it with `npm run data:validate` from `frontend/`.

## Important development notes

- Natural-language interpretation is deterministic and runs in the backend. No LLM provider is connected, and no credentials are required. Only predefined GIS operations can be invoked.
- Public service intersection requests depend on network availability. A failed service query is reported as unavailable, not as zero intersections.
- ArcGIS map/layer instances are imperative objects. Keep their lifecycle and event handlers coordinated in the workspace hook to avoid duplicate views or stale references.
- Visibility is React-owned and mirrored to ArcGIS layer instances. When changing layer toggles, preserve that synchronization.
- Some header/export/tool actions are UI placeholders. Check their callback implementations before assuming a visible control performs a complete operation.
- Do not hardcode private URLs, tokens, API keys, or credentials in `frontend/src` or `frontend/public`.

## More documentation

- [Frontend architecture and data flow](docs/architecture.md)
- [FastAPI backend setup and endpoints](backend/README.md)
- [Data sources, trust labels, and connector guidance](docs/data-sources-and-connectors.md)
- [Frontend package scripts and dependencies](frontend/package.json)
