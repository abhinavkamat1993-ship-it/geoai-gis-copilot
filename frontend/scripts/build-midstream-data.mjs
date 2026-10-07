import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Deterministically builds a compact, linked demo network from a clipped public pipeline snapshot.
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const dataRoot = path.resolve(scriptDir, '../public/data/midstream')
const referenceDir = path.join(dataRoot, 'reference')
const operationalDir = path.join(dataRoot, 'operational')
const snapshotsDir = path.join(dataRoot, 'snapshots')
const metadataDir = path.join(dataRoot, 'metadata')
const STUDY_AREA = { xmin: -103.5, ymin: 30.8, xmax: -100.5, ymax: 33.2 }
const DATA_AS_OF = '2026-10-07'
const SOURCE_URL = 'https://arcgis.netl.doe.gov/server/rest/services/Hosted/EIA_pipeline_data/FeatureServer'
const SOURCE_LAYERS = [
  { id: 0, name: 'Hydrocarbon Gas Liquids (HGL) Pipelines', type: 'HGL', product: 'Hydrocarbon Gas Liquids' },
  { id: 1, name: 'Petroleum Products Pipelines', type: 'Petroleum Products', product: 'Refined Products' },
  { id: 2, name: 'Crude Oil Trunk Pipelines', type: 'Crude Oil', product: 'Crude Oil' },
  { id: 3, name: 'Natural Gas Interstate and Intrastate Pipelines', type: 'Natural Gas', product: 'Natural Gas' },
]

for (const folder of [referenceDir, operationalDir, snapshotsDir, path.join(snapshotsDir, 'previous'), path.join(snapshotsDir, 'current'), metadataDir]) {
  fs.mkdirSync(folder, { recursive: true })
}

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
const writeJson = (filePath, value) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
const feature = (geometry, properties, id) => ({ type: 'Feature', id, geometry, properties })
const pad = (value, size = 4) => String(value).padStart(size, '0')
const deterministic = (value) => {
  let hash = 2166136261
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return (hash >>> 0) / 4294967295
}
const pick = (list, seed) => list[Math.floor(deterministic(seed) * list.length)]

function haversineMeters(a, b) {
  const radians = Math.PI / 180
  const dLat = (b[1] - a[1]) * radians
  const dLon = (b[0] - a[0]) * radians
  const lat1 = a[1] * radians
  const lat2 = b[1] * radians
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function destination(origin, bearingRadians, distanceMeters) {
  const angular = distanceMeters / 6371008.8
  const lat1 = origin[1] * Math.PI / 180
  const lon1 = origin[0] * Math.PI / 180
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearingRadians))
  const lon2 = lon1 + Math.atan2(Math.sin(bearingRadians) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2))
  return [lon2 * 180 / Math.PI, lat2 * 180 / Math.PI]
}

function initialBearing(a, b) {
  const radians = Math.PI / 180
  const lat1 = a[1] * radians
  const lat2 = b[1] * radians
  const dLon = (b[0] - a[0]) * radians
  return Math.atan2(Math.sin(dLon) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon))
}

function clipSegment(a, b, box) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  let low = 0
  let high = 1
  for (const [p, q] of [
    [-dx, a[0] - box.xmin], [dx, box.xmax - a[0]],
    [-dy, a[1] - box.ymin], [dy, box.ymax - a[1]],
  ]) {
    if (p === 0 && q < 0) return null
    if (p === 0) continue
    const r = q / p
    if (p < 0) low = Math.max(low, r)
    else high = Math.min(high, r)
    if (low > high) return null
  }
  return [[a[0] + low * dx, a[1] + low * dy], [a[0] + high * dx, a[1] + high * dy]]
}

function clipLine(line) {
  const parts = []
  let current = []
  for (let i = 1; i < line.length; i += 1) {
    const clipped = clipSegment(line[i - 1], line[i], STUDY_AREA)
    if (!clipped) {
      if (current.length >= 2) parts.push(current)
      current = []
      continue
    }
    const [start, end] = clipped
    if (!current.length || haversineMeters(current.at(-1), start) > 0.5) {
      if (current.length >= 2) parts.push(current)
      current = [start]
    }
    if (haversineMeters(current.at(-1), end) > 0.1) current.push(end)
  }
  if (current.length >= 2) parts.push(current)
  return parts
}

function linesFromGeometry(geometry) {
  if (!geometry) return []
  if (geometry.type === 'LineString') return [geometry.coordinates]
  if (geometry.type === 'MultiLineString') return geometry.coordinates
  return []
}

function interpolate(a, b, fraction) {
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction]
}

function pointAt(line, fraction) {
  const lengths = []
  let total = 0
  for (let i = 1; i < line.length; i += 1) {
    const length = haversineMeters(line[i - 1], line[i])
    lengths.push(length)
    total += length
  }
  let remaining = Math.min(1, Math.max(0, fraction)) * total
  for (let i = 0; i < lengths.length; i += 1) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      return interpolate(line[i], line[i + 1], lengths[i] ? remaining / lengths[i] : 0)
    }
    remaining -= lengths[i]
  }
  return line[0]
}

function sliceLine(line, startFraction, endFraction) {
  const lengths = []
  let total = 0
  for (let i = 1; i < line.length; i += 1) {
    const length = haversineMeters(line[i - 1], line[i])
    lengths.push(length)
    total += length
  }
  const startAt = total * startFraction
  const endAt = total * endFraction
  let distance = 0
  const result = [pointAt(line, startFraction)]
  for (let i = 1; i < line.length - 1; i += 1) {
    distance += lengths[i - 1]
    if (distance > startAt && distance < endAt) result.push(line[i])
  }
  result.push(pointAt(line, endFraction))
  return result
}

function lineLengthKm(line) {
  return line.slice(1).reduce((sum, point, index) => sum + haversineMeters(line[index], point), 0) / 1000
}

function geometryFromLine(line) {
  return { type: 'LineString', coordinates: line }
}

function operatingAreaFor(point) {
  const east = point[0] >= -102
  const north = point[1] >= 32
  return `${north ? 'North' : 'South'} ${east ? 'East' : 'West'} Area`
}

function makeCorridor(line, widthMeters) {
  const sampleCount = Math.min(18, line.length)
  const sampled = Array.from({ length: sampleCount }, (_, index) => pointAt(line, index / (sampleCount - 1)))
  const left = []
  const right = []
  for (let i = 0; i < sampled.length; i += 1) {
    const from = sampled[Math.max(0, i - 1)]
    const to = sampled[Math.min(sampled.length - 1, i + 1)]
    const bearing = initialBearing(from, to)
    left.push(destination(sampled[i], bearing - Math.PI / 2, widthMeters / 2))
    right.push(destination(sampled[i], bearing + Math.PI / 2, widthMeters / 2))
  }
  return { type: 'Polygon', coordinates: [[...left, ...right.reverse(), left[0]]] }
}

