# Frontend architecture

## Current organization

src/
├── app/
│   ├── App.tsx                    Root composition
│   └── App.css                    Application shell and feature styles
├── core/config/
│   └── mapConfig.ts               Default map view and public-service exploration extent
├── public/data/midstream/
│   ├── reference/                  Clipped public pipeline route snapshot
│   ├── operational/                Linked synthetic GeoJSON demo network
│   ├── snapshots/                  Previous/current valve snapshots and change manifest
│   ├── metadata/                   Dictionary, relationships, sources, and QA cases
│   └── manifest.json               Generated record counts and study extent
├── features/
│   ├── ai/
│   │   ├── components/AiAssistant.tsx
│   │   ├── services/copilotApi.ts and geoJsonGeometry.ts
│   │   └── types/ai.ts
│   ├── gis-tools/
│   │   ├── services/measurementService.ts
│   │   └── types/gisTool.ts
│   ├── layers/
│   │   ├── components/LayerManager.tsx
│   │   ├── services/layerService.ts and connectors.ts
│   │   └── layerDefinitions.ts
│   ├── map/
│   │   ├── components/MapCanvas.tsx
│   │   └── services/symbolService.ts
│   ├── spatial-analysis/
│   │   ├── components/AnalysisResults.tsx
│   │   └── services/bufferService.ts and spatialQueryService.ts
│   └── workspace/
│       ├── components/WorkspaceHeader.tsx
│       ├── GeoAiWorkspace.tsx
│       ├── hooks/useGeoAiWorkspace.ts
│       └── types.ts
├── main.tsx
└── scripts/
    ├── build-midstream-data.mjs    Deterministic synthetic data generator
    └── validate-midstream-data.mjs GeoJSON and relationship validator

## Request and data flow

1. app/App.tsx composes the workspace. GeoAiWorkspace composes feature panels, while useGeoAiWorkspace owns cross-feature state and coordinates their callbacks.
2. LayerManager, MapCanvas, AnalysisResults, and AiAssistant render their respective UI and receive state/actions as props.
3. layerDefinitions.ts is the source catalog: it describes layer identity, owner, provenance class, source type, service URL/layer ID, authentication requirement, freshness, and usage notes. The local DOE/NETL pipeline snapshot is public reference geometry; operational pipeline/asset/maintenance records are synthetic and use separate files and badges. Census/USGS context layers remain live public services.
4. connectors.ts builds queryable ArcGIS layers for GeoJSON and ArcGIS Feature Services. The spatial query service sees a common feature-layer contract and queries user-visible layers.
5. Natural-language Copilot questions go to the FastAPI service in `backend/app`. Its deterministic intent parser validates requests, then calls reusable query/spatial modules against the GeoJSON repository. The API returns features, buffer geometry, analysis steps, trust labels, and warnings; the workspace renders returned geometry and results with ArcGIS. Other map tools and the selected-point buffer remain in their existing frontend services.
6. `scripts/build-midstream-data.mjs` generates deterministic linked operational records from the stored reference route snapshot. `scripts/validate-midstream-data.mjs` checks geometry, required fields, keys, foreign-key links, QA exceptions, and snapshot changes.

## Boundaries and next migration

- The giant App.tsx has been removed from the application entry point. The root App and workspace view are composition-focused; state orchestration lives in a workspace hook.
- Map construction, ArcGIS layer refs, map click/identify orchestration, and the SketchViewModel lifecycle still live in useGeoAiWorkspace.ts. Move these into a useMap/map controller after focused interaction checks; changing those paths together could break the existing map-click workflow.
- Layer visibility remains React-owned and is mirrored into ArcGIS layer instances. Keep this synchronization at the workspace boundary until a dedicated layer state hook is introduced.
- Popups are assembled centrally in layers/services/layerService.ts and use a field list by layer type; preserve the source metadata in public-reference popups and do not display fabricated source fields.
- Data counts and intentional quality issues are generated from the scripts and documented under public/data/midstream/metadata. Do not hand-edit regenerated files unless the generator and validation expectations are updated too.
- Export buttons, notification/profile actions, and several GIS-tools-tab actions are still presentation placeholders; this refactor preserves their prior behavior and does not imply the underlying operations exist.
- The backend reads local GeoJSON and queries the USGS river service for a bounded pipeline-intersection operation. The deterministic parser is not an LLM; no AI credentials are needed. Enterprise authentication and PostGIS are future work.
- Future private ArcGIS Enterprise, database, and asset-management connections must go through a server-side authenticated API or a supported ArcGIS OAuth flow. Never add secrets or long-lived tokens to this Vite client.

## Dependency direction

UI components use feature services through callbacks, but services do not import React components. Layer metadata/configuration is owned by the layer feature; GIS operations consume layer/service contracts and return data, while the workspace decides when to update UI state. This keeps demo sources replaceable without changing the map panels or AI chat UI.
