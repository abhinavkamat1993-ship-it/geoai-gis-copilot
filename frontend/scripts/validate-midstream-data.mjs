import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDir, '../public/data/midstream')
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8').replace(/^\uFEFF/, ''))
const errors = []
const reports = []
const expected = read('metadata/qa_rules.json').expected_cases
const expectedSet = new Set(expected.map((item) => `${item.dataset}:${item.feature_id}:${item.rule_id}`))
const intentional = (dataset, item, rule) => expectedSet.has(`${dataset.replaceAll('\\', '/')}:${item.id}:${rule}`) || item.properties?.qa_expected_issue === rule
const collection = (relative) => {
  const data = read(relative)
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) errors.push(`${relative}: not a GeoJSON FeatureCollection`)
  return data.features ?? []
}
const datasets = {
  referencePipelines: collection('reference/pipelines.geojson'),
  pipelines: collection('operational/pipelines.geojson'),
  segments: collection('operational/pipeline_segments.geojson'),
  valves: collection('operational/valves.geojson'),
  stations: collection('operational/stations.geojson'),
  terminals: collection('operational/terminals.geojson'),
  facilities: collection('operational/facilities.geojson'),
  incidents: collection('operational/incidents.geojson'),
  leaks: collection('operational/leak_events.geojson'),
  workOrders: collection('operational/work_orders.geojson'),
  inspections: collection('operational/inspections.geojson'),
  corrosion: collection('operational/corrosion_records.geojson'),
  row: collection('operational/row_records.geojson'),
  operatingAreas: collection('operational/operating_areas.geojson'),
  environmentalAreas: collection('operational/environmental_areas.geojson'),
}

const validCoordinate = (coordinate) => Array.isArray(coordinate) && coordinate.length >= 2 &&
  Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]) &&
  coordinate[0] >= -180 && coordinate[0] <= 180 && coordinate[1] >= -90 && coordinate[1] <= 90
const coordinatesValid = (value) => {
  if (!Array.isArray(value)) return false
  if (value.length >= 2 && typeof value[0] === 'number') return validCoordinate(value)
  return value.length > 0 && value.every(coordinatesValid)
}
const geometryValid = (geometry) => {
  if (geometry === null) return true // GeoJSON permits null geometry; the QA rules may still flag it.
  if (!geometry || !['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'].includes(geometry.type)) return false
  if (geometry.type === 'Point') return validCoordinate(geometry.coordinates)
  if (!coordinatesValid(geometry.coordinates)) return false
  if (geometry.type === 'LineString') return geometry.coordinates.length >= 2
  if (geometry.type === 'MultiLineString') return geometry.coordinates.every((line) => line.length >= 2)
  if (geometry.type === 'Polygon') return geometry.coordinates.every((ring) => ring.length >= 4 && JSON.stringify(ring[0]) === JSON.stringify(ring.at(-1)))
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.every((polygon) => polygon.every((ring) => ring.length >= 4 && JSON.stringify(ring[0]) === JSON.stringify(ring.at(-1))))
  return true
}

const geoFiles = []
for (const folder of ['reference', 'operational', 'snapshots/previous', 'snapshots/current']) {
  for (const name of fs.readdirSync(path.join(root, folder))) {
    if (name.endsWith('.geojson')) geoFiles.push(path.join(folder, name))
  }
}
for (const relative of geoFiles) {
  const features = collection(relative)
  for (const item of features) {
    if (item.type !== 'Feature' || !item.properties || !geometryValid(item.geometry)) {
      const marked = item.properties?.qa_expected_issue === 'INVALID_GEOMETRY'
      if (!marked) errors.push(`${relative}: invalid feature/geometry ${item.id ?? '(no feature id)'}`)
    }
    if (item.geometry === null && !intentional(relative, item, 'INVALID_GEOMETRY')) {
      errors.push(`${relative}: undocumented null geometry ${item.id ?? '(no feature id)'}`)
    }
  }
  reports.push({ dataset: relative, records: features.length })
}

