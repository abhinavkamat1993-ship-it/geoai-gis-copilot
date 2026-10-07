type AnalysisResultsProps = {
  total: number
  valves: number
  pumpStations: number
  facilities: number
  queryLabel: string
  hasSelectedPoint: boolean
  summary: string
  onClear: () => void
}

export function AnalysisResults({
  total, valves, pumpStations, facilities, queryLabel,
  hasSelectedPoint, summary, onClear,
}: AnalysisResultsProps) {
  const distance = queryLabel.match(/\d+(?:\.\d+)?\s*(?:km|kilometers?|m|meters?)/i)?.[0] ?? '—'
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
        <button type="button">⇩ Export Results</button>
      </div>
    </section>
  )
}
