import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>GeoAI Copilot</h1>
          <p>Your intelligent GIS assistant</p>
        </div>
      </header>

      <main className="app-main">
        <section className="map-area">
          <div className="map-placeholder">
            <h2>GIS Map</h2>
            <p>Interactive map will appear here.</p>
          </div>
        </section>

        <section className="chat-area">
          <input
            type="text"
            placeholder="Ask a GIS question..."
          />

          <button type="button">
            Send
          </button>
        </section>
      </main>
    </div>
  )
}

export default App