const byProp = (features, key) => new Map(features.filter((item) => item.properties?.[key] != null).map((item) => [item.properties[key], item]))
const pipelineIds = new Set(datasets.pipelines.map((item) => item.properties.pipeline_id))
const segmentIds = new Set(datasets.segments.map((item) => item.properties.segment_id))
const referencePipelineIds = new Set(datasets.referencePipelines.map((item) => item.properties.pipeline_id))
const assets = [...datasets.valves, ...datasets.stations, ...datasets.terminals, ...datasets.facilities]
const assetIds = new Set(assets.map((item) => item.properties.asset_id))
const incidentIds = new Set(datasets.incidents.map((item) => item.properties.incident_id))
const inspectionIds = new Set(datasets.inspections.map((item) => item.properties.inspection_id))
function checkReferences(layerName, features, field, allowed, rule) {
  for (const item of features) {
    const value = item.properties?.[field]
    if (value == null || !allowed.has(value)) {
      if (!intentional(`operational/${layerName}.geojson`, item, rule)) errors.push(`${layerName}/${item.id}: ${field} references missing value ${value}`)
    }
  }
}

checkReferences('pipeline_segments', datasets.segments, 'pipeline_id', pipelineIds, 'INVALID_ASSET_REFERENCE')
checkReferences('valves', datasets.valves, 'pipeline_id', pipelineIds, 'MISSING_REQUIRED_ATTRIBUTE')
checkReferences('valves', datasets.valves, 'segment_id', segmentIds, 'INVALID_ASSET_REFERENCE')
checkReferences('stations', datasets.stations, 'pipeline_id', pipelineIds, 'INVALID_ASSET_REFERENCE')
checkReferences('stations', datasets.stations, 'segment_id', segmentIds, 'INVALID_ASSET_REFERENCE')
checkReferences('terminals', datasets.terminals, 'pipeline_id', pipelineIds, 'INVALID_ASSET_REFERENCE')
checkReferences('terminals', datasets.terminals, 'segment_id', segmentIds, 'INVALID_ASSET_REFERENCE')
checkReferences('facilities', datasets.facilities, 'pipeline_id', pipelineIds, 'INVALID_ASSET_REFERENCE')
checkReferences('facilities', datasets.facilities, 'segment_id', segmentIds, 'INVALID_ASSET_REFERENCE')
checkReferences('incidents', datasets.incidents, 'pipeline_id', pipelineIds, 'INVALID_ASSET_REFERENCE')
checkReferences('incidents', datasets.incidents, 'asset_id', assetIds, 'INVALID_ASSET_REFERENCE')
checkReferences('leak_events', datasets.leaks, 'incident_id', incidentIds, 'INVALID_ASSET_REFERENCE')
checkReferences('leak_events', datasets.leaks, 'pipeline_id', pipelineIds, 'INVALID_ASSET_REFERENCE')
checkReferences('work_orders', datasets.workOrders, 'asset_id', assetIds, 'ORPHAN_WORK_ORDER')
checkReferences('work_orders', datasets.workOrders, 'pipeline_id', pipelineIds, 'INVALID_ASSET_REFERENCE')
checkReferences('inspections', datasets.inspections, 'asset_id', assetIds, 'ORPHAN_INSPECTION')
checkReferences('inspections', datasets.inspections, 'pipeline_id', pipelineIds, 'INVALID_ASSET_REFERENCE')
checkReferences('corrosion_records', datasets.corrosion, 'asset_id', assetIds, 'INVALID_ASSET_REFERENCE')
checkReferences('corrosion_records', datasets.corrosion, 'inspection_id', inspectionIds, 'INVALID_ASSET_REFERENCE')
checkReferences('corrosion_records', datasets.corrosion, 'pipeline_id', pipelineIds, 'INVALID_ASSET_REFERENCE')
checkReferences('row_records', datasets.row, 'pipeline_id', pipelineIds, 'INVALID_ASSET_REFERENCE')
checkReferences('pipelines', datasets.pipelines, 'reference_pipeline_id', referencePipelineIds, 'INVALID_ASSET_REFERENCE')
const operatingAreaNames = new Set(datasets.operatingAreas.map((item) => item.properties.area_name))
for (const [name, features] of Object.entries(datasets)) {
  for (const item of features) {
    const area = item.properties?.operating_area
    if (area && !operatingAreaNames.has(area)) errors.push(`${name}/${item.id}: operating_area ${area} does not resolve to a demo area.`)
  }
}

