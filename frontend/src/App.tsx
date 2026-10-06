import { useEffect, useRef, useState } from 'react'
import './App.css'

import '@arcgis/map-components/components/arcgis-map'
import '@arcgis/map-components/components/arcgis-zoom'

import GeoJSONLayer from '@arcgis/core/layers/GeoJSONLayer'
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer'
import Graphic from '@arcgis/core/Graphic'
import type Geometry from '@arcgis/core/geometry/Geometry'
import Point from '@arcgis/core/geometry/Point'
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol'
import SimpleLineSymbol from '@arcgis/core/symbols/SimpleLineSymbol'
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol'
import type { ClickEvent } from '@arcgis/core/views/input/types'
import type { PopupTemplateCreatorEvent } from '@arcgis/core/popup/types'
import type { ArcgisMap } from '@arcgis/map-components/components/arcgis-map'
import * as geodesicBufferOperator from '@arcgis/core/geometry/operators/geodesicBufferOperator'
import * as geodeticLengthOperator from '@arcgis/core/geometry/operators/geodeticLengthOperator'
import * as geodeticAreaOperator from '@arcgis/core/geometry/operators/geodeticAreaOperator'
import SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel'
import { zoomToLayer } from './features/layers/services/layerService'

type ChatMessage = {
  role: 'user' | 'ai'
  text: string
}

type RightTab = 'chat' | 'history' | 'tools'
type MapTool =
  | 'select-point'
  | 'draw-polygon'
  | 'draw-line'
  | 'measure-distance'
  | 'measure-area'
  | 'identify-feature'

type QueryOutcome = {
  count: number
  summary: string
}

type LayerDefinition = {
  id: string
  name: string
  category: string
  url: string
}

const layerDefinitions: LayerDefinition[] = [
  { id: 'valves', name: 'Valves', category: 'Assets', url: '/data/valves.geojson' },
  { id: 'pump-stations', name: 'Pump Stations', category: 'Assets', url: '/data/pump-stations.geojson' },
  { id: 'compressor-stations', name: 'Compressor Stations', category: 'Assets', url: '/data/midstream_oil_gas_geojson_only/compressor_stations.geojson' },
  { id: 'meter-stations', name: 'Meter Stations', category: 'Assets', url: '/data/midstream_oil_gas_geojson_only/meter_stations.geojson' },
  { id: 'facilities', name: 'Facilities', category: 'Assets', url: '/data/facilities.geojson' },
  { id: 'storage-tanks', name: 'Storage Tanks', category: 'Assets', url: '/data/midstream_oil_gas_geojson_only/storage_tanks.geojson' },
  { id: 'tank-farms', name: 'Tank Farms', category: 'Assets', url: '/data/midstream_oil_gas_geojson_only/tank_farms.geojson' },

  { id: 'pipelines', name: 'Pipelines', category: 'Pipeline', url: '/data/pipelines.geojson' },
  { id: 'pipeline-crossings', name: 'Pipeline Crossings', category: 'Pipeline', url: '/data/midstream_oil_gas_geojson_only/pipeline_crossings.geojson' },
  { id: 'right-of-way', name: 'Right of Way', category: 'Pipeline', url: '/data/midstream_oil_gas_geojson_only/right_of_way.geojson' },

  { id: 'inspections', name: 'Inspections', category: 'Operations', url: '/data/midstream_oil_gas_geojson_only/inspections.geojson' },
  { id: 'work-orders', name: 'Work Orders', category: 'Operations', url: '/data/midstream_oil_gas_geojson_only/work_orders.geojson' },
  { id: 'leak-events', name: 'Leak Events', category: 'Operations', url: '/data/midstream_oil_gas_geojson_only/leak_events.geojson' },
  { id: 'cathodic-protection', name: 'Cathodic Protection', category: 'Operations', url: '/data/midstream_oil_gas_geojson_only/cathodic_protection.geojson' },

  { id: 'environmental-sites', name: 'Environmental Sites', category: 'Environment', url: '/data/midstream_oil_gas_geojson_only/environmental_sites.geojson' },
  { id: 'water-bodies', name: 'Water Bodies', category: 'Environment', url: '/data/water-bodies.geojson' },

  { id: 'roads', name: 'Roads', category: 'Reference', url: '/data/roads.geojson' },
]

function getFeatureSymbol(geometry: Geometry, highlighted = false) {
  const accent = highlighted ? [255, 198, 46, 1] : [35, 126, 245, 1]

  if (geometry.type === 'point' || geometry.type === 'multipoint') {
    return new SimpleMarkerSymbol({
      style: highlighted ? 'circle' : 'diamond',
      color: highlighted ? [255, 198, 46, 0.95] : 'blue',
      size: highlighted ? 25 : 15,
      outline: {
        color: highlighted ? [255, 255, 255, 1] : 'white',
        width: highlighted ? 3 : 2,
      },
    })
  }

  if (geometry.type === 'polyline') {
    return new SimpleLineSymbol({
      color: accent,
      width: highlighted ? 5 : 3,
    })
  }

  return new SimpleFillSymbol({
    color: highlighted ? [255, 198, 46, 0.25] : [35, 126, 245, 0.18],
    outline: {
      color: accent,
      width: highlighted ? 3 : 2,
    },
  })
}