function sourceRouteFeatures() {
  const prepared = []
  const existing = path.join(referenceDir, 'pipelines.geojson')
  if (fs.existsSync(existing)) {
    const collection = readJson(existing)
    for (const item of collection.features) {
      const paths = linesFromGeometry(item.geometry)
      const longest = paths.sort((a, b) => lineLengthKm(b) - lineLengthKm(a))[0]
      if (longest?.length >= 2) prepared.push({ feature: item, line: longest })
    }
    return prepared
  }

  const byLayer = new Map()
  for (const source of SOURCE_LAYERS) {
    const input = path.join(referenceDir, `netl-layer-${source.id}.geojson`)
    if (!fs.existsSync(input)) throw new Error(`Missing public source snapshot ${input}`)
    const collection = readJson(input)
    const rows = []
    for (const item of collection.features ?? []) {
      const attributes = item.properties ?? {}
      const sourceId = attributes.fid ?? attributes.FID ?? attributes.OBJECTID ?? attributes.objectid
      const clipped = linesFromGeometry(item.geometry).flatMap(clipLine).filter((line) => lineLengthKm(line) >= 0.5)
      if (!clipped.length) continue
      const geometry = clipped.length === 1
        ? geometryFromLine(clipped[0])
        : { type: 'MultiLineString', coordinates: clipped }
      const route = feature(geometry, {
        pipeline_id: `REF-PIPE-${source.id}-${sourceId}`,
        source_feature_id: sourceId,
        source_layer_id: source.id,
        source_layer_name: source.name,
        pipeline_type: source.type,
        product: source.product,
        operator_name: attributes.opername ?? attributes.OPERNAME ?? null,
        pipeline_name: attributes.pipename ?? attributes.PIPENAME ?? null,
        source_reported_km: attributes.km ?? attributes.KM ?? null,
        source_reported_miles: attributes.miles ?? attributes.MILES ?? null,
        source_type: 'public_reference',
        source_name: 'U.S. DOE/NETL public EIA pipeline service',
        source_url: `${SOURCE_URL}/${source.id}`,
        accessed_on: DATA_AS_OF,
        geometry_note: 'Public line geometry clipped to the Midland–Odessa study extent; source attributes are preserved only where published.',
      }, `REF-PIPE-${source.id}-${sourceId}`)
      rows.push({ feature: route, line: clipped.sort((a, b) => lineLengthKm(b) - lineLengthKm(a))[0] })
    }
    byLayer.set(source.id, rows.sort((a, b) => String(a.feature.id).localeCompare(String(b.feature.id))))
  }

  const targets = new Map([[0, 16], [1, 6], [2, 28], [3, 70]])
  for (const source of SOURCE_LAYERS) {
    const rows = byLayer.get(source.id) ?? []
    const count = Math.min(rows.length, targets.get(source.id))
    for (let index = 0; index < count; index += 1) {
      const sourceIndex = count === rows.length ? index : Math.floor(index * (rows.length - 1) / Math.max(1, count - 1))
      prepared.push(rows[sourceIndex])
    }
  }
  if (prepared.length < 100) throw new Error(`Public pipeline subset has only ${prepared.length} usable routes; expected at least 100.`)
  writeJson(existing, { type: 'FeatureCollection', name: 'public_pipeline_routes', features: prepared.map((item) => item.feature) })
  return prepared
}

const publicRoutes = sourceRouteFeatures()
const routes = publicRoutes.slice(0, 100).map((entry, index) => ({
  reference: entry.feature,
  line: entry.line,
  pipelineId: `PL-${1001 + index}`,
  segmentIds: [1, 2, 3].map((number) => `SEG-${1001 + index}-${number}`),
}))

const pipelineTypes = ['Crude Oil', 'Refined Products', 'Natural Gas', 'HGL', 'Gathering', 'Transmission']
const pipelineFeatures = routes.map((route, index) => {
  const type = route.reference.properties.pipeline_type
  const fullName = `Demo ${type} Line ${pad(index + 1, 3)}`
  return feature(geometryFromLine(route.line), {
    pipeline_id: route.pipelineId,
    pipeline_name: fullName,
    operator: `Demo Operator ${pad((index % 6) + 1, 2)}`,
    pipeline_type: pipelineTypes.includes(type) ? type : 'Transmission',
    product: route.reference.properties.product,
    status: index % 17 === 0 ? 'Inactive' : 'Active',
    diameter_in: 8 + (index % 5) * 4,
    operating_pressure_psi: 450 + (index % 8) * 75,
    length_km: Number(lineLengthKm(route.line).toFixed(3)),
    operating_area: operatingAreaFor(pointAt(route.line, 0.5)),
    region: 'Permian Basin',
    commission_date: `20${String(10 + (index % 15)).padStart(2, '0')}-06-15`,
    source_type: 'synthetic_demo',
    geometry_source_type: 'public_reference_derived',
    reference_pipeline_id: route.reference.properties.pipeline_id,
    demonstration_note: 'Synthetic operational identity and attributes placed on a clipped public route for GIS demonstration; not an operator record.',
  }, route.pipelineId)
})

const segmentFeatures = []
const segmentsById = new Map()
for (const route of routes) {
  for (let segmentNumber = 0; segmentNumber < 3; segmentNumber += 1) {
    const start = segmentNumber / 3
    const end = (segmentNumber + 1) / 3
    const segmentLine = sliceLine(route.line, start, end)
    const expectedGap = route.pipelineId === 'PL-1010' && segmentNumber === 1
    if (expectedGap) {
      segmentLine[0] = destination(segmentLine[0], initialBearing(segmentLine[0], segmentLine.at(-1)) + Math.PI / 2, 80)
    }
    const id = route.segmentIds[segmentNumber]
    const properties = {
      segment_id: id,
      pipeline_id: route.pipelineId,
      from_node: `NODE-${route.pipelineId}-${segmentNumber}`,
      to_node: `NODE-${route.pipelineId}-${segmentNumber + 1}`,
      segment_status: 'Active',
      diameter_in: 8 + ((Number(route.pipelineId.slice(-2)) + segmentNumber) % 5) * 4,
      material: pick(['Carbon Steel', 'High-Strength Steel', 'Coated Steel'], id),
      length_km: Number(lineLengthKm(segmentLine).toFixed(3)),
      operating_area: operatingAreaFor(pointAt(segmentLine, 0.5)),
      criticality: pick(['Low', 'Moderate', 'High', 'Critical'], id),
      source_type: 'synthetic_demo',
      ...(expectedGap ? { qa_expected_issue: 'PIPELINE_SEGMENT_GAP' } : {}),
    }
    const item = feature(geometryFromLine(segmentLine), properties, id)
    segmentFeatures.push(item)
    segmentsById.set(id, { feature: item, line: segmentLine })
  }
}