const uniqueKeys = [
  ['reference/pipelines.geojson', datasets.referencePipelines, 'pipeline_id'],
  ['operational/pipelines.geojson', datasets.pipelines, 'pipeline_id'],
  ['operational/pipeline_segments.geojson', datasets.segments, 'segment_id'],
  ['operational/valves.geojson', datasets.valves, 'asset_id'],
  ['operational/stations.geojson', datasets.stations, 'station_id'],
  ['operational/terminals.geojson', datasets.terminals, 'terminal_id'],
  ['operational/facilities.geojson', datasets.facilities, 'facility_id'],
  ['operational/incidents.geojson', datasets.incidents, 'incident_id'],
  ['operational/leak_events.geojson', datasets.leaks, 'leak_id'],
  ['operational/work_orders.geojson', datasets.workOrders, 'work_order_id'],
  ['operational/inspections.geojson', datasets.inspections, 'inspection_id'],
  ['operational/corrosion_records.geojson', datasets.corrosion, 'corrosion_id'],
  ['operational/row_records.geojson', datasets.row, 'row_id'],
  ['operational/operating_areas.geojson', datasets.operatingAreas, 'area_id'],
  ['operational/environmental_areas.geojson', datasets.environmentalAreas, 'environmental_area_id'],
]
for (const [relative, features, key] of uniqueKeys) {
  const seen = new Map()
  for (const item of features) {
    const value = item.properties?.[key]
    if (value == null) continue
    const previousItem = seen.get(value)
    if (previousItem && !intentional(relative, item, 'DUPLICATE_ASSET_ID')) errors.push(`${relative}: duplicate ${key} ${value}`)
    seen.set(value, item)
  }
}

const seenValveIds = new Set()
for (const item of datasets.valves) {
  const id = item.properties.asset_id
  if (seenValveIds.has(id) && !intentional('operational/valves.geojson', item, 'DUPLICATE_ASSET_ID')) errors.push(`valves/${item.id}: unexpected duplicate asset_id ${id}`)
  seenValveIds.add(id)
}

const earthRadius = 6371008.8
const distancePointToLine = (point, line) => {
  const lat0 = point[1] * Math.PI / 180
  const toLocal = (coord) => [
    (coord[0] - point[0]) * Math.PI / 180 * earthRadius * Math.cos(lat0),
    (coord[1] - point[1]) * Math.PI / 180 * earthRadius,
  ]
  let minimum = Infinity
  for (let index = 1; index < line.length; index += 1) {
    const [ax, ay] = toLocal(line[index - 1])
    const [bx, by] = toLocal(line[index])
    const lengthSquared = (bx - ax) ** 2 + (by - ay) ** 2
    const fraction = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * (bx - ax) + ay * (by - ay)) / lengthSquared))
    minimum = Math.min(minimum, Math.hypot(ax + fraction * (bx - ax), ay + fraction * (by - ay)))
  }
  return minimum
}
const pipelineById = byProp(datasets.pipelines, 'pipeline_id')
for (const item of datasets.valves) {
  if (!item.geometry || !item.properties?.pipeline_id) continue
  const pipeline = pipelineById.get(item.properties.pipeline_id)
  if (!pipeline) continue
  const measured = distancePointToLine(item.geometry.coordinates, pipeline.geometry.coordinates)
  const expectedDistanceCase = item.properties.qa_expected_issue === 'VALVE_PIPELINE_DISTANCE'
  if (expectedDistanceCase && measured <= 25) errors.push(`valves/${item.id}: expected a distance QA issue but measured ${measured.toFixed(1)} m`)
  if (!expectedDistanceCase && measured > 25) errors.push(`valves/${item.id}: unexpected ${measured.toFixed(1)} m offset from assigned pipeline`)
}

