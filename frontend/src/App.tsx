import { useEffect, useRef, useState } from 'react'
import './App.css'

import GeoJSONLayer from '@arcgis/core/layers/GeoJSONLayer'
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer'
import Graphic from '@arcgis/core/Graphic'
import Point from '@arcgis/core/geometry/Point'
import * as geodesicBufferOperator from '@arcgis/core/geometry/operators/geodesicBufferOperator'

type ChatMessage = {
  role: 'user' | 'ai'
  text: string
}

type RightTab = 'chat' | 'history' | 'tools'
type LayerDefinition = {
  id: string
  name: string
  category: string
  url: string
  visible: boolean
}

const layerDefinitions: LayerDefinition[] = [
  // Assets
  {
    id: 'valves',
    name: 'Valves',
    category: 'Assets',
    url: '/data/valves.geojson',
    visible: true,
  },
  {
    id: 'pump-stations',
    name: 'Pump Stations',
    category: 'Assets',
    url: '/data/pump_stations.geojson',
    visible: true,
  },
  {
    id: 'compressor-stations',
    name: 'Compressor Stations',
    category: 'Assets',
    url: '/data/compressor_stations.geojson',
    visible: true,
  },
  {
    id: 'meter-stations',
    name: 'Meter Stations',
    category: 'Assets',
    url: '/data/meter_stations.geojson',
    visible: true,
  },
  {
    id: 'facilities',
    name: 'Facilities',
    category: 'Assets',
    url: '/data/facilities.geojson',
    visible: true,
  },
  {
    id: 'storage-tanks',
    name: 'Storage Tanks',
    category: 'Assets',
    url: '/data/storage_tanks.geojson',
    visible: true,
  },
  {
    id: 'tank-farms',
    name: 'Tank Farms',
    category: 'Assets',
    url: '/data/tank_farms.geojson',
    visible: true,
  },

  // Pipeline
  {
    id: 'pipelines',
    name: 'Pipelines',
    category: 'Pipeline',
    url: '/data/pipelines.geojson',
    visible: true,
  },
  {
    id: 'pipeline-crossings',
    name: 'Pipeline Crossings',
    category: 'Pipeline',
    url: '/data/pipeline_crossings.geojson',
    visible: true,
  },
  {
    id: 'right-of-way',
    name: 'Right of Way',
    category: 'Pipeline',
    url: '/data/right_of_way.geojson',
    visible: true,
  },

  // Operations
  {
    id: 'inspections',
    name: 'Inspections',
    category: 'Operations',
    url: '/data/inspections.geojson',
    visible: true,
  },
  {
    id: 'work-orders',
    name: 'Work Orders',
    category: 'Operations',
    url: '/data/work_orders.geojson',
    visible: true,
  },
  {
    id: 'leak-events',
    name: 'Leak Events',
    category: 'Operations',
    url: '/data/leak_events.geojson',
    visible: true,
  },

  // Environment
  {
    id: 'environmental-sites',
    name: 'Environmental Sites',
    category: 'Environment',
    url: '/data/environmental_sites.geojson',
    visible: true,
  },
  {
    id: 'water-bodies',
    name: 'Water Bodies',
    category: 'Environment',
    url: '/data/water-bodies.geojson',
    visible: true,
  },

  // Reference
  {
    id: 'roads',
    name: 'Roads',
    category: 'Reference',
    url: '/data/roads.geojson',
    visible: true,
  },
]