const assetFeatures = []
const lineForAsset = new Map()
const addPointAsset = (id, type, routeIndex, segmentNumber, fraction, properties = {}, offsetMeters = 0) => {
  const route = routes[routeIndex % routes.length]
  const segmentId = route.segmentIds[segmentNumber % 3]
  const segment = segmentsById.get(segmentId)
  let point = pointAt(segment.line, fraction)
  if (offsetMeters) point = destination(point, initialBearing(segment.line[0], segment.line.at(-1)) + Math.PI / 2, offsetMeters)
  const common = {
    asset_id: id,
    asset_type: type,
    status: pick(['Active', 'Active', 'Active', 'Inactive', 'Under Maintenance'], id),
    pipeline_id: route.pipelineId,
    segment_id: segmentId,
    operating_area: operatingAreaFor(point),
    criticality: pick(['Low', 'Moderate', 'High', 'Critical'], `${id}-criticality`),
    source_type: 'synthetic_demo',
    latitude: Number(point[1].toFixed(7)),
    longitude: Number(point[0].toFixed(7)),
    ...properties,
  }
  const item = feature({ type: 'Point', coordinates: point }, common, id)
  assetFeatures.push(item)
  lineForAsset.set(id, { point, route, segment })
  return item
}

const valveTypes = ['Mainline Valve', 'Block Valve', 'Isolation Valve', 'Check Valve', 'Control Valve', 'Emergency Shutdown Valve']
const valves = []
for (let index = 0; index < 180; index += 1) {
  const routeIndex = index % routes.length
  const segmentNumber = Math.floor(index / routes.length) % 3
  const fraction = 0.12 + deterministic(`valve-${index}`) * 0.76
  const id = `VAL-${1001 + index}`
  const valve = addPointAsset(id, 'Valve', routeIndex, segmentNumber, fraction, {
    valve_type: pick(valveTypes, id),
    diameter_in: 8 + (index % 5) * 4,
    manufacturer: pick(['Cameron', 'Emerson', 'Flowserve', 'Velan', 'Demo Manufacturer'], id),
    installation_date: `20${String(8 + index % 16).padStart(2, '0')}-03-12`,
    last_inspection_date: `202${index % 6}-0${(index % 9) + 1}-15`,
  }, index === 104 ? 45 : 0)
  if (index === 104) valve.properties.qa_expected_issue = 'VALVE_PIPELINE_DISTANCE'
  if (index === 105) { delete valve.properties.status; valve.properties.qa_expected_issue = 'MISSING_REQUIRED_ATTRIBUTE' }
  if (index === 106) { valve.properties.pipeline_id = null; valve.properties.qa_expected_issue = 'MISSING_REQUIRED_ATTRIBUTE' }
  valves.push(valve)
}

const stationFeatures = []
const stationTypes = ['Pump Station', 'Compressor Station', 'Metering Station', 'Valve Station']
for (let index = 0; index < 48; index += 1) {
  const routeIndex = index * 2 % routes.length
  const segmentNumber = index % 3
  const type = stationTypes[index % stationTypes.length]
  stationFeatures.push(addPointAsset(`STA-${2001 + index}`, type, routeIndex, segmentNumber, 0.22 + deterministic(`station-${index}`) * 0.56, {
    station_id: `STA-${2001 + index}`,
    station_name: `Demo ${type} ${pad(index + 1, 3)}`,
    station_type: type,
    capacity: `${40 + index * 3} ${type === 'Pump Station' ? 'MBPD' : 'MMSCFD'}`,
    commission_date: `20${String(10 + index % 15).padStart(2, '0')}-09-20`,
  }))
}

const terminalFeatures = []
for (let index = 0; index < 12; index += 1) {
  const routeIndex = index * 7 % routes.length
  terminalFeatures.push(addPointAsset(`TERM-${3001 + index}`, 'Terminal', routeIndex, index % 3, 0.08 + deterministic(`terminal-${index}`) * 0.84, {
    terminal_id: `TERM-${3001 + index}`,
    terminal_name: `Permian Demo Terminal ${pad(index + 1, 2)}`,
    terminal_type: pick(['Crude Oil Terminal', 'Products Terminal', 'Gas Processing Terminal'], `terminal-${index}`),
    capacity: `${2 + index} million barrels`,
    pipeline_connections: routes[routeIndex].pipelineId,
  }))
}

const facilityFeatures = []
for (let index = 0; index < 30; index += 1) {
  const routeIndex = index * 3 % routes.length
  facilityFeatures.push(addPointAsset(`FAC-${4001 + index}`, 'Facility', routeIndex, index % 3, 0.18 + deterministic(`facility-${index}`) * 0.64, {
    facility_id: `FAC-${4001 + index}`,
    facility_name: `Demo Operations Facility ${pad(index + 1, 2)}`,
    facility_type: pick(['Control Building', 'Maintenance Yard', 'Metering Facility', 'Storage Area', 'Emergency Response Facility'], `facility-${index}`),
  }))
}

const linkedAsset = (index) => [valves[index % valves.length], stationFeatures[index % stationFeatures.length], facilityFeatures[index % facilityFeatures.length], terminalFeatures[index % terminalFeatures.length]][index % 4]
const incidentTypes = ['Leak', 'Pressure Anomaly', 'Corrosion', 'Third Party Damage', 'Excavation Near ROW', 'Valve Failure', 'Equipment Failure', 'Unauthorized Activity', 'Environmental Concern']
const incidentFeatures = []
for (let index = 0; index < 100; index += 1) {
  const asset = linkedAsset(index)
  const reference = lineForAsset.get(asset.properties.asset_id)
  const id = `INC-${2001 + index}`
  const item = feature({ type: 'Point', coordinates: reference.point }, {
    incident_id: id,
    incident_type: pick(incidentTypes, id),
    severity: pick(['Low', 'Moderate', 'High', 'Critical'], `${id}-severity`),
    status: pick(['Open', 'Investigating', 'Resolved'], `${id}-status`),
    reported_date: `202${index % 6}-0${(index % 9) + 1}-0${(index % 8) + 1}`,
    resolved_date: index % 3 === 0 ? null : `202${index % 6}-1${(index % 2) + 1}-10`,
    asset_id: asset.properties.asset_id,
    pipeline_id: asset.properties.pipeline_id,
    segment_id: asset.properties.segment_id,
    operating_area: asset.properties.operating_area,
    description: `${pick(incidentTypes, id)} reported during a synthetic operational exercise.`,
    root_cause_category: pick(['Equipment', 'Corrosion', 'Third Party', 'Operations', 'Environmental'], id),
    source_type: 'synthetic_demo',
  }, id)
  incidentFeatures.push(item)
}
incidentFeatures.push(feature(null, {
  incident_id: 'INC-2101', incident_type: 'Environmental Concern', severity: 'Moderate', status: 'Open',
  reported_date: DATA_AS_OF, resolved_date: null, asset_id: 'ASSET-DOES-NOT-EXIST',
  pipeline_id: routes[0].pipelineId, segment_id: routes[0].segmentIds[0], operating_area: 'North West Area',
  description: 'Controlled QA case: incident has a missing asset reference and null geometry.',
  root_cause_category: 'Environmental', source_type: 'synthetic_demo', qa_expected_issue: 'INVALID_ASSET_REFERENCE',
}, 'INC-2101'))