const segmentById = byProp(datasets.segments, 'segment_id')
const lineDistance = (a, b) => {
  const lat = (a[1] + b[1]) / 2 * Math.PI / 180
  return Math.hypot((a[0] - b[0]) * Math.PI / 180 * earthRadius * Math.cos(lat), (a[1] - b[1]) * Math.PI / 180 * earthRadius)
}
for (const pipeline of datasets.pipelines) {
  for (let number = 1; number < 3; number += 1) {
    const previous = segmentById.get(`SEG-${pipeline.properties.pipeline_id.slice(3)}-${number}`)
    const current = segmentById.get(`SEG-${pipeline.properties.pipeline_id.slice(3)}-${number + 1}`)
    if (!previous || !current) continue
    const gap = lineDistance(previous.geometry.coordinates.at(-1), current.geometry.coordinates[0])
    const expectedGap = current.properties.qa_expected_issue === 'PIPELINE_SEGMENT_GAP'
    if (expectedGap && gap <= 5) errors.push(`${current.id}: documented pipeline segment gap was not found`)
    if (!expectedGap && gap > 5) errors.push(`${current.id}: unexpected pipeline segment gap (${gap.toFixed(1)} m)`)
  }
}
for (const [name, features, required] of [
  ['valves', datasets.valves, ['asset_id', 'asset_type', 'valve_type', 'pipeline_id', 'segment_id', 'source_type']],
  ['pipelines', datasets.pipelines, ['pipeline_id', 'pipeline_name', 'pipeline_type', 'product', 'operator', 'status', 'operating_area', 'reference_pipeline_id', 'source_type']],
  ['pipeline_segments', datasets.segments, ['segment_id', 'pipeline_id', 'from_node', 'to_node', 'segment_status', 'length_km', 'criticality', 'source_type']],
  ['stations', datasets.stations, ['station_id', 'station_name', 'station_type', 'pipeline_id', 'segment_id', 'source_type']],
  ['terminals', datasets.terminals, ['terminal_id', 'terminal_name', 'terminal_type', 'pipeline_id', 'source_type']],
  ['facilities', datasets.facilities, ['facility_id', 'facility_name', 'facility_type', 'pipeline_id', 'source_type']],
  ['incidents', datasets.incidents, ['incident_id', 'incident_type', 'severity', 'status', 'pipeline_id', 'source_type']],
  ['leak_events', datasets.leaks, ['leak_id', 'incident_id', 'asset_id', 'pipeline_id', 'detected_date', 'source_type']],
  ['work_orders', datasets.workOrders, ['work_order_id', 'work_type', 'priority', 'status', 'source_type']],
  ['inspections', datasets.inspections, ['inspection_id', 'inspection_type', 'inspection_date', 'source_type']],
  ['corrosion_records', datasets.corrosion, ['corrosion_id', 'asset_id', 'pipeline_id', 'inspection_id', 'corrosion_type', 'source_type']],
  ['row_records', datasets.row, ['row_id', 'pipeline_id', 'width_m', 'status', 'source_type']],
]) {
  for (const item of features) {
    for (const field of required) {
      if (item.properties?.[field] == null && !intentional(`operational/${name}.geojson`, item, 'MISSING_REQUIRED_ATTRIBUTE')) {
        errors.push(`${name}/${item.id}: missing required ${field}`)
      }
    }
  }
}

const publicLayerNames = new Set(datasets.referencePipelines.map((item) => item.properties.source_layer_name))
if (datasets.referencePipelines.length < 100) errors.push(`Only ${datasets.referencePipelines.length} public route features; expected at least 100.`)
if (datasets.pipelines.length < 100 || datasets.segments.length < 300 || datasets.valves.length < 150 || datasets.stations.length < 20 || datasets.terminals.length < 10 || datasets.incidents.length < 100 || datasets.leaks.length < 50 || datasets.workOrders.length < 250 || datasets.inspections.length < 300 || datasets.corrosion.length < 100) {
  errors.push('One or more required dataset minimum counts were not reached.')
}
if (publicLayerNames.size < 3) errors.push('Public pipeline reference snapshot is missing expected pipeline source classes.')

