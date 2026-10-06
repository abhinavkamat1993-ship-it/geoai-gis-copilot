import { useEffect, useRef, useState } from 'react'
import './App.css'
import GeoJSONLayer from '@arcgis/core/layers/GeoJSONLayer'
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer'
import Graphic from '@arcgis/core/Graphic'
import Point from '@arcgis/core/geometry/Point'
import * as geodesicBufferOperator from '@arcgis/core/geometry/operators/geodesicBufferOperator'

function App() {
  const [question, setQuestion] = useState('')
  const [queryLabel, setQueryLabel] = useState('Assets within 2 km')
    const [showAssets, setShowAssets] = useState(true)
    const [selectedPoint, setSelectedPoint] = useState<{
  longitude: number
  latitude: number
} | null>(null)
const [queryResults, setQueryResults] = useState<Graphic[]>([])
  const assetLayerRef = useRef<GeoJSONLayer | null>(null)
  const selectedPointLayerRef = useRef<GraphicsLayer | null>(null)
 
 const runWithinDistance = async (
  mapPoint: Parameters<typeof geodesicBufferOperator.execute>[0],
  distanceKm: number,
  assetType: string | null,
) => {
  if (!assetLayerRef.current || !selectedPointLayerRef.current) {
    return
  }
setQueryLabel(
  assetType
    ? `${assetType}s within ${distanceKm} km`
    : `Assets within ${distanceKm} km`,
)
  if (!geodesicBufferOperator.isLoaded()) {
    await geodesicBufferOperator.load()
  }

  const buffer = geodesicBufferOperator.execute(mapPoint, distanceKm, {
    unit: 'kilometers',
  })

  console.log(`${distanceKm} KM BUFFER:`, buffer)

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

  selectedPointLayerRef.current.add(bufferGraphic)

const result = await assetLayerRef.current.queryFeatures({
  geometry: buffer,
  spatialRelationship: 'intersects',
  where: assetType
    ? `asset_type = '${assetType}'`
    : '1=1',
  returnGeometry: true,
  outFields: ['*'],
})

  console.log(`ASSETS WITHIN ${distanceKm} KM:`, result.features)

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

 await runWithinDistance(mapPoint, 2, null)
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
<h3>{queryLabel}</h3>

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
  value={question}
  onChange={(event) => setQuestion(event.target.value)}
/>

          <button
  type="button"
onClick={async () => {
  
  const normalizedQuestion = question.toLowerCase().trim()

 const distanceMatch = normalizedQuestion.match(/within\s+(\d+(?:\.\d+)?)\s*km/)

if (distanceMatch) {
  const distanceKm = Number(distanceMatch[1])
  
  let assetType: string | null = null

if (normalizedQuestion.includes('valve')) {
  assetType = 'Valve'
} else if (normalizedQuestion.includes('pump station')) {
  assetType = 'Pump Station'
} else if (normalizedQuestion.includes('facility')) {
  assetType = 'Facility'
}


setQueryLabel(
  assetType
    ? `${assetType}s within ${distanceKm} km`
    : `Assets within ${distanceKm} km`,
)
if (!geodesicBufferOperator.isLoaded()) {
    await geodesicBufferOperator.load()
  }
    console.log('GIS INTENT:', {
      operation: 'WITHIN_DISTANCE',
      distance: distanceKm,
      unit: 'kilometers',
      layer: 'Midstream Assets',
    })

    if (!selectedPoint) {
      console.log('No reference point selected')
      return
    }

    console.log('REFERENCE POINT:', selectedPoint)

    const mapElement = document.querySelector('arcgis-map')

    if (!mapElement) {
      return
    }

 runWithinDistance(
  new Point({
    longitude: selectedPoint.longitude,
    latitude: selectedPoint.latitude,
    spatialReference: {
      wkid: 4326,
    },
  }),
  distanceKm,
  assetType,
)
  } else {
    console.log('GIS INTENT: Not recognized')
  }
}}
>
  Send
</button>
        </section>
      </main>
    </div>
  )
}

export default App