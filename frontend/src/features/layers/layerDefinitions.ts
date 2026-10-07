export type LayerSourceClass = 'AUTHORITATIVE' | 'PUBLIC' | 'DEMO' | 'SIMULATED' | 'INTERNAL ENTERPRISE' | 'UNAVAILABLE'
export type LayerSourceType = 'GeoJSON' | 'ArcGIS Feature Service'

export type LayerDefinition = {
  id: string
  name: string
  category: string
  sourceType: LayerSourceType
  sourceClass: LayerSourceClass
  dataOwner: string
  url: string
  serviceLayerId?: number
  queryTerms?: string[]
  requiresAuthentication: boolean
  lastUpdated: string | null
  refreshFrequency: string
  dataStatus: 'demo' | 'live-service' | 'access-required'
  usageNotes: string
}

const syntheticLayer = (
  id: string,
  name: string,
  category: string,
  dataset: string,
  queryTerms: string[] = [],
): LayerDefinition => ({
  id,
  name,
  category,
  sourceType: 'GeoJSON',
  sourceClass: 'DEMO',
  dataOwner: 'Generated GeoAI Copilot demonstration data',
  url: `/data/midstream/operational/${dataset}.geojson`,
  queryTerms,
  requiresAuthentication: false,
  lastUpdated: '2026-10-07',
  refreshFrequency: 'Regenerate with npm run data:build',
  dataStatus: 'demo',
  usageNotes: 'Synthetic operational demonstration records; not real operator, SCADA, integrity, safety, or dispatch data.',
})

const publicGeoJson = (
  id: string,
  name: string,
  category: string,
  dataOwner: string,
  url: string,
  usageNotes: string,
  lastUpdated: string | null,
  queryTerms: string[] = [],
): LayerDefinition => ({
  id,
  name,
  category,
  sourceType: 'GeoJSON',
  sourceClass: 'AUTHORITATIVE',
  dataOwner,
  url,
  queryTerms,
  requiresAuthentication: false,
  lastUpdated,
  refreshFrequency: 'Curated public snapshot; source refresh date not reported',
  dataStatus: 'demo',
  usageNotes,
})

const publicFeatureService = (
  id: string,
  name: string,
  dataOwner: string,
  url: string,
  serviceLayerId: number,
  refreshFrequency: string,
  usageNotes: string,
  queryTerms: string[] = [],
): LayerDefinition => ({
  id,
  name,
  category: 'Context',
  sourceType: 'ArcGIS Feature Service',
  sourceClass: 'AUTHORITATIVE',
  dataOwner,
  url,
  serviceLayerId,
  queryTerms,
  requiresAuthentication: false,
  lastUpdated: null,
  refreshFrequency,
  dataStatus: 'live-service',
  usageNotes,
})

export const layerDefinitions: LayerDefinition[] = [
  publicGeoJson(
    'public-pipeline-routes', 'Public Pipeline Routes', 'Infrastructure', 'U.S. DOE / NETL (EIA source data)',
    '/data/midstream/reference/pipelines.geojson',
    'Public route reference snapshot clipped to Midland–Odessa. Source data does not publish a complete set of operator attributes.',
    null, ['public pipeline routes', 'reference pipelines'],
  ),
  syntheticLayer('pipelines', 'Pipelines (Demo)', 'Infrastructure', 'pipelines', ['pipelines', 'pipeline', 'demo pipelines']),
  syntheticLayer('pipeline-segments', 'Pipeline Segments', 'Infrastructure', 'pipeline_segments', ['pipeline segments', 'segments']),
  syntheticLayer('valves', 'Valves', 'Infrastructure', 'valves', ['valves', 'valve']),
  syntheticLayer('stations', 'Stations', 'Infrastructure', 'stations', ['stations', 'station', 'pump stations', 'compressor stations', 'metering stations']),
  syntheticLayer('terminals', 'Terminals', 'Infrastructure', 'terminals', ['terminals', 'terminal']),
  syntheticLayer('facilities', 'Facilities', 'Infrastructure', 'facilities', ['facilities', 'facility']),

  syntheticLayer('incidents', 'Incidents', 'Operations', 'incidents', ['incidents', 'incident']),
  syntheticLayer('leak-events', 'Leak Events', 'Operations', 'leak_events', ['leak events', 'leaks', 'leak']),
  syntheticLayer('work-orders', 'Work Orders', 'Operations', 'work_orders', ['work orders', 'work order']),
  syntheticLayer('inspections', 'Inspections', 'Operations', 'inspections', ['inspections', 'inspection']),
  syntheticLayer('corrosion-records', 'Corrosion Records', 'Operations', 'corrosion_records', ['corrosion records', 'corrosion']),

  syntheticLayer('right-of-way', 'Right of Way (Demo)', 'Context', 'row_records', ['right of way', 'row']),
  publicFeatureService(
    'public-roads', 'Public Roads (U.S. Census)', 'U.S. Census Bureau',
    'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer', 2,
    'Periodic TIGER geography releases; consult live service metadata',
    'U.S. primary roads for reference. Not a dispatch-grade routing network.',
    ['roads', 'road', 'highways', 'highway', 'streets'],
  ),
  publicFeatureService(
    'public-rivers', 'Rivers and Streams (USGS 3DHP)', 'U.S. Geological Survey',
    'https://3dhp.nationalmap.gov/arcgis/rest/services/usgs_3dhp_all/FeatureServer', 50,
    'Periodic service updates; consult live metadata',
    'Public hydrography reference; coverage includes both 3DHP and legacy NHD where applicable.',
    ['rivers', 'river', 'streams', 'stream', 'flowlines'],
  ),
  publicFeatureService(
    'public-waterbodies', 'Water Bodies (USGS 3DHP)', 'U.S. Geological Survey',
    'https://3dhp.nationalmap.gov/arcgis/rest/services/usgs_3dhp_all/FeatureServer', 60,
    'Periodic service updates; consult live metadata',
    'Public hydrography reference; not survey-grade or a regulatory determination.',
    ['water bodies', 'waterbodies', 'lakes', 'lake', 'ponds'],
  ),
  syntheticLayer('environmental-areas', 'Environmental Areas (Demo)', 'Context', 'environmental_areas', ['environmental areas', 'wetlands', 'habitat']),
  syntheticLayer('operating-areas', 'Operating Areas (Demo)', 'Context', 'operating_areas', ['operating areas', 'operating area']),
  publicFeatureService(
    'administrative-areas', 'County Boundaries (U.S. Census)', 'U.S. Census Bureau',
    'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer', 1,
    'Periodic TIGER geography releases; consult live service metadata',
    'Public county reference boundaries.',
    ['counties', 'county', 'administrative areas'],
  ),
]

export const layerDefinitionByName = new Map(
  layerDefinitions.map((definition) => [definition.name, definition]),
)

export function matchesLayerType(definition: LayerDefinition, featureType: string): boolean {
  const normalizedType = featureType.toLowerCase()
  const singularName = definition.name
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/ies$/, 'y')
    .replace(/s$/, '')
    .toLowerCase()

  return singularName === normalizedType ||
    definition.name.toLowerCase() === normalizedType ||
    definition.queryTerms?.some((term) => term.toLowerCase() === normalizedType) === true
}
