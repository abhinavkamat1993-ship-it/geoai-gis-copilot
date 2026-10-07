import type { OperationalLayer } from '../connectors'
import type MapView from '@arcgis/core/views/MapView'
import Extent from '@arcgis/core/geometry/Extent'
import { publicDataExploreExtent } from '../../../core/config/mapConfig'
import type { PopupTemplateCreatorEvent } from '@arcgis/core/popup/types'
import type { LayerDefinition } from '../layerDefinitions'

function escapeHtml(value: unknown): string {
  return String(value ?? '—').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character)
}

const popupFields: Record<string, string[]> = {
  'public-pipeline-routes': ['pipeline_id', 'pipeline_type', 'product', 'operator_name', 'pipeline_name', 'source_type', 'source_url'],
  pipelines: ['pipeline_id', 'pipeline_name', 'pipeline_type', 'product', 'operator', 'status', 'diameter_in', 'length_km', 'operating_area', 'source_type', 'reference_pipeline_id'],
  'pipeline-segments': ['segment_id', 'pipeline_id', 'from_node', 'to_node', 'segment_status', 'diameter_in', 'material', 'length_km', 'operating_area', 'criticality'],
  valves: ['asset_id', 'valve_type', 'status', 'pipeline_id', 'segment_id', 'criticality', 'diameter_in', 'last_inspection_date', 'operating_area'],
  stations: ['station_id', 'station_name', 'station_type', 'status', 'pipeline_id', 'criticality', 'capacity', 'commission_date'],
  terminals: ['terminal_id', 'terminal_name', 'terminal_type', 'status', 'capacity', 'operating_area', 'pipeline_connections', 'criticality'],
  facilities: ['facility_id', 'facility_name', 'facility_type', 'status', 'pipeline_id', 'operating_area', 'criticality'],
  incidents: ['incident_id', 'incident_type', 'severity', 'status', 'asset_id', 'pipeline_id', 'reported_date', 'description'],
  'leak-events': ['leak_id', 'incident_id', 'asset_id', 'pipeline_id', 'detected_date', 'severity', 'estimated_volume', 'detection_method', 'status'],
  'work-orders': ['work_order_id', 'asset_id', 'pipeline_id', 'work_type', 'priority', 'status', 'created_date', 'assigned_team'],
  inspections: ['inspection_id', 'asset_id', 'pipeline_id', 'inspection_type', 'inspection_date', 'condition', 'risk_score', 'inspector', 'finding'],
  'corrosion-records': ['corrosion_id', 'asset_id', 'pipeline_id', 'inspection_id', 'corrosion_type', 'severity', 'depth_percent', 'status', 'recommended_action'],
  'right-of-way': ['row_id', 'pipeline_id', 'width_m', 'status', 'landowner_type', 'operating_area', 'inspection_status', 'last_inspection_date'],
  'environmental-areas': ['environmental_area_id', 'area_name', 'designation', 'status', 'operating_area', 'related_pipeline_id', 'source_type'],
  'operating-areas': ['area_id', 'area_name', 'region', 'manager', 'status', 'source_type'],
}

const popupTitle: Record<string, string> = {
  'public-pipeline-routes': '{pipeline_id} · Public pipeline route',
  pipelines: '{pipeline_name}',
  'pipeline-segments': '{segment_id}',
  valves: '{asset_id}',
  stations: '{station_name}',
  terminals: '{terminal_name}',
  facilities: '{facility_name}',
  incidents: '{incident_id}',
  'leak-events': '{leak_id}',
  'work-orders': '{work_order_id}',
  inspections: '{inspection_id}',
  'corrosion-records': '{corrosion_id}',
  'right-of-way': '{row_id}',
  'environmental-areas': '{area_name}',
  'operating-areas': '{area_name}',
}

/** Keep popups task-focused and escape external service values before rendering HTML. */
export function createFeaturePopupTemplate(definition: LayerDefinition) {
  const fields = popupFields[definition.id]
  const title = popupTitle[definition.id] ?? definition.name
  return {
    title,
    content: (event: PopupTemplateCreatorEvent) => {
      const attributes = event.graphic?.attributes || {}
      const rows = fields
        ? fields.map((field) => [field, attributes[field]] as const)
        : Object.entries(attributes)
      return rows.map(([key, value]) => (
        '<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;">' +
        '<strong>' + escapeHtml(key) + '</strong><span>' + escapeHtml(value) + '</span></div>'
      )).join('')
    },
  }
}

/** Zooms to features in the bounded exploration area for public national services. */
export async function zoomToLayer(
  mapView: MapView,
  layer: OperationalLayer,
  definition: LayerDefinition,
): Promise<void> {
  await layer.load()
  const searchExtent = definition.sourceType === 'ArcGIS Feature Service'
    ? new Extent(publicDataExploreExtent)
    : undefined
  const { extent } = await layer.queryExtent(
    searchExtent ? { geometry: searchExtent, spatialRelationship: 'intersects' } : {},
  )

  if (extent) {
    await mapView.goTo(extent.expand(1.4))
  } else if (searchExtent) {
    // Keep zoom-to useful even when a particular service has no features in the window.
    await mapView.goTo(searchExtent)
  }
}
