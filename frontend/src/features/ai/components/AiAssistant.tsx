import type { ChatMessage } from '../types/ai'
import type { MapTool } from '../../gis-tools/types/gisTool'
import type { RightTab } from '../../workspace/types'

type AiAssistantProps = {
  tab: RightTab
  messages: ChatMessage[]
  question: string
  loading: boolean
  onTabChange: (tab: RightTab) => void
  onQuestionChange: (value: string) => void
  onSubmitQuestion: (question?: string) => void
  onActivateMapTool: (tool: MapTool) => void
  onCollapsePanel: () => void
}

export function AiAssistant({
  tab, messages, question, onTabChange, onQuestionChange,
  onSubmitQuestion, onActivateMapTool, onCollapsePanel, loading,
}: AiAssistantProps) {
  return (
    <section className="assistant-panel">
      <div className="assistant-tabs">
        {(['chat', 'history', 'tools'] as RightTab[]).map((item) => (
          <button key={item} type="button" className={tab === item ? 'active' : ''} onClick={() => onTabChange(item)}>
            {item === 'chat' ? '▣ Chat' : item === 'history' ? '◷ History' : '⚒ Tools'}
          </button>
        ))}
        <button type="button" className="assistant-collapse-button" aria-label="Collapse analysis and chat panel" title="Collapse analysis and chat panel" onClick={onCollapsePanel}>›</button>
      </div>
      {tab === 'chat' && <div className="chat-content">
        <div className="chat-history">
          {messages.map((message, index) => (
            <div key={message.role + '-' + index} className={'chat-message ' + message.role}>
              <span className="chat-avatar">{message.role === 'ai' ? '✦' : 'A'}</span>
              <div className="chat-bubble">
                <div>{message.text}</div>
                {message.analysis && <details className="copilot-details">
                  <summary>Analysis Details</summary>
                  <ol>{message.analysis.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}</ol>
                </details>}
                {message.trust && Object.keys(message.trust).length > 0 && <div className="copilot-trust">
                  {(['fact', 'inference', 'recommendation'] as const).filter((kind) => message.trust?.[kind]).map((kind) => (
                    <p key={kind}><strong>{kind.toUpperCase()}:</strong> {message.trust?.[kind]}</p>
                  ))}
                </div>}
                {message.warnings?.map((warning, warningIndex) => <p className="copilot-warning" key={warningIndex}>{warning}</p>)}
                {message.results && message.results.length > 0 && <details className="copilot-results">
                  <summary>Results Table ({message.results.length})</summary>
                  <div className="copilot-table-wrap"><table>
                    <thead><tr><th>Asset ID</th><th>Type</th><th>Status</th><th>Pipeline</th><th>Distance</th></tr></thead>
                    <tbody>{message.results.map((result) => <tr key={result.layer + result.id}>
                      <td>{result.id}</td><td>{String(result.attributes.asset_type ?? result.attributes.station_type ?? result.attributes.facility_type ?? '—')}</td>
                      <td>{String(result.attributes.status ?? result.attributes.criticality ?? '—')}</td>
                      <td>{String(result.attributes.pipeline_id ?? '—')}</td>
                      <td>{result.distance_m == null ? '—' : `${result.distance_m.toFixed(0)} m`}</td>
                    </tr>)}</tbody>
                  </table></div>
                </details>}
              </div>
            </div>
          ))}
        </div>
        <div className="suggestions">
          <span>Suggested questions:</span>
          <div>
            <button type="button" onClick={() => onSubmitQuestion('Find critical assets within 5 km')}>Critical assets</button>
            <button type="button" onClick={() => onSubmitQuestion('Find pump stations within 5 km')}>Find pump stations</button>
            <button type="button" onClick={() => onSubmitQuestion('Find facilities within 5 km')}>Find facilities</button>
            <button type="button" onClick={() => onSubmitQuestion('Find assets within 10 km')}>Assets within 10 km</button>
          </div>
        </div>
        <div className="chat-input">
          <input
            placeholder="Ask anything about your GIS data..."
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !loading) onSubmitQuestion() }}
            disabled={loading}
          />
          <button type="button" onClick={() => onSubmitQuestion()} disabled={loading}>{loading ? '…' : '➤'}</button>
        </div>
      </div>}
      {tab === 'history' && <div className="tab-content">
        <h3>Conversation History</h3>
        {messages.map((message, index) => (
          <div className="history-row" key={message.role + '-' + index}>
            <span>{message.role === 'user' ? 'You' : 'GeoAI'}</span><p>{message.text}</p>
          </div>
        ))}
      </div>}
      {tab === 'tools' && <div className="tab-content tools-tab">
        <h3>GIS Tools</h3>
        <div className="tool-grid">
          <button type="button" onClick={() => onActivateMapTool('draw-polygon')}>⬡ Draw Polygon</button>
          <button type="button" onClick={() => onActivateMapTool('draw-line')}>〰 Draw Line</button>
          <button type="button" onClick={() => onActivateMapTool('measure-distance')}>📏 Measure Distance</button>
          <button type="button" onClick={() => onActivateMapTool('measure-area')}>📐 Measure Area</button>
          <button type="button" onClick={() => onActivateMapTool('identify-feature')}>🔎 Identify Feature</button>
          <button type="button">📸 Screenshot</button>
          <button type="button">📦 Export KMZ</button>
          <button type="button">📊 Export CSV</button>
          <button type="button">📄 PDF Report</button>
        </div>
      </div>}
    </section>
  )
}
