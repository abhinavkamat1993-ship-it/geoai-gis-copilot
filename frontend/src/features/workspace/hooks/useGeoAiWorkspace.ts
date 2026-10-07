import { useEffect, useRef, useState } from 'react'
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer'
import Graphic from '@arcgis/core/Graphic'
import type Geometry from '@arcgis/core/geometry/Geometry'
import Point from '@arcgis/core/geometry/Point'
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol'
import SimpleLineSymbol from '@arcgis/core/symbols/SimpleLineSymbol'
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol'
import type { ClickEvent } from '@arcgis/core/views/input/types'
import type { ArcgisMap } from '@arcgis/map-components/components/arcgis-map'
import SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel'
import { mapConfig } from '../../../core/config/mapConfig'
import { createFeaturePopupTemplate, zoomToLayer } from '../../layers/services/layerService'
import { layerDefinitions } from '../../layers/layerDefinitions'
import { createOperationalLayer, type OperationalLayer } from '../../layers/connectors'
import { CopilotApiError, queryCopilot } from '../../ai/services/copilotApi'
import { geoJsonToArcgisGeometry } from '../../ai/services/geoJsonGeometry'
import { querySpatialLayers } from '../../spatial-analysis/services/spatialQueryService'
import { createKilometerBuffer } from '../../spatial-analysis/services/bufferService'
import { measureAreaKm2, measureDistanceKm } from '../../gis-tools/services/measurementService'
import { getFeatureSymbol } from '../../map/services/symbolService'
import type { ChatMessage } from '../../ai/types/ai'
import type { MapTool } from '../../gis-tools/types/gisTool'
import type { RightTab } from '../types'

type QueryOutcome = {
  count: number
  summary: string
}