const leakFeatures = incidentFeatures.slice(0, 55).map((incident, index) => {
  const properties = incident.properties
  return feature(incident.geometry, {
    leak_id: `LEAK-${3001 + index}`,
    incident_id: properties.incident_id,
    asset_id: properties.asset_id,
    pipeline_id: properties.pipeline_id,
    detected_date: properties.reported_date,
    severity: properties.severity,
    estimated_volume: Number((0.2 + deterministic(`leak-${index}`) * 24).toFixed(2)),
    detection_method: pick(['Field Inspection', 'Operational Alert', 'Pressure Anomaly', 'Flow Imbalance', 'Reported Observation'], `leak-${index}`),
    status: properties.status,
    source_type: 'synthetic_demo',
  }, `LEAK-${3001 + index}`)
})

const allAssets = [...valves, ...stationFeatures, ...terminalFeatures, ...facilityFeatures]
  .filter((asset) => asset.properties.pipeline_id && asset.properties.segment_id)
const workTypes = ['Inspection', 'Maintenance', 'Repair', 'Valve Maintenance', 'ROW Inspection', 'Corrosion Inspection', 'Emergency Response', 'Survey', 'Data Correction']
const workOrderFeatures = []
for (let index = 0; index < 270; index += 1) {
  const asset = allAssets[(index * 17) % allAssets.length]
  const id = `WO-${7001 + index}`
  workOrderFeatures.push(feature(asset.geometry, {
    work_order_id: id,
    asset_id: asset.properties.asset_id,
    pipeline_id: asset.properties.pipeline_id,
    work_type: pick(workTypes, id),
    priority: pick(['Low', 'Medium', 'High', 'Emergency'], `${id}-priority`),
    status: pick(['Open', 'Assigned', 'In Progress', 'Completed', 'Cancelled'], `${id}-status`),
    created_date: `202${index % 6}-0${(index % 9) + 1}-12`,
    planned_date: `202${index % 6}-1${(index % 2) + 1}-18`,
    completed_date: index % 3 === 0 ? `202${index % 6}-1${(index % 2) + 1}-24` : null,
    assigned_team: `Permian Field Team ${pad((index % 8) + 1, 2)}`,
    description: `${pick(workTypes, id)} for ${asset.properties.asset_id}. Synthetic demonstration record.`,
    source_type: 'synthetic_demo',
  }, id))
}
workOrderFeatures[269].properties.asset_id = 'ASSET-DOES-NOT-EXIST'
workOrderFeatures[269].properties.qa_expected_issue = 'ORPHAN_WORK_ORDER'

const inspectionTypes = ['Routine', 'Integrity', 'Valve Inspection', 'ROW Inspection', 'Corrosion', 'Cathodic Protection', 'Environmental']
const inspectionFeatures = []
for (let index = 0; index < 330; index += 1) {
  const asset = allAssets[(index * 13) % allAssets.length]
  const id = `INSP-${5001 + index}`
  inspectionFeatures.push(feature(asset.geometry, {
    inspection_id: id,
    asset_id: asset.properties.asset_id,
    pipeline_id: asset.properties.pipeline_id,
    inspection_type: pick(inspectionTypes, id),
    inspection_date: `202${index % 6}-0${(index % 9) + 1}-08`,
    condition: pick(['Good', 'Fair', 'Poor', 'Monitor'], `${id}-condition`),
    risk_score: Number((1 + deterministic(`${id}-risk`) * 99).toFixed(1)),
    inspector: `Inspector ${pad((index % 24) + 1, 2)}`,
    finding: `${pick(['No action required', 'Monitor coating', 'Schedule follow-up', 'Repair recommended'], id)}; synthetic demo finding.`,
    next_inspection_date: `202${(index + 1) % 6}-0${((index + 3) % 9) + 1}-08`,
    source_type: 'synthetic_demo',
  }, id))
}
inspectionFeatures[329].properties.asset_id = 'ASSET-DOES-NOT-EXIST'
inspectionFeatures[329].properties.qa_expected_issue = 'ORPHAN_INSPECTION'

const corrosionTypes = ['External Corrosion', 'Internal Corrosion', 'MIC', 'Atmospheric Corrosion']
const corrosionFeatures = inspectionFeatures.slice(0, 110).map((inspection, index) => feature(inspection.geometry, {
  corrosion_id: `COR-${6001 + index}`,
  asset_id: inspection.properties.asset_id,
  pipeline_id: inspection.properties.pipeline_id,
  inspection_id: inspection.properties.inspection_id,
  corrosion_type: pick(corrosionTypes, `cor-${index}`),
  severity: pick(['Low', 'Moderate', 'High'], `cor-${index}-severity`),
  depth_percent: Number((5 + deterministic(`cor-${index}-depth`) * 72).toFixed(1)),
  inspection_date: inspection.properties.inspection_date,
  status: pick(['Open', 'Monitoring', 'Mitigated'], `cor-${index}-status`),
  recommended_action: pick(['Reinspect', 'Coating repair', 'Engineering review', 'No immediate action'], `cor-${index}`),
  source_type: 'synthetic_demo',
}, `COR-${6001 + index}`))

const rowFeatures = routes.map((route, index) => feature(
  makeCorridor(route.line, 60 + (index % 7) * 10),
  {
    row_id: `ROW-${8001 + index}`,
    pipeline_id: route.pipelineId,
    width_m: 60 + (index % 7) * 10,
    status: 'Active',
    landowner_type: pick(['Private', 'State', 'Federal', 'Mixed'], `row-${index}`),
    operating_area: operatingAreaFor(pointAt(route.line, 0.5)),
    inspection_status: pick(['Current', 'Due Soon', 'Overdue'], `row-status-${index}`),
    last_inspection_date: `202${index % 6}-0${(index % 9) + 1}-14`,
    source_type: 'synthetic_demo',
  }, `ROW-${8001 + index}`,
))

