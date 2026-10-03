import { useEffect, useRef, useState } from 'react'
import './App.css'
import GeoJSONLayer from '@arcgis/core/layers/GeoJSONLayer'

function App() {
    const [showAssets, setShowAssets] = useState(true)
  const assetLayerRef = useRef<GeoJSONLayer | null>(null)
  useEffect(() => {
    const mapElement = document.querySelector('arcgis-map')

    if (!mapElement) {
      return
    }

    const handleMapReady = () => {
      const layer = new GeoJSONLayer({
        url: '/data/midstream-assets.geojson',
        title: 'Midstream Assets',
        popupTemplate: {
          title: '{name}',
          content: [
            {
              type: 'fields',
              fieldInfos: [
                {
                  fieldName: 'asset_id',
                  label: 'Asset ID',
                },
                {
                  fieldName: 'asset_type',
                  label: 'Asset Type',
                },
                {
                  fieldName: 'status',
                  label: 'Status',
                },
              ],
            },
          ],
        },
      })
      assetLayerRef.current = layer

      if (!mapElement.map) {
        return
      }

      mapElement.map.add(layer)
    }

    mapElement.addEventListener(
      'arcgisViewReadyChange',
      handleMapReady,
    )

    return () => {
      mapElement.removeEventListener(
        'arcgisViewReadyChange',
        handleMapReady,
      )
    }
  }, [])
  useEffect(() => {
    if (assetLayerRef.current) {
      assetLayerRef.current.visible = showAssets
    }
  }, [showAssets])
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
          <arcgis-map
            basemap="osm"
            center="72.5714,23.0225"
            zoom={12}
          >
            <arcgis-zoom slot="top-left"></arcgis-zoom>
          </arcgis-map>
        </section>

        <section className="chat-area">
          <div className="layer-panel">
  <h3>Layers</h3>

  <label>
    <input
      type="checkbox"
      checked={showAssets}
      onChange={(event) => setShowAssets(event.target.checked)}
    />
    Midstream Assets
  </label>
</div>
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