const previous = collection('snapshots/previous/valves.geojson')
const current = collection('snapshots/current/valves.geojson')
const manifest = read('snapshots/change_manifest.json')
const previousById = byProp(previous, 'asset_id')
const currentById = byProp(current, 'asset_id')
const actualAdded = [...currentById.keys()].filter((id) => !previousById.has(id))
const actualDeleted = [...previousById.keys()].filter((id) => !currentById.has(id))
if (actualAdded.length !== 1 || actualDeleted.length !== 1 || manifest.changes.length < 5) errors.push('Snapshot differences do not include the expected add/delete and documented edits.')
const statusChange = manifest.changes.find((change) => change.change_type === 'attribute_updated')
const moveChange = manifest.changes.find((change) => change.change_type === 'geometry_moved')
const relationshipChange = manifest.changes.find((change) => change.change_type === 'relationship_updated')
if (statusChange && previousById.get(statusChange.asset_id)?.properties?.status === currentById.get(statusChange.asset_id)?.properties?.status) errors.push('Snapshot status-change fixture has no actual status difference.')
if (moveChange) {
  const before = previousById.get(moveChange.asset_id)?.geometry?.coordinates
  const after = currentById.get(moveChange.asset_id)?.geometry?.coordinates
  if (!before || !after || distancePointToLine(before, [after, after]) < 30) errors.push('Snapshot geometry-move fixture is less than 30 m.')
}
if (relationshipChange && previousById.get(relationshipChange.asset_id)?.properties?.pipeline_id === currentById.get(relationshipChange.asset_id)?.properties?.pipeline_id) errors.push('Snapshot relationship-change fixture has no actual pipeline_id difference.')
for (const change of manifest.changes) {
  if (!['attribute_updated', 'geometry_moved', 'relationship_updated', 'deleted', 'added'].includes(change.change_type)) errors.push(`Unknown snapshot change type ${change.change_type}`)
}

const metadata = read('metadata/data_dictionary.json')
const registry = read('metadata/source_registry.json')
const relations = read('metadata/relationships.json')
if (metadata.datasets.length !== 19) errors.push(`Data dictionary should describe 19 datasets; found ${metadata.datasets.length}.`)
for (const dataset of metadata.datasets) {
  if (!dataset.layer_name || !dataset.description || !dataset.geometry_type || !dataset.primary_key || !dataset.source_type || !Array.isArray(dataset.fields) || dataset.fields.length === 0) {
    errors.push(`Data dictionary entry ${dataset.layer_name ?? '(unnamed)'} is missing required dataset/schema information.`)
  }
  for (const field of dataset.fields ?? []) {
    if (!field.field_name || !field.field_type || !field.field_description || !Object.hasOwn(field, 'allowed_values')) {
      errors.push(`Data dictionary ${dataset.layer_name}: incomplete field definition ${field.field_name ?? '(unnamed)'}`)
    }
  }
  if (dataset.path?.endsWith('.geojson')) {
    const properties = collection(dataset.path)[0]?.properties ?? {}
    const describedFields = new Set((dataset.fields ?? []).map((field) => field.field_name))
    for (const fieldName of Object.keys(properties)) {
      if (!describedFields.has(fieldName)) errors.push(`Data dictionary ${dataset.layer_name}: missing schema entry for ${fieldName}`)
    }
  }
}
if (!registry.sources.some((source) => source.source_type === 'public_reference') || !registry.sources.some((source) => source.source_type === 'synthetic_demo')) errors.push('Source registry must distinguish public and synthetic sources.')
if (relations.primary_and_foreign_keys.length < 10) errors.push('Relationship document is incomplete.')
for (const example of expected) {
  if (example.dataset === 'snapshots/change_manifest.json') {
    if (!manifest.changes.some((change) => change.asset_id === example.feature_id)) errors.push(`QA snapshot exception ${example.feature_id} is not in the change manifest.`)
    continue
  }
  const items = collection(example.dataset)
  const occurrences = items.filter((item) => item.id === example.feature_id || item.properties?.asset_id === example.feature_id)
  if (!occurrences.length) errors.push(`Documented QA case ${example.dataset}/${example.feature_id} is missing.`)
  if (example.rule_id === 'DUPLICATE_ASSET_ID' && occurrences.length < 2) errors.push('The documented duplicate ID case is not present twice.')
}

const count = Object.values(datasets).reduce((sum, layer) => sum + layer.length, 0)
if (count < 1000) errors.push(`Only ${count} local records; expected at least 1000.`)
const result = { ok: errors.length === 0, study_area: read('manifest.json').study_area, local_feature_records: count, public_pipeline_classes: [...publicLayerNames], datasets: reports, snapshot: { previous: previous.length, current: current.length, added: actualAdded, deleted: actualDeleted, documented_changes: manifest.changes.length }, errors }
console.log(JSON.stringify(result, null, 2))
if (errors.length) process.exitCode = 1