const areaBounds = [
  ['North West Area', STUDY_AREA.xmin, 32, -102, STUDY_AREA.ymax],
  ['North East Area', -102, 32, STUDY_AREA.xmax, STUDY_AREA.ymax],
  ['South West Area', STUDY_AREA.xmin, STUDY_AREA.ymin, -102, 32],
  ['South East Area', -102, STUDY_AREA.ymin, STUDY_AREA.xmax, 32],
]
const operatingAreaFeatures = areaBounds.map(([name, xmin, ymin, xmax, ymax], index) => feature({
  type: 'Polygon', coordinates: [[[xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax], [xmin, ymin]]],
}, {
  area_id: `AREA-${String(index + 1).padStart(2, '0')}`,
  area_name: name,
  region: 'Permian Basin',
  manager: `Demo Area Manager ${String(index + 1).padStart(2, '0')}`,
  status: 'Active',
  source_type: 'synthetic_demo',
}, `AREA-${String(index + 1).padStart(2, '0')}`))

const environmentalFeatures = []
for (let index = 0; index < 8; index += 1) {
  const route = routes[index * 11 % routes.length]
  const center = pointAt(route.line, 0.5)
  const ring = Array.from({ length: 13 }, (_, vertex) => {
    const angle = vertex / 12 * Math.PI * 2
    return destination(center, angle, 500 + index * 90)
  })
  ring[ring.length - 1] = ring[0]
  environmentalFeatures.push(feature({ type: 'Polygon', coordinates: [ring] }, {
    environmental_area_id: `ENV-${9001 + index}`,
    area_name: `Demo Sensitive Area ${pad(index + 1, 2)}`,
    designation: pick(['Wetland Demonstration', 'Sensitive Habitat Demonstration', 'Conservation Demonstration'], index),
    status: 'Illustrative Only',
    operating_area: operatingAreaFor(center),
    related_pipeline_id: route.pipelineId,
    source_type: 'synthetic_demo',
    geometry_note: `Illustrative ${Math.round((500 + index * 90) / 100) * 100} m scenario polygon around a synthetic pipeline; not an environmental inventory.`,
  }, `ENV-${9001 + index}`))
}

const allowedValuesByField = {
  source_type: ['public_reference', 'synthetic_demo'],
  segment_status: ['Active', 'Inactive'],
  criticality: ['Low', 'Moderate', 'High', 'Critical'],
  severity: ['Low', 'Moderate', 'High', 'Critical'],
  priority: ['Low', 'Medium', 'High', 'Emergency'],
  condition: ['Good', 'Fair', 'Poor', 'Monitor'],
  inspection_status: ['Current', 'Due Soon', 'Overdue'],
  landowner_type: ['Private', 'State', 'Federal', 'Mixed'],
  detection_method: ['Field Inspection', 'Operational Alert', 'Pressure Anomaly', 'Flow Imbalance', 'Reported Observation'],
  incident_type: incidentTypes,
  inspection_type: inspectionTypes,
  work_type: workTypes,
  corrosion_type: corrosionTypes,
  pipeline_type: pipelineTypes,
  valve_type: valveTypes,
  station_type: stationTypes,
  facility_type: ['Control Building', 'Maintenance Yard', 'Metering Facility', 'Storage Area', 'Pump Facility', 'Compressor Facility', 'Emergency Response Facility'],
  terminal_type: ['Crude Oil Terminal', 'Products Terminal', 'Gas Processing Terminal'],
  material: ['Carbon Steel', 'High-Strength Steel', 'Coated Steel'],
}

const allowedValuesByDataset = {
  pipelines: { status: ['Active', 'Inactive'], pipeline_type: pipelineTypes },
  pipeline_segments: { segment_status: ['Active', 'Inactive'] },
  valves: { status: ['Active', 'Inactive', 'Under Maintenance'] },
  stations: { status: ['Active', 'Inactive', 'Under Maintenance'] },
  terminals: { status: ['Active', 'Inactive', 'Under Maintenance'] },
  facilities: { status: ['Active', 'Inactive', 'Under Maintenance'] },
  incidents: { status: ['Open', 'Investigating', 'Resolved'] },
  leak_events: { status: ['Open', 'Investigating', 'Resolved'] },
  work_orders: { status: ['Open', 'Assigned', 'In Progress', 'Completed', 'Cancelled'] },
  corrosion_records: { status: ['Open', 'Monitoring', 'Mitigated'] },
  row_records: { status: ['Active'] },
  operating_areas: { status: ['Active'] },
  environmental_areas: { status: ['Illustrative Only'] },
}

const humanize = (fieldName) => fieldName.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
const schemaFor = (records, datasetName) => {
  const sample = records[0]?.properties ?? {}
  return Object.entries(sample).map(([fieldName, value]) => {
    const fieldType = /date$/.test(fieldName) || fieldName.endsWith('_date')
      ? 'date'
      : typeof value === 'number'
        ? 'number'
        : typeof value === 'boolean'
          ? 'boolean'
          : typeof value === 'object' && value !== null
            ? 'object'
            : 'string'
    return {
      field_name: fieldName,
      field_type: fieldType,
      field_description: `${humanize(fieldName)} for the ${datasetName.replace(/_/g, ' ')} dataset.${fieldName === 'source_type' ? ' This field labels public reference versus synthetic demo provenance.' : ''}`,
      allowed_values: allowedValuesByDataset[datasetName]?.[fieldName] ?? allowedValuesByField[fieldName] ?? null,
    }
  })
}

