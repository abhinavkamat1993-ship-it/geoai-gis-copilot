import type Graphic from '@arcgis/core/Graphic'

export type ResultExportMetadata = {
  queryLabel: string
  summary: string
}

function attributeValue(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function csvCell(value: unknown): string {
  const text = attributeValue(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function featureId(attributes: Record<string, unknown>): unknown {
  return attributes.feature_id ?? attributes.asset_id ?? attributes.id ?? attributes.OBJECTID ?? attributes.objectid ?? null
}

function downloadFile(contents: string, filename: string, mimeType: string) {
  const blob = new Blob([contents], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function exportResultsCsv(features: Graphic[]) {
  const attributes = features.map((feature) => feature.attributes as Record<string, unknown> ?? {})
  const fields = [...new Set(attributes.flatMap((item) => Object.keys(item)))]
  const columns = ['feature_id', 'layer', ...fields.filter((field) => field !== 'feature_id' && field !== 'layer')]
  const rows = features.map((_, index) => {
    const item = attributes[index]
    return [
      featureId(item),
      item.layer_name ?? item.layer ?? null,
      ...fields.filter((field) => field !== 'feature_id' && field !== 'layer').map((field) => item[field]),
    ]
  })
  const csv = [columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
  downloadFile(`\uFEFF${csv}`, 'geoai-results.csv', 'text/csv;charset=utf-8')
}

export function exportResultsJson(features: Graphic[], metadata: ResultExportMetadata) {
  const payload = {
    query: metadata.queryLabel,
    summary: metadata.summary,
    result_count: features.length,
    features: features.map((feature) => {
      const attributes = feature.attributes as Record<string, unknown> ?? {}
      return {
        id: featureId(attributes),
        layer: attributes.layer_name ?? attributes.layer ?? null,
        attributes,
        geometry: feature.geometry?.toJSON() ?? null,
      }
    }),
  }
  downloadFile(JSON.stringify(payload, null, 2), 'geoai-results.json', 'application/json;charset=utf-8')
}