function App() {
  const [question, setQuestion] = useState('')
  const [queryLabel, setQueryLabel] = useState('Assets within 2 km')

  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({
  Pipelines: true,
  'Pump Stations': true,
  Facilities: true,
  ROW: true,
  Roads: true,
  'Water Bodies': true,
  Incidents: false,
})
  const [selectedPoint, setSelectedPoint] = useState<{
    longitude: number
    latitude: number
  } | null>(null)
  const [queryResults, setQueryResults] = useState<Graphic[]>([])
  const [rightTab, setRightTab] = useState<RightTab>('chat')
  const [basemap, setBasemap] = useState('osm')
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: 'ai',
      text: 'Select a point on the map and ask a spatial question.',
    },
  ])

  const assetLayerRef = useRef<GeoJSONLayer | null>(null)
  const operationalLayersRef = useRef<Record<string, GeoJSONLayer>>({})
  const selectedPointLayerRef = useRef<GraphicsLayer | null>(null)
  const mapRef = useRef<HTMLElement | null>(null)

  const runWithinDistance = async (
    mapPoint: Parameters<typeof geodesicBufferOperator.execute>[0],
    distanceKm: number,
    assetType: string | null,
  ) => {
    if (!assetLayerRef.current || !selectedPointLayerRef.current) return

    selectedPointLayerRef.current.removeAll()

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

    selectedPointLayerRef.current.add(
      new Graphic({
        geometry: buffer,
        symbol: {
          type: 'simple-fill',
          color: [255, 0, 0, 0.14],
          outline: { color: 'red', width: 2 },
        },
      }),
    )

    const result = await assetLayerRef.current.queryFeatures({
      geometry: buffer,
      spatialRelationship: 'intersects',
      where: assetType ? `asset_type = '${assetType}'` : '1=1',
      returnGeometry: true,
      outFields: ['*'],
    })

    setQueryResults(result.features)

    result.features.forEach((feature) => {
      selectedPointLayerRef.current?.add(
        new Graphic({
          geometry: feature.geometry,
          symbol: {
            type: 'simple-marker',
            style: 'diamond',
            color: 'blue',
            size: '16px',
            outline: { color: 'white', width: 2 },
          },
        }),
      )
    })

    return result.features.length
  }

  const submitQuestion = async (text = question) => {
    const normalizedQuestion = text.toLowerCase().trim()
    if (!normalizedQuestion) return

    setQuestion('')
    setChatHistory((current) => [
      ...current,
      { role: 'user', text },
    ])

    const distanceMatch = normalizedQuestion.match(
      /within\s+(\d+(?:\.\d+)?)\s*km/,
    )

    if (!distanceMatch) {
      setChatHistory((current) => [
        ...current,
        {
          role: 'ai',
          text: 'I can currently handle spatial questions such as “Find valves within 5 km”.',
        },
      ])
      return
    }

    const distanceKm = Number(distanceMatch[1])
    let assetType: string | null = null

    if (normalizedQuestion.includes('valve')) {
      assetType = 'Valve'
    } else if (normalizedQuestion.includes('pump station')) {
      assetType = 'Pump Station'
    } else if (normalizedQuestion.includes('facility')) {
      assetType = 'Facility'
    }

    if (!selectedPoint) {
      setChatHistory((current) => [
        ...current,
        {
          role: 'ai',
          text: 'Please select a point on the map first. I will use that location as the spatial reference.',
        },
      ])
      return
    }

    const resultCount = await runWithinDistance(
      new Point({
        longitude: selectedPoint.longitude,
        latitude: selectedPoint.latitude,
        spatialReference: { wkid: 4326 },
      }),
      distanceKm,
      assetType,
    )

    setChatHistory((current) => [
      ...current,
      {
        role: 'ai',
        text: `I found ${resultCount ?? 0} ${
          assetType ? `${assetType.toLowerCase()}s` : 'assets'
        } within ${distanceKm} km of the selected location.`,
      },
    ])
  }

  useEffect(() => {
    const mapElement = document.querySelector('arcgis-map') as HTMLElement | null
    if (!mapElement) return

    mapRef.current = mapElement

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
                { fieldName: 'asset_id', label: 'Asset ID' },
                { fieldName: 'asset_type', label: 'Asset Type' },
                { fieldName: 'status', label: 'Status' },
              ],
            },
          ],
        },
      })

