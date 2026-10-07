import { useState } from 'react'
import type Graphic from '@arcgis/core/Graphic'
import { exportResultsCsv, exportResultsJson } from '../../ai/services/resultExport'

type AnalysisResultsProps = {
  total: number
  valves: number
  pumpStations: number
  facilities: number
  queryLabel: string
  hasSelectedPoint: boolean
  summary: string
  results: Graphic[]
  onClear: () => void
}

export function AnalysisResults({
  total, valves, pumpStations, facilities, queryLabel,
  hasSelectedPoint, summary, results, onClear,
}: AnalysisResultsProps) {
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const distance = queryLabel.match(/\d+(?:\.\d+)?\s*(?:km|kilometers?|m|meters?)/i)?.[0] ?? '—'
  const exportMetadata = { queryLabel, summary }
  return (
    <section className="analysis-card">
      <div className="analysis-header">
        <strong>▥ ANALYSIS RESULTS</strong>
        <button type="button" onClick={onClear}>Clear Results</button>
      </div>
      <div className="result-stats">
        <div><strong>{total}</strong><span>Assets Found</span></div>
        <div><strong>{valves}</strong><span>Valves</span></div>
        <div><strong>{pumpStations}</strong><span>Pump Stations</span></div>
        <div><strong>{facilities}</strong><span>Facilities</span></div>
      </div>
      <div className="analysis-meta">
        <span>◉ Radius: {distance}</span>
        <span>📍 {hasSelectedPoint ? 'Using selected location' : 'No location selected'}</span>
      </div>
      {summary && <p className="analysis-summary" role="status">{summary}</p>}
      <div className="analysis-actions">
        <button type="button">View Results Table →</button>
        <div
          className="result-export"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setExportMenuOpen(false)
          }}
        >
          <button
            type="button"
            className="result-export-trigger"
            aria-label="Export analysis results"
            aria-haspopup="menu"
            aria-expanded={exportMenuOpen}
            title={results.length ? 'Export GIS result features' : 'Run an analysis before exporting'}
            disabled={results.length === 0}
            onClick={() => setExportMenuOpen((open) => !open)}
            onKeyDown={(event) => { if (event.key === 'Escape') setExportMenuOpen(false) }}
          >
            ⇩ Export ▾
          </button>
          {exportMenuOpen && <div className="result-export-menu" role="menu" aria-label="Export format" onKeyDown={(event) => { if (event.key === 'Escape') setExportMenuOpen(false) }}>
            <button type="button" role="menuitem" onClick={() => { exportResultsCsv(results); setExportMenuOpen(false) }}>CSV</button>
            <button type="button" role="menuitem" onClick={() => { exportResultsJson(results, exportMetadata); setExportMenuOpen(false) }}>JSON</button>
          </div>}
        </div>
      </div>
    </section>
  )
}