export function useGeoAiWorkspace() {
  const mapRef = useRef<ArcgisMap | null>(null)

  const operationalLayersRef = useRef<Record<string, OperationalLayer>>({})
  const analysisBufferLayerRef = useRef<GraphicsLayer | null>(null)
  const selectedPointLayerRef = useRef<GraphicsLayer | null>(null)
  const featureHighlightLayerRef = useRef<GraphicsLayer | null>(null)
  const sketchLayerRef = useRef<GraphicsLayer | null>(null)
  const sketchViewModelRef = useRef<SketchViewModel | null>(null)
  const activeMapToolRef = useRef<MapTool>('select-point')

  const [question, setQuestion] = useState('')
  const [isCopilotLoading, setIsCopilotLoading] = useState(false)
  const [locationSearch, setLocationSearch] = useState('')
  const [isLocationSearchLoading, setIsLocationSearchLoading] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  const [selectedPoint, setSelectedPoint] = useState<{
    longitude: number
    latitude: number
  } | null>(null)

  const [queryResults, setQueryResults] = useState<Graphic[]>([])
  const [queryLabel, setQueryLabel] = useState('Buffer analysis off')
  const [basemap, setBasemap] = useState(mapConfig.initialBasemap)
  const [rightTab, setRightTab] = useState<RightTab>('chat')
  const [isAddLayerOpen, setIsAddLayerOpen] = useState(false)
  const [activeMapTool, setActiveMapTool] = useState<MapTool>('select-point')
  const [analysisSummary, setAnalysisSummary] = useState('')
  const [isBufferAnalysisEnabled, setIsBufferAnalysisEnabled] = useState(false)
  const lastGeocodeRequestAtRef = useRef(0)

  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>(
    Object.fromEntries(layerDefinitions.map((layer) => [layer.name, false])),
  )
  const layerVisibilityRef = useRef(layerVisibility)
  const allLayersCheckboxRef = useRef<HTMLInputElement | null>(null)
  const allLayersSelected = layerDefinitions.every(
    (layer) => layerVisibility[layer.name],
  )
  const someLayersSelected = layerDefinitions.some(
    (layer) => layerVisibility[layer.name],
  )

  const [collapsedCategories, setCollapsedCategories] =
    useState<Record<string, boolean>>({})

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: 'ai',
      text: 'Ask about a GIS asset, count, validation, or proximity. Select a map point for distance searches without an asset ID.',
    },
  ])

  useEffect(() => {
    layerVisibilityRef.current = layerVisibility
  }, [layerVisibility])

  useEffect(() => {
    if (allLayersCheckboxRef.current) {
      allLayersCheckboxRef.current.indeterminate =
        someLayersSelected && !allLayersSelected
    }
  }, [allLayersSelected, someLayersSelected])

  const toggleAllLayers = (visible: boolean) => {
    const nextVisibility = Object.fromEntries(
      layerDefinitions.map((layer) => [layer.name, visible]),
    )
    setLayerVisibility(nextVisibility)
    Object.values(operationalLayersRef.current).forEach((layer) => {
      layer.visible = visible
    })
  }

  const toggleLayer = (name: string, visible: boolean) => {
    setLayerVisibility((current) => ({ ...current, [name]: visible }))
    const layer = operationalLayersRef.current[name]
    if (layer) layer.visible = visible
  }

  const queryVisibleLayers = async (
    geometry: Geometry,
    featureType: string | null = null,
  ): Promise<QueryOutcome> => {
    const outcome = await querySpatialLayers({
      geometry,
      featureType,
      definitions: layerDefinitions,
      visibility: layerVisibilityRef.current,
      layers: operationalLayersRef.current,
    })

    setQueryResults(outcome.features)
    setAnalysisSummary(outcome.summary)
    outcome.features.forEach((feature) => {
      if (!feature.geometry) return
      selectedPointLayerRef.current?.add(
        new Graphic({
          geometry: feature.geometry,
          symbol: getFeatureSymbol(feature.geometry),
        }),
      )
    })

    return { count: outcome.count, summary: outcome.summary }
  }

  const runWithinDistance = async (
    mapPoint: Point,
    distanceKm: number,
    featureType: string | null,
    showBuffer = isBufferAnalysisEnabled,
  ): Promise<QueryOutcome> => {
    const graphicsLayer = selectedPointLayerRef.current
    const bufferLayer = analysisBufferLayerRef.current

    if (!graphicsLayer || !bufferLayer) {
      return { count: 0, summary: 'Map is not ready yet.' }
    }

    graphicsLayer.removeAll()
    bufferLayer.removeAll()
    setQueryLabel(
      featureType
        ? `${featureType}s within ${distanceKm} km`
        : `Selected layers within ${distanceKm} km`,
    )

    const buffer = await createKilometerBuffer(mapPoint, distanceKm)

    if (!buffer) return { count: 0, summary: 'Could not create the analysis buffer.' }

    if (showBuffer) {
      bufferLayer.add(
        new Graphic({
          geometry: buffer,
          symbol: new SimpleFillSymbol({
            color: [0, 120, 255, 0.08],
            outline: { color: [0, 120, 255, 0.8], width: 1.5 },
          }),
        }),
      )
    }

    return queryVisibleLayers(buffer, featureType)
  }

  const addSelectedLocationMarker = (point: Point) => {
    selectedPointLayerRef.current?.add(
      new Graphic({
        geometry: point,
        symbol: new SimpleMarkerSymbol({
          style: 'circle',
          color: 'red',
          size: 18,
          outline: { color: 'white', width: 2.5 },
        }),
      }),
    )
  }

  const toggleBufferAnalysis = async () => {
    const enabled = !isBufferAnalysisEnabled
    setIsBufferAnalysisEnabled(enabled)

    if (!enabled) {
      analysisBufferLayerRef.current?.removeAll()
      selectedPointLayerRef.current?.removeAll()
      setQueryResults([])
      setQueryLabel('Buffer analysis off')
      if (selectedPoint) {
        addSelectedLocationMarker(
          new Point({
            longitude: selectedPoint.longitude,
            latitude: selectedPoint.latitude,
            spatialReference: { wkid: 4326 },
          }),
        )
      }
      setAnalysisSummary('Buffer analysis is off. Map clicks will select locations without drawing a buffer.')
      return
    }

    if (!selectedPoint) {
      setQueryLabel('Assets within 2 km')
      setAnalysisSummary('Buffer analysis is on. Select a location to create a 2 km buffer.')
      return
    }

    const point = new Point({
      longitude: selectedPoint.longitude,
      latitude: selectedPoint.latitude,
      spatialReference: { wkid: 4326 },
    })
    await runWithinDistance(point, 2, null, true)
    addSelectedLocationMarker(point)
    setAnalysisSummary('2 km buffer analysis is on for the selected location.')
  }

  const setMapLocation = async (point: Point, label: string) => {
    const mapView = mapRef.current?.view
    if (!mapView) {
      setAnalysisSummary('The map is still loading. Try again in a moment.')
      return
    }

    const latitude = point.latitude
    const longitude = point.longitude
    if (latitude == null || longitude == null) {
      setAnalysisSummary('That location does not have valid coordinates.')
      return
    }

    setSelectedPoint({ latitude, longitude })
    selectedPointLayerRef.current?.removeAll()
    analysisBufferLayerRef.current?.removeAll()
    featureHighlightLayerRef.current?.removeAll()
    setQueryResults([])
    setQueryLabel(isBufferAnalysisEnabled ? 'Assets within 2 km' : 'Buffer analysis off')

    try {
      await mapView.goTo({ center: point, zoom: 14 })
      if (isBufferAnalysisEnabled) {
        await runWithinDistance(point, 2, null, true)
      }
      addSelectedLocationMarker(point)
      setAnalysisSummary(
        `${label} · ${latitude.toFixed(5)}, ${longitude.toFixed(5)}${isBufferAnalysisEnabled ? '' : ' · Buffer off'}`,
      )
    } catch (error) {
      console.error('Could not move the map to the requested location:', error)
      setAnalysisSummary('Could not move the map to that location. Please try again.')
    }
  }

  const handleLocationSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const searchText = locationSearch.trim()
    if (!searchText || isLocationSearchLoading) return

    const coordinateMatch = searchText.match(
      /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/,
    )

    if (coordinateMatch) {
      const latitude = Number(coordinateMatch[1])
      const longitude = Number(coordinateMatch[2])
      if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
        await setMapLocation(
          new Point({ latitude, longitude }),
          'Coordinates found',
        )
        return
      }
      setAnalysisSummary('Enter coordinates as latitude, longitude within valid ranges.')
      return
    }

    setIsLocationSearchLoading(true)
    try {
      const waitMs = Math.max(
        0,
        1000 - (Date.now() - lastGeocodeRequestAtRef.current),
      )
      if (waitMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, waitMs))
      }
      lastGeocodeRequestAtRef.current = Date.now()

      const params = new URLSearchParams({
        q: searchText,
        format: 'jsonv2',
        limit: '1',
      })
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        { headers: { Accept: 'application/json' } },
      )
      if (!response.ok) throw new Error(`Location search failed (${response.status})`)

      const candidates = (await response.json()) as Array<{
        lat: string
        lon: string
        display_name: string
      }>
      const candidate = candidates[0]
      if (!candidate) {
        setAnalysisSummary(`No location found for “${searchText}”. Try a city, address, or coordinates.`)
        return
      }

      await setMapLocation(
        new Point({ latitude: Number(candidate.lat), longitude: Number(candidate.lon) }),
        candidate.display_name,
      )
    } catch (error) {
      console.error('Location search failed:', error)
      setAnalysisSummary('Location search is unavailable right now. Check your connection and try again.')
    } finally {
      setIsLocationSearchLoading(false)
    }
  }

  const goToCurrentLocation = () => {
    if (!navigator.geolocation) {
      setAnalysisSummary('This browser does not provide device location.')
      return
    }

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setIsLocating(false)
        void setMapLocation(
          new Point({ latitude: coords.latitude, longitude: coords.longitude }),
          'Current location',
        )
      },
      (error) => {
        setIsLocating(false)
        setAnalysisSummary(
          error.code === error.PERMISSION_DENIED
            ? 'Location access was blocked. Allow location access in your browser to use this feature.'
            : 'Could not get your current location. Check device location and try again.',
        )
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }

  const openStreetView = () => {
    const mapCenter = mapRef.current?.view?.center
    const latitude = selectedPoint?.latitude ?? mapCenter?.latitude
    const longitude = selectedPoint?.longitude ?? mapCenter?.longitude
    if (latitude == null || longitude == null) {
      setAnalysisSummary('The map location is not ready yet.')
      return
    }

    const streetViewUrl = new URL('https://www.google.com/maps/@')
    streetViewUrl.searchParams.set('api', '1')
    streetViewUrl.searchParams.set('map_action', 'pano')
    streetViewUrl.searchParams.set('viewpoint', `${latitude},${longitude}`)
    window.open(streetViewUrl.toString(), '_blank', 'noopener,noreferrer')
  }

  const identifyFeatureAtClick = async (event: ClickEvent) => {
    const mapElement = mapRef.current
    const visibleLayers = [
      ...Object.values(operationalLayersRef.current).filter((layer) => layer.visible),
      ...(selectedPointLayerRef.current?.visible ? [selectedPointLayerRef.current] : []),
      ...(featureHighlightLayerRef.current ? [featureHighlightLayerRef.current] : []),
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

    if (geometry && mapElement.view.popup) {
      mapElement.view.popup.open({ features: [graphic], location: event.mapPoint ?? geometry.extent?.center })
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
    analysisBufferLayerRef.current?.removeAll()
    highlightLayer?.removeAll()
    setQueryResults([])

    if (isBufferAnalysisEnabled) {
      try {
        await runWithinDistance(mapPoint, 2, null, true)
      } catch (error) {
        console.error('2 KM ANALYSIS ERROR:', error)
      }
      setQueryLabel('Selected layers within 2 km')
    } else {
      setQueryLabel('Buffer analysis off')
      setAnalysisSummary('Location selected. Enable the buffer icon to analyze nearby assets within 2 km.')
    }
    addSelectedLocationMarker(mapPoint)

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

        if (Object.keys(operationalLayersRef.current).length > 0) return

        console.log('=== ARCGIS MAP READY ===')

        /*
         * Operational layers.
         */
        for (const definition of layerDefinitions) {
          const layer = createOperationalLayer(definition)
          layer.visible = layerVisibilityRef.current[definition.name] ?? false
          layer.popupTemplate = createFeaturePopupTemplate(definition)

          operationalLayersRef.current[definition.name] = layer
          map.add(layer)

          layer.when(
            () => {
              console.log(
                `[${definition.sourceClass} ${definition.sourceType} OK] ${definition.name}`,
                definition.sourceType === 'GeoJSON'
                  ? definition.url
                  : `${definition.url}/${definition.serviceLayerId}`,
              )
            },
            (error) => {
              console.error(
                `[${definition.sourceClass} ${definition.sourceType} ERROR] ${definition.name}`,
                definition.sourceType === 'GeoJSON'
                  ? definition.url
                  : `${definition.url}/${definition.serviceLayerId}`,
                error,
              )
            },
          )
        }

        const bufferLayer = new GraphicsLayer({
          title: 'Analysis Buffer',
        })
        analysisBufferLayerRef.current = bufferLayer
        map.add(bufferLayer)

        /*
         * Selected location and query result graphics.
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
              const distance = await measureDistanceKm(geometry)
              const summary = `Measured distance: ${distance.toFixed(2)} km.`
              setAnalysisSummary(summary)
              setChatHistory((current) => [...current, { role: 'ai', text: summary }])
            } else if (tool === 'measure-area' && geometry.type === 'polygon') {
              const area = await measureAreaKm2(geometry)
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
    if (!text.trim() || isCopilotLoading) return
    setIsCopilotLoading(true)
    setQueryResults([])
    setAnalysisSummary('Running GIS analysis…')
    featureHighlightLayerRef.current?.removeAll()
    analysisBufferLayerRef.current?.removeAll()
    selectedPointLayerRef.current?.removeAll()
    if (selectedPoint) {
      addSelectedLocationMarker(new Point({ longitude: selectedPoint.longitude, latitude: selectedPoint.latitude, spatialReference: { wkid: 4326 } }))
    }

    setQuestion('')

    setChatHistory((current) => [
      ...current,
      {
        role: 'user',
        text,
      },
    ])

    try {
      const response = await queryCopilot(text, selectedPoint)
      const graphics = response.features.flatMap((feature) => {
        if (!feature.geometry) return []
        try {
          const geometry = geoJsonToArcgisGeometry(feature.geometry)
          if (!geometry) return []
          return [new Graphic({
            geometry,
            attributes: { ...feature.attributes, layer_name: feature.layer, feature_id: feature.id, distance_m: feature.distance_m },
            symbol: getFeatureSymbol(geometry),
            popupTemplate: {
              title: feature.id,
              content: [{
                type: 'fields',
                fieldInfos: Object.keys(feature.attributes).slice(0, 24).map((fieldName) => ({
                  fieldName,
                  label: fieldName.replaceAll('_', ' '),
                })),
              }],
            },
          })]
        } catch (error) {
          console.warn('Could not render a Copilot result geometry:', error)
          return []
        }
      })

      selectedPointLayerRef.current?.removeAll()
      analysisBufferLayerRef.current?.removeAll()
      featureHighlightLayerRef.current?.removeAll()
      graphics.forEach((graphic) => featureHighlightLayerRef.current?.add(graphic))
      if (response.analysis_geometry) {
        const geometry = geoJsonToArcgisGeometry(response.analysis_geometry)
        if (geometry) {
          analysisBufferLayerRef.current?.add(new Graphic({
            geometry,
            symbol: new SimpleFillSymbol({
              color: [0, 120, 255, 0.08],
              outline: { color: [0, 120, 255, 0.8], width: 1.5 },
            }),
          }))
        }
      }
      setQueryResults(graphics)
      setAnalysisSummary(response.summary)
      setQueryLabel(response.intent?.type === 'BUFFER_ANALYSIS' || response.intent?.type === 'NEARBY_ASSETS'
        ? `${String(response.intent.distance ?? '')} ${String(response.intent.distance_unit ?? 'meters')}`
        : 'Copilot results')

      const mapView = mapRef.current?.view
      if (graphics.length > 0 && mapView) {
        await mapView.goTo(graphics).catch((error) => console.warn('Could not zoom to Copilot results:', error))
      }
      if (selectedPoint) {
        addSelectedLocationMarker(new Point({ longitude: selectedPoint.longitude, latitude: selectedPoint.latitude, spatialReference: { wkid: 4326 } }))
      }

      setChatHistory((current) => [...current, {
        role: 'ai', text: response.summary, analysis: response.analysis,
        warnings: response.warnings, trust: response.trust,
        results: response.features.map(({ id, layer, attributes, distance_m }) => ({ id, layer, attributes, distance_m })),
      }])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown connection error'
      const isApiError = error instanceof CopilotApiError
      setAnalysisSummary(isApiError ? `GIS analysis failed: ${message}` : `GIS Copilot is unavailable: ${message}`)
      setChatHistory((current) => [...current, {
        role: 'ai',
        text: isApiError
          ? `The GIS backend rejected or could not complete this request: ${message}`
          : 'I could not reach the GIS backend. Start the API service and try again. No spatial results were inferred in the browser.',
        warnings: [message],
      }])
    } finally {
      setIsCopilotLoading(false)
    }
  }

  const clearMap = () => {
    selectedPointLayerRef.current?.removeAll()
    analysisBufferLayerRef.current?.removeAll()
    featureHighlightLayerRef.current?.removeAll()

    setSelectedPoint(null)
    setQueryResults([])
    setQueryLabel(isBufferAnalysisEnabled ? 'Assets within 2 km' : 'Buffer analysis off')
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
      const definition = layerDefinitions.find((item) => item.name === layerName)
      if (!definition) return
      await zoomToLayer(mapView, layer, definition)
    } catch (error) {
      console.error(`Could not zoom to ${layerName}:`, error)
    }
  }

  const categories = [
    ...new Set(layerDefinitions.map((layer) => layer.category)),
  ]
  const allCategoriesCollapsed = categories.every(
    (category) => collapsedCategories[category],
  )

  const toggleAllLayerGroups = () => {
    const collapse = !allCategoriesCollapsed
    setCollapsedCategories(
      Object.fromEntries(categories.map((category) => [category, collapse])),
    )
  }

  const valves = queryResults.filter(
    (f) => f.attributes?.asset_type === 'Valve',
  ).length

  const pumpStations = queryResults.filter(
    (f) => f.attributes?.asset_type === 'Pump Station',
  ).length

  const facilities = queryResults.filter(
    (f) => f.attributes?.asset_type === 'Facility',
  ).length

  return {
    question, setQuestion, submitQuestion, isCopilotLoading, rightTab, setRightTab,
    categories, layerVisibility, allLayersCheckboxRef, allLayersSelected,
    allCategoriesCollapsed, collapsedCategories, isAddLayerOpen, activeMapTool,
    toggleAllLayers, toggleAllLayerGroups, toggleLayer, handleZoomToLayer,
    setCollapsedCategories, setIsAddLayerOpen, activateMapTool,
    mapRef, basemap, setBasemap, handleMapClick, locationSearch, setLocationSearch,
    handleLocationSearch, isLocationSearchLoading, isLocating, goToCurrentLocation,
    openStreetView, isBufferAnalysisEnabled, toggleBufferAnalysis, queryLabel,
    selectedPoint, clearMap, queryResults, valves, pumpStations, facilities,
    analysisSummary, setQueryResults, chatHistory,
  }
}