const createPopupTemplate = (title: string) => ({
  title,
  content: (event: any) => {
    const attributes = event.graphic.attributes || {}

    return Object.entries(attributes)
      .map(
        ([key, value]) =>
          `<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;">
            <strong>${key}</strong>
            <span>${value ?? '—'}</span>
          </div>`,
      )
      .join('')
  },
})
const operationalLayers = layerDefinitions.map((definition) => {
  return new GeoJSONLayer({
    url: definition.url,
    title: definition.name,
    visible: definition.visible,
    popupTemplate: createPopupTemplate(definition.name),
  })
})
      assetLayerRef.current = layer

      const map = (mapElement as any).map
      if (!map) return

      map.add(layer)
operationalLayers.forEach((operationalLayer) => {
  map.add(operationalLayer)
  operationalLayersRef.current[operationalLayer.title ?? ''] = operationalLayer
})
      const selectedPointLayer = new GraphicsLayer({
        title: 'Selected Location',
      })

      selectedPointLayerRef.current = selectedPointLayer
      map.add(selectedPointLayer)

      const handleMapClick = async (event: Event) => {
       const { mapPoint } = (event as CustomEvent).detail

        setSelectedPoint({
          longitude: mapPoint.longitude,
          latitude: mapPoint.latitude,
        })

        selectedPointLayerRef.current?.removeAll()

        selectedPointLayerRef.current?.add(
          new Graphic({
            geometry: mapPoint,
            symbol: {
              type: 'simple-marker',
              style: 'circle',
              color: 'red',
              size: '16px',
              outline: { color: 'white', width: 2 },
            },
          }),
        )

        await runWithinDistance(mapPoint, 2, null)

      // Keep the selected location visible above the analysis graphics.
      selectedPointLayerRef.current?.add(
        new Graphic({
          geometry: mapPoint,
          symbol: {
            type: 'simple-marker',
            style: 'circle',
            color: 'red',
            size: '18px',
            outline: {
              color: 'white',
              width: 2.5,
            },
          },
        }),
      )
      }

      mapElement.addEventListener('arcgisViewClick', handleMapClick)

      ;(mapElement as any).__geoAiMapClick = handleMapClick
    }

    mapElement.addEventListener('arcgisViewReadyChange', handleMapReady)

    return () => {
      const clickHandler = (mapElement as any).__geoAiMapClick
      if (clickHandler) {
        mapElement.removeEventListener('arcgisViewClick', clickHandler)
      }
      mapElement.removeEventListener('arcgisViewReadyChange', handleMapReady)
    }
  }, [])

  useEffect(() => {
    const map = (mapRef.current as any)?.map
    if (map) {
      map.basemap = basemap
    }
  }, [basemap])

  const valves = queryResults.filter(
    (feature) => feature.attributes?.asset_type === 'Valve',
  ).length

  const pumpStations = queryResults.filter(
    (feature) => feature.attributes?.asset_type === 'Pump Station',
  ).length

  const facilities = queryResults.filter(
    (feature) => feature.attributes?.asset_type === 'Facility',
  ).length