const qaRules = [
  ['VALVE_PIPELINE_DISTANCE', 'Valve to assigned pipeline distance', 'Flag a valve geometry farther from its assigned pipeline than the configured tolerance.', 'error', 'valves', { maximum_distance_m: 25 }],
  ['DUPLICATE_ASSET_ID', 'Duplicate asset identifier', 'Asset identifiers should be unique within an asset layer.', 'error', 'valves', { key: 'asset_id' }],
  ['MISSING_REQUIRED_ATTRIBUTE', 'Required attribute missing', 'Required operational attributes such as status and pipeline_id should be present.', 'warning', 'valves', { fields: ['status', 'pipeline_id'] }],
  ['INVALID_GEOMETRY', 'Missing or invalid geometry', 'Operational features require a valid geometry of the declared layer type.', 'error', 'incidents', { allow_null_only_when_documented: true }],
  ['PIPELINE_SEGMENT_GAP', 'Pipeline segment network gap', 'Adjacent segments for a pipeline should meet at the same node coordinate.', 'warning', 'pipeline_segments', { endpoint_tolerance_m: 5 }],
  ['INVALID_ASSET_REFERENCE', 'Invalid asset reference', 'Incident, work, and inspection references must resolve to a known asset.', 'error', 'incidents', { foreign_key: 'asset_id' }],
  ['ORPHAN_WORK_ORDER', 'Work order references unknown asset', 'Every work order asset_id should resolve to an asset record.', 'error', 'work_orders', { foreign_key: 'asset_id' }],
  ['ORPHAN_INSPECTION', 'Inspection references unknown asset', 'Every inspection asset_id should resolve to an asset record.', 'error', 'inspections', { foreign_key: 'asset_id' }],
  ['RELATIONSHIP_CHANGE', 'Relationship changed between snapshots', 'A changed foreign-key relationship should appear in the snapshot change manifest.', 'info', 'snapshots', { compare: 'previous/current' }],
]

const snapshotPrevious = valves.slice(0, 12).map((item) => structuredClone(item))
snapshotPrevious.find((item) => item.properties.asset_id === 'VAL-1001').properties.status = 'Inactive'
const snapshotCurrent = snapshotPrevious.map((item) => structuredClone(item))
const oldValve1 = snapshotCurrent.find((item) => item.properties.asset_id === 'VAL-1001')
oldValve1.properties.status = 'Active'
const changedValve1 = snapshotCurrent.find((item) => item.properties.asset_id === 'VAL-1002')
const movedFrom = changedValve1.geometry.coordinates
changedValve1.geometry.coordinates = destination(movedFrom, 0.72, 35)
changedValve1.properties.longitude = Number(changedValve1.geometry.coordinates[0].toFixed(7))
changedValve1.properties.latitude = Number(changedValve1.geometry.coordinates[1].toFixed(7))
snapshotCurrent.find((item) => item.properties.asset_id === 'VAL-1003').properties.pipeline_id = routes[1].pipelineId
const deletedValve = snapshotCurrent.findIndex((item) => item.properties.asset_id === 'VAL-1004')
snapshotCurrent.splice(deletedValve, 1)
snapshotCurrent.push(structuredClone(valves[12]))
snapshotCurrent.at(-1).properties.asset_id = 'VAL-1013'
snapshotCurrent.at(-1).id = 'VAL-1013'
snapshotCurrent.at(-1).properties.pipeline_id = routes[12].pipelineId

const snapshotChanges = [
  { change_id: 'CHG-001', asset_id: 'VAL-1001', change_type: 'attribute_updated', field: 'status', previous: 'Inactive', current: 'Active', note: 'Controlled status change.' },
  { change_id: 'CHG-002', asset_id: 'VAL-1002', change_type: 'geometry_moved', displacement_m: 35, note: 'Controlled geometry movement.' },
  { change_id: 'CHG-003', asset_id: 'VAL-1003', change_type: 'relationship_updated', field: 'pipeline_id', previous: routes[2].pipelineId, current: routes[1].pipelineId, note: 'Controlled relationship change.' },
  { change_id: 'CHG-004', asset_id: 'VAL-1004', change_type: 'deleted', note: 'Controlled deletion.' },
  { change_id: 'CHG-005', asset_id: 'VAL-1013', change_type: 'added', note: 'Controlled addition.' },
]

const duplicateValve = structuredClone(valves[0])
duplicateValve.properties.qa_expected_issue = 'DUPLICATE_ASSET_ID'
valves.push(duplicateValve)

const datasets = [
  ['pipelines', publicRoutes.map((route) => route.feature)],
  ['pipelines', pipelineFeatures, 'operational'],
  ['pipeline_segments', segmentFeatures, 'operational'],
  ['valves', valves, 'operational'],
  ['stations', stationFeatures, 'operational'],
  ['terminals', terminalFeatures, 'operational'],
  ['facilities', facilityFeatures, 'operational'],
  ['incidents', incidentFeatures, 'operational'],
  ['leak_events', leakFeatures, 'operational'],
  ['work_orders', workOrderFeatures, 'operational'],
  ['inspections', inspectionFeatures, 'operational'],
  ['corrosion_records', corrosionFeatures, 'operational'],
  ['row_records', rowFeatures, 'operational'],
  ['operating_areas', operatingAreaFeatures, 'operational'],
  ['environmental_areas', environmentalFeatures, 'operational'],
]

for (const [name, features, folder = 'reference'] of datasets) {
  const destinationDir = folder === 'reference' ? referenceDir : operationalDir
  writeJson(path.join(destinationDir, `${name}.geojson`), { type: 'FeatureCollection', name, features })
}
writeJson(path.join(snapshotsDir, 'previous', 'valves.geojson'), { type: 'FeatureCollection', name: 'previous_valves', features: snapshotPrevious })
writeJson(path.join(snapshotsDir, 'current', 'valves.geojson'), { type: 'FeatureCollection', name: 'current_valves', features: snapshotCurrent })
writeJson(path.join(snapshotsDir, 'change_manifest.json'), { as_of: DATA_AS_OF, dataset: 'valves', changes: snapshotChanges })

