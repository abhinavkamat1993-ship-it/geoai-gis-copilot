import { useEffect, useRef, useState } from 'react'
import './App.css'
import GeoJSONLayer from '@arcgis/core/layers/GeoJSONLayer'
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer'
import Graphic from '@arcgis/core/Graphic'
import * as geodesicBufferOperator from '@arcgis/core/geometry/operators/geodesicBufferOperator'

function App() {
    const [showAssets, setShowAssets] = useState(true)
    const [selectedPoint, setSelectedPoint] = useState<{
  longitude: number
  latitude: number
} | null>(null)
const [queryResults, setQueryResults] = useState<Graphic[]>([])
  const assetLayerRef = useRef<GeoJSONLayer | null>(null)
  const selectedPointLayerRef = useRef<GraphicsLayer | null>(null)
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

const selectedPointLayer = new GraphicsLayer({
  title: 'Selected Location',
})

selectedPointLayerRef.current = selectedPointLayer

mapElement.map.add(selectedPointLayer)

const handleMapClick = async (event: CustomEvent) => {
  console.log('MAP CLICK DETECTED', event)

  const { mapPoint } = event.detail

  setSelectedPoint({
    longitude: mapPoint.longitude,
    latitude: mapPoint.latitude,
  })
  if (selectedPointLayerRef.current) {
  selectedPointLayerRef.current.removeAll()

  const graphic = new Graphic({
    geometry: mapPoint,
    symbol: {
      type: 'simple-marker',
      style: 'circle',
      color: 'red',
      size: '14px',
      outline: {
        color: 'white',
        width: 2,
      },
    },
  })

  selectedPointLayerRef.current.add(graphic)
}
if (!geodesicBufferOperator.isLoaded()) {
  await geodesicBufferOperator.load()
}
const buffer = geodesicBufferOperator.execute(mapPoint, 2, {
  unit: 'kilometers',
})

console.log('2 KM BUFFER:', buffer)
const bufferGraphic = new Graphic({
  geometry: buffer,
  symbol: {
    type: 'simple-fill',
    color: [255, 0, 0, 0.15],
    outline: {
      color: 'red',
      width: 2,
    },
  },
})

selectedPointLayerRef.current?.add(bufferGraphic)
const result = await layer.queryFeatures({
  geometry: buffer,
  spatialRelationship: 'intersects',
  returnGeometry: true,
  outFields: ['*'],
})

console.log('ASSETS WITHIN 2 KM:', result.features)
setQueryResults(result.features)
result.features.forEach((feature) => {
  const resultGraphic = new Graphic({
    geometry: feature.geometry,
    symbol: {
      type: 'simple-marker',
      style: 'diamond',
      color: 'blue',
      size: '16px',
      outline: {
        color: 'white',
        width: 2,
      },
    },
  })

  selectedPointLayerRef.current?.add(resultGraphic)
})
}

mapElement.addEventListener('arcgisViewClick', handleMapClick)
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
          <div className="results-panel">
  <h3>Assets within 2 km</h3>

  <p>{queryResults.length} asset(s) found</p>

 {queryResults.map((feature) => (
  <div
  key={feature.attributes.asset_id}
  role="button"
  tabIndex={0}
  onClick={() => {
    console.log('RESULT CLICKED:', feature.attributes.name)

    const mapElement = document.querySelector('arcgis-map')

    if (mapElement && feature.geometry) {
      mapElement.view.goTo({
        target: feature.geometry,
        zoom: 15,
      })
    }
  }}
  style={{ cursor: 'pointer' }}
>
  <strong>{feature.attributes.name}</strong>
  <br />
  <span>{feature.attributes.asset_type}</span>
</div>
))}
</div>
          {selectedPoint && (
  <div>
    <h3>Selected Location</h3>
    <p>Longitude: {selectedPoint.longitude.toFixed(5)}</p>
    <p>Latitude: {selectedPoint.latitude.toFixed(5)}</p>
  </div>
)}
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