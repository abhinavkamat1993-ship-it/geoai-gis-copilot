type WorkspaceHeaderProps = {
  question: string
  onQuestionChange: (value: string) => void
  onSubmitQuestion: () => void
  onOpenTools: () => void
}

/** Shared header-level query entry point and app actions. */
export function WorkspaceHeader({
  question,
  onQuestionChange,
  onSubmitQuestion,
  onOpenTools,
}: WorkspaceHeaderProps) {
  return (
    <header className="top-header">
      <div className="brand">
        <div className="brand-mark">✦</div>
        <div><h1>GeoAI Copilot</h1><p>AI-Powered Spatial Intelligence</p></div>
      </div>
      <form className="global-search" onSubmit={(event) => {
        event.preventDefault()
        onSubmitQuestion()
      }}>
        <span>⌕</span>
        <input
          placeholder="Ask anything about your GIS data..."
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
        />
        <button type="submit" aria-label="Run spatial query">➤</button>
      </form>
      <div className="header-actions">
        <button className="header-button" type="button" onClick={onOpenTools}>⚒ GIS Tools ▾</button>
        <button className="header-button" type="button">⇩ Export ▾</button>
        <span className="header-divider" />
        <span className="notification">♧</span>
        <button className="profile" type="button">A <span>▾</span></button>
      </div>
    </header>
  )
}