const remoteData = {
  roads: { owner: 'U.S. Census Bureau', url: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer/2', source_name: 'TIGERweb Primary Roads', refresh_frequency: 'Periodic census geography releases; consult live metadata', note: 'Public reference road geography; not a dispatch-grade routing network.' },
  rivers: { owner: 'U.S. Geological Survey', url: 'https://3dhp.nationalmap.gov/arcgis/rest/services/usgs_3dhp_all/FeatureServer/50', source_name: '3D Hydrography Program Flowlines', refresh_frequency: 'Periodic; consult service metadata', note: 'Public hydrography context; coverage blends 3DHP and legacy NHD.' },
  water_bodies: { owner: 'U.S. Geological Survey', url: 'https://3dhp.nationalmap.gov/arcgis/rest/services/usgs_3dhp_all/FeatureServer/60', source_name: '3D Hydrography Program Waterbodies', refresh_frequency: 'Periodic; consult service metadata', note: 'Public hydrography context; not survey-grade or a regulatory determination.' },
  administrative_areas: { owner: 'U.S. Census Bureau', url: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1', source_name: 'TIGERweb Counties', refresh_frequency: 'Periodic census geography releases; consult live metadata', note: 'Public county reference boundaries.' },
}

const dataDictionary = {
  version: 1,
  as_of: DATA_AS_OF,
  coordinate_reference_system: 'GeoJSON coordinates use WGS 84 longitude/latitude (OGC CRS84 / EPSG:4326). Distances in generated attributes use haversine meters over the WGS 84 ellipsoid approximation; the application buffer uses ArcGIS geodesic geometry operators.',
  datasets: [
    { layer_name: 'pipelines', path: 'reference/pipelines.geojson', description: 'Clipped public EIA pipeline route reference geometry with source-published attributes only.', geometry_type: 'LineString or MultiLineString', primary_key: 'pipeline_id', source_type: 'public_reference', fields: [
      { field_name: 'pipeline_id', field_type: 'string', field_description: 'Stable local reference key derived from public service layer and object ID.', allowed_values: null },
      { field_name: 'source_feature_id', field_type: 'string or number', field_description: 'Feature identifier published by the public service.', allowed_values: null },
      { field_name: 'source_layer_id', field_type: 'number', field_description: 'DOE/NETL service layer identifier.', allowed_values: SOURCE_LAYERS.map((source) => source.id) },
      { field_name: 'source_layer_name', field_type: 'string', field_description: 'Name of the public DOE/NETL service layer.', allowed_values: SOURCE_LAYERS.map((source) => source.name) },
      { field_name: 'pipeline_type', field_type: 'string', field_description: 'Pipeline class inferred from the named public service layer.', allowed_values: SOURCE_LAYERS.map((source) => source.type) },
      { field_name: 'product', field_type: 'string', field_description: 'Product category represented by the selected public service layer.', allowed_values: SOURCE_LAYERS.map((source) => source.product) },
      { field_name: 'operator_name', field_type: 'string or null', field_description: 'Operator name only when supplied by source attributes.', allowed_values: null },
      { field_name: 'pipeline_name', field_type: 'string or null', field_description: 'Pipeline name only when supplied by source attributes.', allowed_values: null },
      { field_name: 'source_reported_km', field_type: 'number or null', field_description: 'Kilometer value only when supplied by source attributes.', allowed_values: null },
      { field_name: 'source_reported_miles', field_type: 'number or null', field_description: 'Miles value only when supplied by source attributes.', allowed_values: null },
      { field_name: 'source_type', field_type: 'string', field_description: 'Marks this record as public reference data.', allowed_values: ['public_reference'] },
      { field_name: 'source_name', field_type: 'string', field_description: 'Attribution label for the public service used as the reference source.', allowed_values: null },
      { field_name: 'source_url', field_type: 'string', field_description: 'REST endpoint for the originating source layer.', allowed_values: null },
      { field_name: 'accessed_on', field_type: 'date', field_description: 'Date this bounded reference snapshot was retrieved.', allowed_values: null },
      { field_name: 'geometry_note', field_type: 'string', field_description: 'Documents that the source geometry is clipped to the local study extent.', allowed_values: null },
    ] },
    ...Object.entries(remoteData).map(([layer_name, details]) => ({
      layer_name,
      path: 'ArcGIS Feature Service',
      description: details.note,
      geometry_type: layer_name === 'roads' || layer_name === 'rivers' ? 'Polyline' : 'Polygon',
      primary_key: 'service object ID',
      source_type: 'public_reference',
      fields: [{ field_name: 'service-defined attributes', field_type: 'dynamic', field_description: `Fields and allowed values are defined by the live ${details.source_name} service; inspect its ArcGIS REST layer metadata at ${details.url}.`, allowed_values: null }],
    })),
    ...[
      ['pipelines', 'Synthetic operational pipeline scenarios linked to clipped public route geography.', 'LineString', 'pipeline_id', pipelineFeatures],
      ['pipeline_segments', 'Three connected synthetic segments per demonstration pipeline.', 'LineString', 'segment_id', segmentFeatures],
      ['valves', 'Synthetic valve assets located on their assigned pipeline segments, with controlled QA cases documented.', 'Point', 'asset_id', valves],
      ['stations', 'Synthetic pump, compressor, metering, and valve stations.', 'Point', 'station_id', stationFeatures],
      ['terminals', 'Synthetic terminals linked to pipeline and asset identifiers.', 'Point', 'terminal_id', terminalFeatures],
      ['facilities', 'Synthetic operational facilities linked to pipeline and area identifiers.', 'Point', 'facility_id', facilityFeatures],
      ['incidents', 'Synthetic incidents associated with assets, pipelines, and segments.', 'Point', 'incident_id', incidentFeatures],
      ['leak_events', 'Synthetic leak scenarios linked to incident records; not live SCADA.', 'Point', 'leak_id', leakFeatures],
      ['work_orders', 'Synthetic maintenance and response orders associated with assets.', 'Point', 'work_order_id', workOrderFeatures],
      ['inspections', 'Synthetic asset inspection observations.', 'Point', 'inspection_id', inspectionFeatures],
      ['corrosion_records', 'Synthetic corrosion findings linked to inspections and assets.', 'Point', 'corrosion_id', corrosionFeatures],
      ['row_records', 'Synthetic rights-of-way corridors linked to pipelines.', 'Polygon', 'row_id', rowFeatures],
      ['operating_areas', 'Synthetic four-quadrant Permian Basin demo boundaries.', 'Polygon', 'area_id', operatingAreaFeatures],
      ['environmental_areas', 'Illustrative synthetic environmental scenario polygons, not an environmental inventory.', 'Polygon', 'environmental_area_id', environmentalFeatures],
    ].map(([layer_name, description, geometry_type, primary_key, records]) => ({
      layer_name, path: `operational/${layer_name}.geojson`, description, geometry_type, primary_key,
      source_type: 'synthetic_demo', fields: schemaFor(records, layer_name),
      ...(layer_name === 'valves' ? { snapshot_paths: ['snapshots/previous/valves.geojson', 'snapshots/current/valves.geojson'] } : {}),
    })),
  ],
}

const relationships = {
  primary_and_foreign_keys: [
    { from: 'operational/pipelines.pipeline_id', to: 'operational/pipeline_segments.pipeline_id', cardinality: '1:M' },
    { from: 'operational/pipeline_segments.segment_id', to: 'operational/valves.segment_id', cardinality: '1:M' },
    { from: 'operational/pipelines.pipeline_id', to: 'operational/valves.pipeline_id', cardinality: '1:M' },
    { from: 'operational/pipelines.pipeline_id', to: 'operational/stations.pipeline_id', cardinality: '1:M' },
    { from: 'operational/pipelines.pipeline_id', to: 'operational/terminals.pipeline_id', cardinality: '1:M' },
    { from: 'operational/pipelines.pipeline_id', to: 'operational/facilities.pipeline_id', cardinality: '1:M' },
    { from: 'operational/pipelines.pipeline_id', to: 'operational/incidents.pipeline_id', cardinality: '1:M' },
    { from: 'operational/pipelines.pipeline_id', to: 'operational/work_orders.pipeline_id', cardinality: '1:M' },
    { from: 'operational/pipelines.pipeline_id', to: 'operational/inspections.pipeline_id', cardinality: '1:M' },
    { from: 'operational/pipelines.pipeline_id', to: 'operational/corrosion_records.pipeline_id', cardinality: '1:M' },
    { from: 'operational/pipelines.pipeline_id', to: 'operational/row_records.pipeline_id', cardinality: '1:1' },
    { from: 'operational/operating_areas.area_name', to: 'operational/pipelines.operating_area', cardinality: '1:M' },
    { from: 'operational/valves.asset_id (and other asset layers)', to: 'operational/inspections.asset_id', cardinality: '1:M' },
    { from: 'operational/valves.asset_id (and other asset layers)', to: 'operational/work_orders.asset_id', cardinality: '1:M' },
    { from: 'operational/incidents.incident_id', to: 'operational/leak_events.incident_id', cardinality: '1:M' },
    { from: 'operational/inspections.inspection_id', to: 'operational/corrosion_records.inspection_id', cardinality: '1:M' },
    { from: 'reference/pipelines.pipeline_id', to: 'operational/pipelines.reference_pipeline_id', cardinality: '1:1' },
  ],
  note: 'Except for records explicitly marked qa_expected_issue, synthetic operational references resolve to records in the corresponding parent dataset. Feature geometry is WGS 84 GeoJSON; generated distance values use geodesic calculations, not raw degree distances.',
}

const sourceRegistry = {
  as_of: DATA_AS_OF,
  study_area: { name: 'Midland–Odessa, Permian Basin, Texas', bbox_wgs84: [STUDY_AREA.xmin, STUDY_AREA.ymin, STUDY_AREA.xmax, STUDY_AREA.ymax] },
  sources: [
    { dataset: 'reference/pipelines.geojson', source_type: 'public_reference', source_name: 'U.S. DOE/NETL EIA pipeline Feature Service', source_url: SOURCE_URL, usage: 'Clipped reference geography only; no restricted operational data is inferred.', last_updated: null, retrieved_on: DATA_AS_OF, notes: 'Service layers 0–3: HGL, petroleum products, crude oil trunk, and natural gas interstate/intrastate. The public service exposes route geometry and limited fields. Local pipeline_id is a stable key derived from service layer/object ID.' },
    ...Object.entries(remoteData).map(([dataset, details]) => ({ dataset: `reference/${dataset}`, source_type: 'public_reference', source_name: details.source_name, source_url: details.url, usage: 'Live public reference service, loaded on demand in the current map extent.', last_updated: null, notes: details.note })),
    ...dataDictionary.datasets.filter((item) => item.source_type === 'synthetic_demo').map((item) => ({ dataset: item.path, source_type: 'synthetic_demo', source_name: 'Generated GeoAI Copilot demonstration data', source_url: null, usage: 'For software demos, QA, training, and GIS workflow prototyping only.', last_updated: DATA_AS_OF, notes: 'All operational attributes and records are synthetic; not operator, dispatch, integrity, environmental, SCADA, or safety data.' })),
  ],
}

writeJson(path.join(metadataDir, 'data_dictionary.json'), dataDictionary)
writeJson(path.join(metadataDir, 'relationships.json'), relationships)
writeJson(path.join(metadataDir, 'qa_rules.json'), { version: 1, expected_cases: [
  { dataset: 'operational/valves.geojson', feature_id: 'VAL-1105', rule_id: 'VALVE_PIPELINE_DISTANCE', note: '45 m away from assigned pipeline; threshold 25 m.' },
  { dataset: 'operational/valves.geojson', feature_id: 'VAL-1106', rule_id: 'MISSING_REQUIRED_ATTRIBUTE', field: 'status' },
  { dataset: 'operational/valves.geojson', feature_id: 'VAL-1107', rule_id: 'MISSING_REQUIRED_ATTRIBUTE', field: 'pipeline_id' },
  { dataset: 'operational/valves.geojson', feature_id: 'VAL-1001', rule_id: 'DUPLICATE_ASSET_ID', note: 'A duplicate feature with this ID is appended intentionally.' },
  { dataset: 'operational/pipeline_segments.geojson', feature_id: 'SEG-1010-2', rule_id: 'PIPELINE_SEGMENT_GAP', note: 'Segment start shifted 80 m from the previous segment end.' },
  { dataset: 'operational/incidents.geojson', feature_id: 'INC-2101', rule_id: 'INVALID_GEOMETRY', note: 'Null geometry is allowed by GeoJSON and intentionally used as a QA case.' },
  { dataset: 'operational/incidents.geojson', feature_id: 'INC-2101', rule_id: 'INVALID_ASSET_REFERENCE' },
  { dataset: 'operational/work_orders.geojson', feature_id: 'WO-7270', rule_id: 'ORPHAN_WORK_ORDER' },
  { dataset: 'operational/inspections.geojson', feature_id: 'INSP-5330', rule_id: 'ORPHAN_INSPECTION' },
  { dataset: 'snapshots/change_manifest.json', feature_id: 'VAL-1003', rule_id: 'RELATIONSHIP_CHANGE' },
], rules: qaRules.map(([rule_id, name, description, severity, layer, parameters]) => ({ rule_id, name, description, severity, layer, parameters })) })
writeJson(path.join(metadataDir, 'source_registry.json'), sourceRegistry)

const manifest = {
  name: 'Midstream GIS Demo Data Foundation',
  as_of: DATA_AS_OF,
  study_area: sourceRegistry.study_area,
  coordinate_reference_system: 'WGS 84 longitude/latitude (OGC CRS84 / EPSG:4326)',
  classification: 'Public reference geography is separated from synthetic operational demonstration data.',
  counts: Object.fromEntries(datasets.map(([name, rows, folder = 'reference']) => [`${folder}/${name}`, rows.length])),
  records_total_included_datasets: datasets.reduce((sum, [, rows]) => sum + rows.length, 0),
  remote_reference_datasets: Object.keys(remoteData),
  snapshots: { previous: snapshotPrevious.length, current: snapshotCurrent.length, changes: snapshotChanges.length },
}
writeJson(path.join(dataRoot, 'manifest.json'), manifest)

console.log(JSON.stringify({
  publicRoutes: publicRoutes.length,
  operationalCounts: manifest.counts,
  localTotal: manifest.records_total_included_datasets,
  snapshots: manifest.snapshots,
}, null, 2))

for (const source of SOURCE_LAYERS) {
  const intermediate = path.join(referenceDir, `netl-layer-${source.id}.geojson`)
  if (fs.existsSync(intermediate)) fs.unlinkSync(intermediate)
}