const layerCategories = [...new Set(layerDefinitions.map((layer) => layer.category))]
  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="brand">
          <div className="brand-mark">✦</div>
          <div>
            <h1>GeoAI Copilot</h1>
            <p>AI-Powered Spatial Intelligence</p>
          </div>
        </div>

        <div className="global-search">
          <span>⌕</span>
          <input
            placeholder="Ask anything about your GIS data..."
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitQuestion()
            }}
          />
        </div>

        <div className="header-actions">
          <button type="button" className="header-button">
            ⚒ GIS Tools ▾
          </button>
          <button type="button" className="header-button">
            ⇩ Export ▾
          </button>
          <span className="header-divider" />
          <span className="notification">♧</span>
          <button type="button" className="profile">
            A <span>▾</span>
          </button>
        </div>
      </header>

      <main className="main-grid">
        <aside className="left-panel">
          <section className="panel-section">
            <div className="panel-heading">
              <h2>LAYERS</h2>
              <button type="button">＋</button>
            </div>

            <div className="layer-search">
              <span>⌕</span>
              <input placeholder="Search layers..." />
            </div>

            <div className="layer-list">
             {layerCategories.map((category) => (
  <div key={category} className="layer-category">
    <div className="layer-category-title">
      <span>▾</span>
      <strong>{category}</strong>
    </div>

    {layerDefinitions
      .filter((layer) => layer.category === category)
      .map((layer) => (
        <label key={layer.id}>
          <input
            type="checkbox"
            checked={
              layerVisibility[layer.name] ?? layer.visible
            }
            onChange={(event) => {
              const visible = event.target.checked

              setLayerVisibility((current) => ({
                ...current,
                [layer.name]: visible,
              }))

              const mapLayer =
                operationalLayersRef.current[layer.name]

              if (mapLayer) {
                mapLayer.visible = visible
              }
            }}
          />

          {layer.name}

          <span>•••</span>
        </label>
      ))}
  </div>
))}
            </div>
          </section>

          <section className="panel-section map-tools-section">
            <h2>MAP TOOLS</h2>
            <button className="tool-row active" type="button">📍 Select Point</button>
            <button className="tool-row" type="button">⬡ Draw Polygon</button>
            <button className="tool-row" type="button">〰 Draw Line</button>
            <button className="tool-row" type="button">📏 Measure Distance</button>
            <button className="tool-row" type="button">📐 Measure Area</button>
            <button className="tool-row" type="button">🔎 Identify Feature</button>
          </section>

          <section className="panel-section recent-section">
            <h2>RECENT QUERIES</h2>
            <button type="button" onClick={() => setQuestion('Find valves within 5 km')}>Find valves within 5 km <span>2m ago</span></button>
            <button type="button" onClick={() => setQuestion('Find pump stations within 5 km')}>Find pump stations within 5 km <span>15m ago</span></button>
            <button type="button" onClick={() => setQuestion('Find critical assets within 5 km')}>Critical assets near pipeline <span>1h ago</span></button>
            <button type="button" onClick={() => setQuestion('Find facilities within 10 km')}>Facilities within 10 km <span>2h ago</span></button>
          </section>
        </aside>

        <section className="map-workspace">
          <div className="map-container">
            <arcgis-map basemap={basemap} center="72.5714,23.0225" zoom={12}>
              <arcgis-zoom slot="top-left" />
            </arcgis-map>

            <div className="map-search">
              <span>⌕</span>
              <input placeholder="Search location..." />
            </div>

            <div className="map-legend">
              <strong>Legend</strong>
              <span>🔴 Selected Location</span>
              <span>▧ Analysis Buffer ({queryLabel.match(/\d+(?:\.\d+)?/)?.[0] || 2} km)</span>
              <span>◆ Query Results</span>
            </div>

            <div className="map-bottom-bar">
              <select value={basemap} onChange={(e) => setBasemap(e.target.value)}>
                <option value="osm">🗺 Basemap · Streets</option>
                <option value="satellite">🛰 Basemap · Satellite</option>
                <option value="hybrid">🌐 Basemap · Hybrid</option>
                <option value="topo-vector">⛰ Basemap · Topographic</option>
              </select>

              {selectedPoint && (
                <div className="selected-location">
                  <span>📍</span>
                  <div>
                    <strong>Selected Location</strong>
                    <small>
                      {selectedPoint.latitude.toFixed(4)}, {selectedPoint.longitude.toFixed(4)}
                    </small>
                  </div>
                </div>
              )}

              <button
                type="button"
                className="clear-button"
                onClick={() => {
                  selectedPointLayerRef.current?.removeAll()
                  setSelectedPoint(null)
                  setQueryResults([])
                  setQueryLabel('Assets within 2 km')
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </section>

        <aside className="right-panel">
          <section className="analysis-card">
            <div className="analysis-header">
              <div>
                <span className="analysis-icon">▥</span>
                <strong>ANALYSIS RESULTS</strong>
              </div>
              <button type="button" onClick={() => setQueryResults([])}>Clear Results</button>
            </div>

            <div className="result-stats">
              <div><strong>{queryResults.length}</strong><span>Assets Found</span></div>
              <div><strong>{valves}</strong><span>Valves</span></div>
              <div><strong>{pumpStations}</strong><span>Pump Stations</span></div>
              <div><strong>{facilities}</strong><span>Facilities</span></div>
            </div>

            <div className="analysis-meta">
              <span>◉ Radius: {queryLabel.match(/\d+(?:\.\d+)?/)?.[0] || '—'} km</span>
              <span>📍 {selectedPoint ? 'Using selected location' : 'No location selected'}</span>
            </div>

            <div className="analysis-actions">
              <button type="button">View Results Table →</button>
              <button type="button">⇩ Export Results</button>
            </div>
          </section>

          <section className="assistant-panel">
            <div className="assistant-tabs">
              <button className={rightTab === 'chat' ? 'active' : ''} onClick={() => setRightTab('chat')} type="button">▣ Chat</button>
              <button className={rightTab === 'history' ? 'active' : ''} onClick={() => setRightTab('history')} type="button">◷ History</button>
              <button className={rightTab === 'tools' ? 'active' : ''} onClick={() => setRightTab('tools')} type="button">⚒ Tools</button>
            </div>

            {rightTab === 'chat' && (
              <>
                <div className="chat-history">
                  {chatHistory.map((message, index) => (
                    <div key={`${message.role}-${index}`} className={`chat-message ${message.role}`}>
                      <span className="chat-avatar">{message.role === 'ai' ? '✦' : 'A'}</span>
                      <div className="chat-bubble">
                        {message.text}
                        {message.role === 'ai' && index > 0 && (
                          <div className="chat-actions">
                            <button type="button">Show on Map</button>
                            <button type="button">View Details</button>
                            <button type="button">Export ▾</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="suggestions">
                  <span>Suggested questions:</span>
                  <div>
                    <button type="button" onClick={() => submitQuestion('Find critical assets within 5 km')}>Critical assets</button>
                    <button type="button" onClick={() => submitQuestion('Find pump stations within 5 km')}>Find pump stations</button>
                    <button type="button" onClick={() => submitQuestion('Find facilities within 5 km')}>Find facilities</button>
                    <button type="button" onClick={() => submitQuestion('Find assets within 10 km')}>Assets within 10 km</button>
                  </div>
                </div>

                <div className="chat-input">
                  <input
                    placeholder="Ask anything about your GIS data..."
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') submitQuestion()
                    }}
                  />
                  <button type="button" onClick={() => submitQuestion()}>➤</button>
                </div>
              </>
            )}

            {rightTab === 'history' && (
              <div className="tab-content">
                <h3>Conversation History</h3>
                {chatHistory.length === 1 ? (
                  <p>No previous conversation yet.</p>
                ) : (
                  chatHistory.map((message, index) => (
                    <div className="history-row" key={`${message.role}-${index}`}>
                      <span>{message.role === 'user' ? 'You' : 'GeoAI'}</span>
                      <p>{message.text}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {rightTab === 'tools' && (
              <div className="tab-content tools-tab">
                <h3>GIS Tools</h3>
                <div className="tool-grid">
                  <button type="button">📏 Measure Distance</button>
                  <button type="button">📐 Measure Area</button>
                  <button type="button">🔎 Identify Feature</button>
                  <button type="button">📸 Screenshot</button>
                  <button type="button">📦 Export KMZ</button>
                  <button type="button">📊 Export CSV</button>
                  <button type="button">📄 PDF Report</button>
                </div>
                <p className="tool-note">Tool actions are reserved here for the next GIS feature layer.</p>
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  )
}

export default App