function App() {
  const mapRef = useRef<ArcgisMap | null>(null)

  const assetLayerRef = useRef<GeoJSONLayer | null>(null)
  const operationalLayersRef = useRef<Record<string, GeoJSONLayer>>({})
  const selectedPointLayerRef = useRef<GraphicsLayer | null>(null)
  const featureHighlightLayerRef = useRef<GraphicsLayer | null>(null)
  const sketchLayerRef = useRef<GraphicsLayer | null>(null)
  const sketchViewModelRef = useRef<SketchViewModel | null>(null)
  const activeMapToolRef = useRef<MapTool>('select-point')

  const [question, setQuestion] = useState('')
  const [selectedPoint, setSelectedPoint] = useState<{
    longitude: number
    latitude: number
  } | null>(null)

  const [queryResults, setQueryResults] = useState<Graphic[]>([])
  const [queryLabel, setQueryLabel] = useState('Assets within 2 km')
  const [basemap, setBasemap] = useState('osm')
  const [rightTab, setRightTab] = useState<RightTab>('chat')
  const [isAddLayerOpen, setIsAddLayerOpen] = useState(false)
  const [activeMapTool, setActiveMapTool] = useState<MapTool>('select-point')
  const [analysisSummary, setAnalysisSummary] = useState('')

  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>(
    Object.fromEntries(layerDefinitions.map((layer) => [layer.name, false])),
  )
  const layerVisibilityRef = useRef(layerVisibility)

  const [collapsedCategories, setCollapsedCategories] =
    useState<Record<string, boolean>>({})

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: 'ai',
      text: 'Select a point on the map and ask a spatial question.',
    },
  ])

  useEffect(() => {
    layerVisibilityRef.current = layerVisibility
  }, [layerVisibility])

  const createPopupTemplate = (title: string) => ({
    title,
    content: (event: PopupTemplateCreatorEvent) => {
      const attributes = event.graphic?.attributes || {}

      return Object.entries(attributes)
        .map(
          ([key, value]) => `
            <div style="
              display:flex;
              justify-content:space-between;
              gap:12px;
              padding:4px 0;
            ">
              <strong>${key}</strong>
              <span>${value ?? '—'}</span>
            </div>
          `,
        )
        .join('')
    },
  })

  const queryVisibleLayers = async (
    geometry: Geometry,
    featureType: string | null = null,
  ): Promise<QueryOutcome> => {
    const visibleLayers = layerDefinitions
      .filter((definition) => layerVisibilityRef.current[definition.name])
      .filter((definition) => {
        if (!featureType) return true

        const singularName = definition.name
          .replace(/ies$/, 'y')
          .replace(/s$/, '')
        return singularName.toLowerCase() === featureType.toLowerCase()
      })
      .map((definition) => ({
        ...definition,
        layer: operationalLayersRef.current[definition.name],
      }))
      .filter(
        (entry): entry is LayerDefinition & { layer: GeoJSONLayer } =>
          entry.layer !== undefined,
      )

    if (visibleLayers.length === 0) {
      const summary = featureType
        ? `Turn on the ${featureType} layer to include it in analysis.`
        : 'Turn on one or more layers to include features in analysis.'
      setQueryResults([])
      setAnalysisSummary(summary)
      return { count: 0, summary }
    }

    const results = await Promise.all(
      visibleLayers.map(async ({ name, category, layer }) => {
        try {
          const { features } = await layer.queryFeatures({
            geometry,
            spatialRelationship: 'intersects',
            returnGeometry: true,
            outFields: ['*'],
          })
          const singularName = name.replace(/ies$/, 'y').replace(/s$/, '')

          return {
            name,
            features: features.map((feature) => new Graphic({
              geometry: feature.geometry,
              attributes: {
                ...feature.attributes,
                layer_name: name,
                ...(category === 'Assets'
                  ? { asset_type: feature.attributes?.asset_type ?? singularName }
                  : {}),
              },
            })),
          }
        } catch (error) {
          console.error(`Spatial query failed for ${name}:`, error)
          return { name, features: [] }
        }
      }),
    )

    const features = results.flatMap((result) => result.features)
    const summary = results
      .filter((result) => result.features.length > 0)
      .map((result) => `${result.name}: ${result.features.length}`)
      .join(' · ') || 'No matching features in the selected layers.'

    setQueryResults(features)
    setAnalysisSummary(summary)
    features.forEach((feature) => {
      if (!feature.geometry) return
      selectedPointLayerRef.current?.add(
        new Graphic({
          geometry: feature.geometry,
          symbol: getFeatureSymbol(feature.geometry),
        }),
      )
    })

    return { count: features.length, summary }
  }

  const runWithinDistance = async (
    mapPoint: Point,
    distanceKm: number,
    featureType: string | null,
  ): Promise<QueryOutcome> => {
    const graphicsLayer = selectedPointLayerRef.current

    if (!graphicsLayer) return { count: 0, summary: 'Map is not ready yet.' }

    graphicsLayer.removeAll()
    setQueryLabel(
      featureType
        ? `${featureType}s within ${distanceKm} km`
        : `Selected layers within ${distanceKm} km`,
    )

    if (!geodesicBufferOperator.isLoaded()) {
      await geodesicBufferOperator.load()
    }

    const buffer = geodesicBufferOperator.execute(
      mapPoint,
      distanceKm,
      { unit: 'kilometers' },
    )

    if (!buffer) return { count: 0, summary: 'Could not create the analysis buffer.' }

    graphicsLayer.add(
      new Graphic({
        geometry: buffer,
        symbol: new SimpleFillSymbol({
          color: [0, 120, 255, 0.08],
          outline: { color: [0, 120, 255, 0.8], width: 1.5 },
        }),
      }),
    )

    return queryVisibleLayers(buffer, featureType)
  }

  const identifyFeatureAtClick = async (event: ClickEvent) => {
    const mapElement = mapRef.current
    const visibleLayers = [
      ...(assetLayerRef.current?.visible ? [assetLayerRef.current] : []),
      ...Object.values(operationalLayersRef.current).filter((layer) => layer.visible),
      ...(selectedPointLayerRef.current?.visible ? [selectedPointLayerRef.current] : []),
    ]

    if (!mapElement || visibleLayers.length === 0) {
      const summary = 'Turn on a layer before identifying features.'
      setAnalysisSummary(summary)
      setChatHistory((current) => [...current, { role: 'ai', text: summary }])
      return
    }

    const response = await mapElement.hitTest(event, { include: visibleLayers })
    const isVisibleFeatureHit = (result: (typeof response.results)[number]) =>
      result.type === 'graphic' &&
      visibleLayers.some((layer) => layer === result.graphic.layer)
    const hit =
      response.results.find(
        (result) =>
          isVisibleFeatureHit(result) &&
          result.type === 'graphic' &&
          result.graphic.layer !== selectedPointLayerRef.current,
      ) ??
      response.results.find(isVisibleFeatureHit)

    if (hit?.type !== 'graphic') {
      const summary = 'No visible feature was found at that location.'
      setAnalysisSummary(summary)
      setChatHistory((current) => [...current, { role: 'ai', text: summary }])
      return
    }

    const { graphic, layer } = hit
    const geometry = graphic.geometry
    const attributes = graphic.attributes ?? {}
    const layerName =
      typeof attributes.layer_name === 'string'
        ? attributes.layer_name
        : layer.title ?? 'GIS feature'
    const details = Object.entries(attributes)
      .filter(([, value]) => value != null && value !== '')
      .slice(0, 4)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(' · ')
    const summary = details ? `${layerName} — ${details}` : layerName

    featureHighlightLayerRef.current?.removeAll()
    if (geometry) {
      featureHighlightLayerRef.current?.add(
        new Graphic({ geometry, symbol: getFeatureSymbol(geometry, true) }),
      )
    }

    setQueryResults([
      new Graphic({
        geometry,
        attributes: { ...attributes, layer_name: layerName },
      }),
    ])
    setQueryLabel(`Identified ${layerName}`)
    setAnalysisSummary(summary)
    setChatHistory((current) => [
      ...current,
      { role: 'ai', text: `Identified ${summary}.` },
    ])
  }

  /*
   * ============================================================
   * MAP CLICK
   * ============================================================
   *
   * IMPORTANT:
   * ArcGIS Map Components sends the MapView click through:
   *
   * event.detail.mapPoint
   * event.detail.screenPoint
   *
   * This replaces the old view.on('click') implementation.
   */
  const handleMapClick = async (event: ClickEvent) => {
    if (activeMapToolRef.current === 'identify-feature') {
      try {
        await identifyFeatureAtClick(event)
      } catch (error) {
        console.error('Feature identification failed:', error)
        setAnalysisSummary('Feature identification failed. Check the selected layers and try again.')
      }
      activeMapToolRef.current = 'select-point'
      setActiveMapTool('select-point')
      return
    }

    if (activeMapToolRef.current !== 'select-point') return

    console.log('================================')
    console.log('MAP CLICK FIRED')
    console.log('EVENT:', event)

    const mapPoint = event.mapPoint

    if (
      !mapPoint ||
      mapPoint.latitude == null ||
      mapPoint.longitude == null
    ) {
      console.error('MAP CLICK FIRED BUT mapPoint IS MISSING')
      return
    }

    console.log('MAP POINT:', mapPoint)
    console.log('LATITUDE:', mapPoint.latitude)
    console.log('LONGITUDE:', mapPoint.longitude)

    setSelectedPoint({
      latitude: mapPoint.latitude,
      longitude: mapPoint.longitude,
    })

    const selectedLayer = selectedPointLayerRef.current
    const highlightLayer = featureHighlightLayerRef.current

    selectedLayer?.removeAll()
    highlightLayer?.removeAll()

    /*
     * Red selected point.
     */
    selectedLayer?.add(
      new Graphic({
        geometry: mapPoint,
        symbol: new SimpleMarkerSymbol({
          style: 'circle',
          color: 'red',
          size: 18,
          outline: {
            color: 'white',
            width: 2.5,
          },
        }),
      }),
    )

    /*
     * Default 2 km analysis.
     */
    try {
      await runWithinDistance(mapPoint, 2, null)
    } catch (error) {
      console.error('2 KM ANALYSIS ERROR:', error)
    }

    /*
     * runWithinDistance clears the graphics layer,
     * therefore add the selected red point again.
     */
    selectedLayer?.add(
      new Graphic({
        geometry: mapPoint,
        symbol: new SimpleMarkerSymbol({
          style: 'circle',
          color: 'red',
          size: 18,
          outline: {
            color: 'white',
            width: 2.5,
          },
        }),
      }),
    )

    /*
     * Feature hit test.
     */
    try {
      const mapElement = mapRef.current

      const visibleLayers = Object.values(
        operationalLayersRef.current,
      ).filter((layer) => layer.visible)

      if (mapElement && visibleLayers.length > 0) {
        const response = await mapElement.hitTest(
          event,
          {
            include: visibleLayers,
          },
        )

        const clickedResult = response.results?.find(
          (result) =>
            result.type === 'graphic' &&
            visibleLayers.some((layer) => layer === result.graphic.layer),
        )

        if (clickedResult?.type === 'graphic') {
          const graphic = clickedResult.graphic
          const geometry = graphic.geometry

          console.log('FEATURE SELECTED:', {
            layer: graphic.layer?.title,
            attributes: graphic.attributes,
            geometryType: geometry?.type,
          })

          if (
            geometry?.type === 'point' ||
            geometry?.type === 'multipoint'
          ) {
            highlightLayer?.add(
              new Graphic({
                geometry,
                symbol: new SimpleMarkerSymbol({
                  style: 'circle',
                  color: [255, 215, 0, 0.95],
                  size: 28,
                  outline: {
                    color: [255, 0, 0, 1],
                    width: 4,
                  },
                }),
              }),
            )
          } else if (geometry?.type === 'polyline') {
            highlightLayer?.add(
              new Graphic({
                geometry,
                symbol: new SimpleLineSymbol({
                  color: [255, 215, 0, 1],
                  width: 6,
                }),
              }),
            )
          } else if (geometry?.type === 'polygon') {
            highlightLayer?.add(
              new Graphic({
                geometry,
                symbol: new SimpleFillSymbol({
                  color: [255, 215, 0, 0.25],
                  outline: {
                    color: [255, 215, 0, 1],
                    width: 4,
                  },
                }),
              }),
            )
          }
        }
      }
    } catch (error) {
      console.warn('Feature hit test failed:', error)
    }

    console.log('MAP CLICK COMPLETE')
    console.log('================================')
  }

  /*
   * ============================================================
   * MAP INITIALIZATION
   * ============================================================
   */
  useEffect(() => {
    let cancelled = false

    const initializeMap = async () => {
      const mapElement = mapRef.current

      if (!mapElement) {
        console.error('ArcGIS map ref not available')
        return
      }

      try {
        await mapElement.viewOnReady()

        if (cancelled) return

        const map = mapElement.map

        if (!map) {
          console.error('ArcGIS map is not available')
          return
        }

        if (assetLayerRef.current) return

        console.log('=== ARCGIS MAP READY ===')

        /*
         * Main searchable Midstream Assets layer.
         */
        const assetLayer = new GeoJSONLayer({
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

        assetLayerRef.current = assetLayer
        map.add(assetLayer)

        /*
         * Operational layers.
         */
        for (const definition of layerDefinitions) {
          const layer = new GeoJSONLayer({
            url: definition.url,
            title: definition.name,
            visible: false,
            popupTemplate: createPopupTemplate(definition.name),
          })

          operationalLayersRef.current[definition.name] = layer
          map.add(layer)

          layer.when(
            () => {
              console.log(
                `[GeoJSON OK] ${definition.name}`,
                definition.url,
              )
            },
            (error) => {
              console.error(
                `[GeoJSON ERROR] ${definition.name}`,
                definition.url,
                error,
              )
            },
          )
        }

        /*
         * Selected location graphics.
         */
        const selectedLayer = new GraphicsLayer({
          title: 'Selected Location',
        })

        selectedPointLayerRef.current = selectedLayer
        map.add(selectedLayer)

        /*
         * Feature highlight graphics.
         */
        const highlightLayer = new GraphicsLayer({
          title: 'Feature Highlight',
        })

        featureHighlightLayerRef.current = highlightLayer
        map.add(highlightLayer)

        const sketchLayer = new GraphicsLayer({
          title: 'Drawings and Measurements',
        })
        sketchLayerRef.current = sketchLayer
        map.add(sketchLayer)

        const sketchViewModel = new SketchViewModel({
          view: mapElement.view,
          layer: sketchLayer,
          polygonSymbol: {
            type: 'simple-fill',
            color: [114, 93, 245, 0.14],
            outline: { color: [145, 127, 255, 0.95], width: 2 },
          },
          polylineSymbol: {
            type: 'simple-line',
            color: [145, 127, 255, 0.95],
            width: 3,
          },
        })
        sketchViewModelRef.current = sketchViewModel

        sketchViewModel.on('create', async (event) => {
          if (event.state === 'cancel') {
            activeMapToolRef.current = 'select-point'
            setActiveMapTool('select-point')
            return
          }

          if (event.state !== 'complete' || !event.graphic?.geometry) return

          const tool = activeMapToolRef.current
          const geometry = event.graphic.geometry

          try {
            if (tool === 'measure-distance' && geometry.type === 'polyline') {
              if (!geodeticLengthOperator.isLoaded()) {
                await geodeticLengthOperator.load()
              }
              const distance = geodeticLengthOperator.execute(geometry, {
                unit: 'kilometers',
              })
              const summary = `Measured distance: ${distance.toFixed(2)} km.`
              setAnalysisSummary(summary)
              setChatHistory((current) => [...current, { role: 'ai', text: summary }])
            } else if (tool === 'measure-area' && geometry.type === 'polygon') {
              if (!geodeticAreaOperator.isLoaded()) {
                await geodeticAreaOperator.load()
              }
              const area = geodeticAreaOperator.execute(geometry, {
                unit: 'square-kilometers',
              })
              const summary = `Measured area: ${area.toFixed(2)} km².`
              setAnalysisSummary(summary)
              setChatHistory((current) => [...current, { role: 'ai', text: summary }])
            } else if (tool === 'draw-polygon' || tool === 'draw-line') {
              const outcome = await queryVisibleLayers(geometry)
              const summary = `${tool === 'draw-polygon' ? 'Polygon' : 'Line'} analysis — ${outcome.summary}`
              setAnalysisSummary(summary)
              setChatHistory((current) => [...current, { role: 'ai', text: summary }])
            }
          } catch (error) {
            console.error('Map tool operation failed:', error)
            setAnalysisSummary('The map tool could not complete. Please try again.')
          } finally {
            activeMapToolRef.current = 'select-point'
            setActiveMapTool('select-point')
          }
        })

        console.log('MAP INITIALIZATION COMPLETE')
        console.log('CLICK HANDLER IS ATTACHED IN JSX')
      } catch (error) {
        console.error('MAP INITIALIZATION FAILED:', error)
      }
    }

    void initializeMap()

    return () => {
      cancelled = true
    }
  }, [])

  /*
   * ============================================================
   * AI QUESTION
   * ============================================================
   */
  const submitQuestion = async (text = question) => {
    const normalized = text.toLowerCase().trim()

    if (!normalized) return

    setQuestion('')

    setChatHistory((current) => [
      ...current,
      {
        role: 'user',
        text,
      },
    ])

    const distanceMatch = normalized.match(
      /within\s+(\d+(?:\.\d+)?)\s*km/,
    )

    if (!distanceMatch) {
      setChatHistory((current) => [
        ...current,
        {
          role: 'ai',
          text: 'I can currently handle questions such as “Find valves within 5 km”.',
        },
      ])
      return
    }

    const distanceKm = Number(distanceMatch[1])

    const matchedLayer = layerDefinitions.find((definition) => {
      const singularName = definition.name
        .replace(/ies$/, 'y')
        .replace(/s$/, '')
        .toLowerCase()
      return normalized.includes(definition.name.toLowerCase()) ||
        normalized.includes(singularName)
    })
    const assetType = matchedLayer
      ? matchedLayer.name.replace(/ies$/, 'y').replace(/s$/, '')
      : null

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

    const outcome = await runWithinDistance(
      new Point({
        longitude: selectedPoint.longitude,
        latitude: selectedPoint.latitude,
        spatialReference: { wkid: 4326 },
      }),
      distanceKm,
      assetType,
    )

    /*
     * Re-add selected point because analysis clears graphics.
     */
    selectedPointLayerRef.current?.add(
      new Graphic({
        geometry: new Point({
          longitude: selectedPoint.longitude,
          latitude: selectedPoint.latitude,
          spatialReference: { wkid: 4326 },
        }),
        symbol: new SimpleMarkerSymbol({
          style: 'circle',
          color: 'red',
          size: 18,
          outline: {
            color: 'white',
            width: 2.5,
          },
        }),
      }),
    )

    const resultLabel = assetType
      ? outcome.count === 1
        ? assetType.toLowerCase()
        : `${assetType.toLowerCase().replace(/y$/, '')}${assetType.endsWith('y') ? 'ies' : 's'}`
      : outcome.count === 1
        ? 'asset'
        : 'assets'

    setChatHistory((current) => [
      ...current,
      {
        role: 'ai',
        text: `I found ${outcome.count} ${resultLabel} within ${distanceKm} km of the selected location. ${outcome.summary}`,
      },
    ])
  }

  const clearMap = () => {
    selectedPointLayerRef.current?.removeAll()
    featureHighlightLayerRef.current?.removeAll()

    setSelectedPoint(null)
    setQueryResults([])
    setQueryLabel('Assets within 2 km')
    setAnalysisSummary('')
    sketchLayerRef.current?.removeAll()
  }

  const activateMapTool = (tool: MapTool) => {
    if (tool === 'select-point') {
      sketchViewModelRef.current?.cancel()
      activeMapToolRef.current = tool
      setActiveMapTool(tool)
      setAnalysisSummary('Click the map to choose a location for spatial analysis.')
      return
    }

    if (tool === 'identify-feature') {
      sketchViewModelRef.current?.cancel()
      activeMapToolRef.current = tool
      setActiveMapTool(tool)
      setAnalysisSummary('Click a visible map feature to identify it.')
      return
    }

    const sketchViewModel = sketchViewModelRef.current
    if (!sketchViewModel) {
      setAnalysisSummary('The map is still loading. Try again in a moment.')
      return
    }

    sketchViewModel.cancel()
    activeMapToolRef.current = tool
    setActiveMapTool(tool)
    sketchLayerRef.current?.removeAll()
    setAnalysisSummary(
      tool === 'measure-distance'
        ? 'Click the map to add distance vertices; double-click to finish.'
        : tool === 'measure-area'
          ? 'Click the map to draw an area; double-click to finish.'
          : 'Click the map to add vertices; double-click to finish.',
    )
    const sketchTool =
      tool === 'draw-polygon' || tool === 'measure-area'
        ? 'polygon'
        : 'polyline'
    void sketchViewModel.create(sketchTool)
  }

  const handleZoomToLayer = async (layerName: string) => {
    const mapView = mapRef.current?.view
    const layer = operationalLayersRef.current[layerName]

    if (!mapView || !layer) return

    try {
      await zoomToLayer(mapView, layer)
    } catch (error) {
      console.error(`Could not zoom to ${layerName}:`, error)
    }
  }

  const categories = [
    ...new Set(layerDefinitions.map((layer) => layer.category)),
  ]

  const valves = queryResults.filter(
    (f) => f.attributes?.asset_type === 'Valve',
  ).length

  const pumpStations = queryResults.filter(
    (f) => f.attributes?.asset_type === 'Pump Station',
  ).length

  const facilities = queryResults.filter(
    (f) => f.attributes?.asset_type === 'Facility',
  ).length

  return (
    <div className="app-shell">

      {/* HEADER */}
      <header className="top-header">
        <div className="brand">
          <div className="brand-mark">✦</div>

          <div>
            <h1>GeoAI Copilot</h1>
            <p>AI-Powered Spatial Intelligence</p>
          </div>
        </div>

        <form
          className="global-search"
          onSubmit={(event) => {
            event.preventDefault()
            void submitQuestion()
          }}
        >
          <span>⌕</span>

          <input
            placeholder="Ask anything about your GIS data..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button type="submit" aria-label="Run spatial query">➤</button>
        </form>

        <div className="header-actions">
          <button
            className="header-button"
            type="button"
            onClick={() => setRightTab('tools')}
          >
            ⚒ GIS Tools ▾
          </button>

          <button className="header-button" type="button">
            ⇩ Export ▾
          </button>

          <span className="header-divider" />
          <span className="notification">♧</span>

          <button className="profile" type="button">
            A <span>▾</span>
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main className="main-grid">

        {/* LEFT PANEL */}
        <aside className="left-panel">

          <section className="panel-section">
            <div className="panel-heading">
              <h2>LAYERS</h2>

              <button
                type="button"
                onClick={() => setIsAddLayerOpen(true)}
              >
                ＋
              </button>
            </div>

            <div className="layer-search">
              <span>⌕</span>
              <input placeholder="Search layers..." />
            </div>

            <div className="layer-list">
              {categories.map((category) => (
                <div className="layer-category" key={category}>

                  <div
                    className="layer-category-title"
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setCollapsedCategories((current) => ({
                        ...current,
                        [category]: !current[category],
                      }))
                    }
                  >
                    <span>
                      {collapsedCategories[category] ? '▸' : '▾'}
                    </span>

                    <strong>{category}</strong>
                  </div>

                  {!collapsedCategories[category] &&
                    layerDefinitions
                      .filter((layer) => layer.category === category)
                      .map((layer) => (
                        <div className="layer-row" key={layer.id}>
                          <label className="layer-toggle" htmlFor={layer.id}>
                            <input
                              id={layer.id}
                              type="checkbox"
                              checked={layerVisibility[layer.name] ?? false}
                              onChange={(e) => {
                                const visible = e.target.checked

                                setLayerVisibility((current) => ({
                                  ...current,
                                  [layer.name]: visible,
                                }))

                                const mapLayer =
                                  operationalLayersRef.current[layer.name]

                                if (mapLayer) mapLayer.visible = visible
                              }}
                            />
                            <span>{layer.name}</span>
                          </label>

                          <button
                            type="button"
                            className="layer-menu-button"
                            title={`Zoom to ${layer.name}`}
                            aria-label={`Zoom to ${layer.name}`}
                            onClick={() => void handleZoomToLayer(layer.name)}
                          >
                            ⋯
                          </button>
                        </div>
                      ))}
                </div>
              ))}
            </div>
          </section>

          {/* ADD LAYER */}
          {isAddLayerOpen && (
            <div className="add-layer-overlay">
              <div className="add-layer-panel">

                <div className="add-layer-header">
                  <div>
                    <h3>Add Layer</h3>
                    <p>Select a GIS dataset to display on the map.</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAddLayerOpen(false)}
                  >
                    ×
                  </button>
                </div>

                <div className="add-layer-list">
                  {layerDefinitions.map((layer) => {
                    const visible = layerVisibility[layer.name] ?? false

                    return (
                      <div className="add-layer-row" key={layer.id}>
                        <div>
                          <strong>{layer.name}</strong>
                          <span>{layer.category}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const nextVisible = !visible
                            const mapLayer = operationalLayersRef.current[layer.name]

                            if (mapLayer) mapLayer.visible = nextVisible

                            setLayerVisibility((current) => ({
                              ...current,
                              [layer.name]: nextVisible,
                            }))
                          }}
                        >
                          {visible ? 'Remove' : 'Add'}
                        </button>
                      </div>
                    )
                  })}
                </div>

              </div>
            </div>
          )}

          {/* MAP TOOLS */}
          <section className="panel-section map-tools-section">
            <h2>MAP TOOLS</h2>

            <button className={`tool-row ${activeMapTool === 'select-point' ? 'active' : ''}`} type="button" onClick={() => activateMapTool('select-point')}>
              📍 Select Point
            </button>

            <button className={`tool-row ${activeMapTool === 'draw-polygon' ? 'active' : ''}`} type="button" onClick={() => activateMapTool('draw-polygon')}>
              ⬡ Draw Polygon
            </button>

            <button className={`tool-row ${activeMapTool === 'draw-line' ? 'active' : ''}`} type="button" onClick={() => activateMapTool('draw-line')}>
              〰 Draw Line
            </button>

            <button className={`tool-row ${activeMapTool === 'measure-distance' ? 'active' : ''}`} type="button" onClick={() => activateMapTool('measure-distance')}>
              📏 Measure Distance
            </button>

            <button className={`tool-row ${activeMapTool === 'measure-area' ? 'active' : ''}`} type="button" onClick={() => activateMapTool('measure-area')}>
              📐 Measure Area
            </button>

            <button className={`tool-row ${activeMapTool === 'identify-feature' ? 'active' : ''}`} type="button" onClick={() => activateMapTool('identify-feature')}>
              🔎 Identify Feature
            </button>
          </section>

          {/* RECENT QUERIES */}
          <section className="panel-section recent-section">
            <h2>RECENT QUERIES</h2>

            {[
              'Find valves within 5 km',
              'Find pump stations within 5 km',
              'Find critical assets within 5 km',
              'Find facilities within 10 km',
            ].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setQuestion(item)}
              >
                {item}
              </button>
            ))}
          </section>

        </aside>

        {/* MAP */}
        <section className="map-workspace">

          <div className="map-container">

            <arcgis-map
              ref={mapRef}
              basemap={basemap}
              center="72.5714,23.0225"
              zoom={12}
              onarcgisViewClick={(event) => handleMapClick(event.detail)}
            >
              <arcgis-zoom slot="top-left" />
            </arcgis-map>

            <div className="map-search">
              <span>⌕</span>
              <input placeholder="Search location..." />
            </div>

            <div className="map-legend">
              <strong>Legend</strong>

              <span>🔴 Selected Location</span>

              <span>
                ▧ Analysis Buffer (
                {queryLabel.match(/\d+(?:\.\d+)?/)?.[0] || 2}
                km)
              </span>

              <span>◆ Query Results</span>
            </div>

            <div className="map-bottom-bar">

              {/* SELECTED LOCATION */}
              {selectedPoint && (
                <div className="selected-location">
                  <span>📍</span>

                  <div>
                    <strong>Selected Location</strong>

                    <small>
                      {selectedPoint.latitude.toFixed(4)},
                      {' '}
                      {selectedPoint.longitude.toFixed(4)}
                    </small>
                  </div>
                </div>
              )}

              <select
                aria-label="Map basemap"
                value={basemap}
                onChange={(e) => setBasemap(e.target.value)}
              >
                <option value="osm">🗺 Basemap · Streets</option>
                <option value="satellite">🛰 Basemap · Satellite</option>
                <option value="hybrid">🌐 Basemap · Hybrid</option>
                <option value="topo-vector">⛰ Basemap · Topographic</option>
              </select>

              <button
                type="button"
                className="clear-button"
                onClick={clearMap}
              >
                Clear
              </button>

            </div>
          </div>

        </section>

        {/* RIGHT PANEL */}
        <aside className="right-panel">

          {/* ANALYSIS */}
          <section className="analysis-card">

            <div className="analysis-header">
              <strong>▥ ANALYSIS RESULTS</strong>

              <button
                type="button"
                onClick={() => setQueryResults([])}
              >
                Clear Results
              </button>
            </div>

            <div className="result-stats">
              <div>
                <strong>{queryResults.length}</strong>
                <span>Assets Found</span>
              </div>

              <div>
                <strong>{valves}</strong>
                <span>Valves</span>
              </div>

              <div>
                <strong>{pumpStations}</strong>
                <span>Pump Stations</span>
              </div>

              <div>
                <strong>{facilities}</strong>
                <span>Facilities</span>
              </div>
            </div>

            <div className="analysis-meta">
              <span>
                ◉ Radius:{' '}
                {queryLabel.match(/\d+(?:\.\d+)?/)?.[0] || '—'} km
              </span>

              <span>
                📍{' '}
                {selectedPoint
                  ? 'Using selected location'
                  : 'No location selected'}
              </span>
            </div>

            {analysisSummary && (
              <p className="analysis-summary" role="status">
                {analysisSummary}
              </p>
            )}

            <div className="analysis-actions">
              <button type="button">
                View Results Table →
              </button>

              <button type="button">
                ⇩ Export Results
              </button>
            </div>

          </section>

          {/* ASSISTANT */}
          <section className="assistant-panel">

            <div className="assistant-tabs">

              {(['chat', 'history', 'tools'] as RightTab[]).map(
                (tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={rightTab === tab ? 'active' : ''}
                    onClick={() => setRightTab(tab)}
                  >
                    {tab === 'chat'
                      ? '▣ Chat'
                      : tab === 'history'
                        ? '◷ History'
                        : '⚒ Tools'}
                  </button>
                ),
              )}

            </div>

            {rightTab === 'chat' && (
              <>
                <div className="chat-history">

                  {chatHistory.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`chat-message ${message.role}`}
                    >
                      <span className="chat-avatar">
                        {message.role === 'ai' ? '✦' : 'A'}
                      </span>

                      <div className="chat-bubble">
                        {message.text}
                      </div>
                    </div>
                  ))}

                </div>

                <div className="suggestions">
                  <span>Suggested questions:</span>

                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        submitQuestion(
                          'Find critical assets within 5 km',
                        )
                      }
                    >
                      Critical assets
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        submitQuestion(
                          'Find pump stations within 5 km',
                        )
                      }
                    >
                      Find pump stations
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        submitQuestion(
                          'Find facilities within 5 km',
                        )
                      }
                    >
                      Find facilities
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        submitQuestion(
                          'Find assets within 10 km',
                        )
                      }
                    >
                      Assets within 10 km
                    </button>
                  </div>
                </div>

                <div className="chat-input">

                  <input
                    placeholder="Ask anything about your GIS data..."
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitQuestion()
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => submitQuestion()}
                  >
                    ➤
                  </button>

                </div>
              </>
            )}

            {rightTab === 'history' && (
              <div className="tab-content">
                <h3>Conversation History</h3>

                {chatHistory.map((message, index) => (
                  <div
                    className="history-row"
                    key={`${message.role}-${index}`}
                  >
                    <span>
                      {message.role === 'user' ? 'You' : 'GeoAI'}
                    </span>

                    <p>{message.text}</p>
                  </div>
                ))}
              </div>
            )}

            {rightTab === 'tools' && (
              <div className="tab-content tools-tab">
                <h3>GIS Tools</h3>

                <div className="tool-grid">
                  <button type="button" onClick={() => activateMapTool('draw-polygon')}>
                    ⬡ Draw Polygon
                  </button>

                  <button type="button" onClick={() => activateMapTool('draw-line')}>
                    〰 Draw Line
                  </button>

                  <button type="button" onClick={() => activateMapTool('measure-distance')}>
                    📏 Measure Distance
                  </button>

                  <button type="button" onClick={() => activateMapTool('measure-area')}>
                    📐 Measure Area
                  </button>

                  <button type="button" onClick={() => activateMapTool('identify-feature')}>
                    🔎 Identify Feature
                  </button>

                  <button type="button">
                    📸 Screenshot
                  </button>

                  <button type="button">
                    📦 Export KMZ
                  </button>

                  <button type="button">
                    📊 Export CSV
                  </button>

                  <button type="button">
                    📄 PDF Report
                  </button>
                </div>
              </div>
            )}

          </section>

        </aside>

      </main>
    </div>
  )
}

export default App
