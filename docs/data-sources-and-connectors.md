# Midstream data foundation and sources

**Snapshot date:** 2026-10-07. Service metadata and availability can change; refresh this review before a production release.

## Current data foundation

The study region is a bounded Midland–Odessa area in the Permian Basin, Texas. The repository contains a small clipped public pipeline route snapshot and a deterministic, linked synthetic operational network. Public reference geography and synthetic operational records are kept separate in the folder structure, layer registry, GeoJSON properties, source registry, and UI source badges.

```text
frontend/public/data/midstream/
├── reference/pipelines.geojson       # Public DOE/NETL route geometry and available source fields
├── operational/                      # Synthetic demo assets and operations records
├── snapshots/previous/valves.geojson  # Snapshot used for change demonstrations
├── snapshots/current/valves.geojson
├── snapshots/change_manifest.json
├── metadata/
│   ├── data_dictionary.json
│   ├── relationships.json
│   ├── source_registry.json
│   └── qa_rules.json
└── manifest.json
```

The public pipeline snapshot contains 120 clipped features across DOE/NETL service layers for HGL, petroleum products, crude oil trunk, and natural gas pipelines. The service publishes limited attributes. The local `pipeline_id` is a stable key derived from the source layer and feature identifier; operator, pipeline name, and reported length fields are null when absent from source. Route geometry is clipped to the study area, and every local route identifies the originating service and access date. It must not be treated as a complete or current operator asset inventory. [DOE/NETL EIA Pipeline Feature Service](https://arcgis.netl.doe.gov/server/rest/services/Hosted/EIA_pipeline_data/FeatureServer)

The 14 operational GeoJSON datasets are synthetic and link back to this public geography. Generated line/asset identities, operator labels, pressures, status, work, inspection, incident, and leak attributes are scenarios for demonstrations only. `leak_events.geojson` is not SCADA. Synthetic pipeline geometry uses public route geometry as a spatial anchor and explicitly records `geometry_source_type: public_reference_derived`.

The local build has about 1,770 features (exact current counts are in `manifest.json`). Public road, river/stream, waterbody, and county layers are live services and are queried by the ArcGIS SDK on demand, so national context data is not bundled in the browser app.

## Dataset inventory

| Dataset | Class | Geometry | Current count / delivery | Key relationships |
|---|---|---|---:|---|
| `reference/pipelines` | Public reference snapshot | Line | 120 | Public service layer + source feature ID |
| `reference/roads` | Public reference | Line | Live Census TIGERweb layer 2 | External map service |
| `reference/rivers` | Public reference | Line | Live USGS 3DHP layer 50 | External map service |
| `reference/water_bodies` | Public reference | Polygon | Live USGS 3DHP layer 60 | External map service |
| `reference/administrative_areas` | Public reference | Polygon | Live Census TIGERweb county layer 1 | External map service |
| `operational/pipelines` | Synthetic demo | Line | 100 | Links to public route reference |
| `operational/pipeline_segments` | Synthetic demo | Line | 300 | `pipeline_id` → pipelines |
| `operational/valves` | Synthetic demo | Point | 181 including duplicate QA feature | `pipeline_id`, `segment_id` |
| `operational/stations` | Synthetic demo | Point | 48 | `pipeline_id`, `segment_id` |
| `operational/terminals` | Synthetic demo | Point | 12 | `pipeline_id`, `segment_id` |
| `operational/facilities` | Synthetic demo | Point | 30 | `pipeline_id`, `segment_id` |
| `operational/incidents` | Synthetic demo | Point/null QA case | 101 | Asset, pipeline, segment |
| `operational/leak_events` | Synthetic demo | Point | 55 | Incident, asset, pipeline |
| `operational/work_orders` | Synthetic demo | Point | 270 | Asset, pipeline |
| `operational/inspections` | Synthetic demo | Point | 330 | Asset, pipeline |
| `operational/corrosion_records` | Synthetic demo | Point | 110 | Inspection, asset, pipeline |
| `operational/row_records` | Synthetic demo | Polygon | 100 | Pipeline |
| `operational/operating_areas` | Synthetic demo | Polygon | 4 | `operating_area` names |
| `operational/environmental_areas` | Synthetic demo | Polygon | 8 | Related pipeline and area |

This is 19 datasets when the four live public context services are counted. The local record total exceeds 1,000 before snapshot copies. Exact generated totals are written by the build script rather than maintained by hand.

## Relationship model

```text
Public reference route
        │ reference_pipeline_id
        ▼
Pipeline → Pipeline Segments → Valves
    │            │               ├── Inspections → Corrosion Records
    │            │               ├── Work Orders
    │            │               ├── Incidents → Leak Events
    │            │               └── Stations / Terminals / Facilities
    ├── ROW Records
    └── Operating Area
```

The authoritative machine-readable key contract is `metadata/relationships.json`. Except for explicitly documented QA cases, generated references resolve to records in the parent dataset. Geometry-derived distances use the generator's haversine calculations or ArcGIS geodesic operators; the code does not interpret raw degrees as meters.

## Controlled QA examples

`metadata/qa_rules.json` records each intentional test case and its rule:

- `VAL-1105`: 45 m from assigned pipeline, beyond the 25 m tolerance.
- `SEG-1010-2`: an 80 m gap from the prior segment endpoint.
- `VAL-1001`: duplicate valve ID.
- `VAL-1106` and `VAL-1107`: missing required attributes.
- `INC-2101`: null GeoJSON geometry and an unresolved asset reference.
- `WO-7270`: unresolved asset reference.
- `INSP-5330`: unresolved asset reference.
- Snapshot `VAL-1003`: documented pipeline relationship change.

These cases are a very small minority of records. Null geometry is legal GeoJSON, but the operational QA rule deliberately flags it. The validator allows only documented exceptions and fails on other broken links or malformed geometry.

## Snapshot changes

The previous and current valve snapshot each contain 12 records. The manifest documents five controlled changes: status updated (`VAL-1001`), 35 m geometry movement (`VAL-1002`), pipeline relationship changed (`VAL-1003`), deletion (`VAL-1004`), and addition (`VAL-1013`). These are fixture records for a later change-detection feature, not historical enterprise edits.

## Public source details and limits

| Dataset | Source and layer | Use and limitations |
|---|---|---|
| Pipeline routes | DOE/NETL EIA pipeline FeatureServer layers 0–3 | Public U.S. route reference with limited attributes; local snapshot is clipped to the study area. Do not infer private asset details or rely on it for operational routing. |
| Roads | U.S. Census TIGERweb Transportation MapServer layer 2 | Public primary roads; periodic census geography, not a dispatch-grade road network. [TIGERweb Transportation](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer) |
| Rivers/streams | USGS 3D Hydrography FeatureServer layer 50 | Public flowline network; 3DHP and legacy NHD coverage can coexist. [USGS 3DHP](https://3dhp.nationalmap.gov/arcgis/rest/services/usgs_3dhp_all/FeatureServer) |
| Water bodies | USGS 3D Hydrography FeatureServer layer 60 | Public reference waterbodies; not survey-grade or a regulatory determination. |
| County boundaries | U.S. Census TIGERweb State_County MapServer layer 1 | Public county boundaries; Census vintages can change. [TIGERweb State/County](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer) |

The API services are external dependencies and the app has not established production uptime, service terms, or CORS guarantees. A network/service failure must be surfaced as a failed source, not reported as zero matching features. The spatial query summary now distinguishes service query failures from empty results.

## Connector and security design

`layerDefinitions.ts` is the UI's central catalog. `connectors.ts` creates local `GeoJSONLayer` or remote `FeatureLayer` instances; map panels and the spatial-query service use the same ArcGIS layer contract. This keeps data source selection out of React components.

The data builder is `frontend/scripts/build-midstream-data.mjs`. It reads the saved public route snapshot and deterministically generates linked synthetic layers. Rebuild and validate from `frontend/`:

```powershell
npm run data:build
npm run data:validate
```

Authenticated ArcGIS Enterprise, SCADA, IoT, Maximo, and operator data are not connected. Future access should use organization-approved OAuth or a server-side API with authorization, audit, and query limits. Never place credentials or long-lived tokens in Vite source or browser storage.
