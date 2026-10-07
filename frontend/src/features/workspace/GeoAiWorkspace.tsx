import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { AiAssistant } from '../ai/components/AiAssistant'
import { LayerManager } from '../layers/components/LayerManager'
import { MapCanvas } from '../map/components/MapCanvas'
import { AnalysisResults } from '../spatial-analysis/components/AnalysisResults'
import { useGeoAiWorkspace } from './hooks/useGeoAiWorkspace'
import { WorkspaceHeader } from './components/WorkspaceHeader'
import { layerDefinitions } from '../layers/layerDefinitions'

export function GeoAiWorkspace() {
  const [layersCollapsed, setLayersCollapsed] = useState(false)
  const [assistantCollapsed, setAssistantCollapsed] = useState(false)
  const [assistantWidth, setAssistantWidth] = useState(440)
  const resizeStartRef = useRef<{ pointerId: number; x: number; width: number } | null>(null)
  const {
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
  } = useGeoAiWorkspace()

  const maxAssistantWidth = Math.min(700, Math.max(320, window.innerWidth * 0.45))
  useEffect(() => {
    const clampAssistantWidth = () => {
      const max = Math.min(700, Math.max(320, window.innerWidth * 0.45))
      setAssistantWidth((width) => Math.min(max, Math.max(320, width)))
    }
    window.addEventListener('resize', clampAssistantWidth)
    return () => {
      window.removeEventListener('resize', clampAssistantWidth)
      document.documentElement.classList.remove('panel-resizing')
    }
  }, [])
  const stopAssistantResize = (event?: ReactPointerEvent<HTMLDivElement>) => {
    resizeStartRef.current = null
    document.documentElement.classList.remove('panel-resizing')
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }
  const startAssistantResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (window.matchMedia('(max-width: 900px)').matches) return
    event.preventDefault()
    resizeStartRef.current = { pointerId: event.pointerId, x: event.clientX, width: Math.min(assistantWidth, maxAssistantWidth) }
    document.documentElement.classList.add('panel-resizing')
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveAssistantResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    const nextWidth = start.width + start.x - event.clientX
    setAssistantWidth(Math.round(Math.max(320, Math.min(maxAssistantWidth, nextWidth))))
  }
  const resizeAssistantWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 16
    if (event.key === 'ArrowLeft') setAssistantWidth((width) => Math.min(maxAssistantWidth, width + step))
    else if (event.key === 'ArrowRight') setAssistantWidth((width) => Math.max(320, width - step))
    else if (event.key === 'Home') setAssistantWidth(320)
    else if (event.key === 'End') setAssistantWidth(maxAssistantWidth)
    else return
    event.preventDefault()
  }

  return (
    <div className="app-shell">

      <WorkspaceHeader
        question={question}
        onQuestionChange={setQuestion}
        onSubmitQuestion={() => void submitQuestion()}
        onOpenTools={() => setRightTab('tools')}
      />
      {/* MAIN */}
      <main
        className={`main-grid${layersCollapsed ? ' layers-collapsed' : ''}${assistantCollapsed ? ' assistant-collapsed' : ''}`}
        style={{ '--assistant-panel-width': `${assistantWidth}px` } as CSSProperties}
      >

        {layersCollapsed ? <button className="panel-reopen panel-reopen-left" type="button" aria-label="Open layers panel" title="Open layers panel" onClick={() => setLayersCollapsed(false)}>▤</button> : <LayerManager
          definitions={layerDefinitions}
          categories={categories}
          visibility={layerVisibility}
          allLayersCheckboxRef={allLayersCheckboxRef}
          allLayersSelected={allLayersSelected}
          allCategoriesCollapsed={allCategoriesCollapsed}
          collapsedCategories={collapsedCategories}
          addLayerOpen={isAddLayerOpen}
          activeMapTool={activeMapTool}
          onToggleAllLayers={toggleAllLayers}
          onToggleAllGroups={toggleAllLayerGroups}
          onToggleCategory={(category) => setCollapsedCategories((current) => ({
            ...current,
            [category]: !current[category],
          }))}
          onToggleLayer={toggleLayer}
          onZoomToLayer={(name) => void handleZoomToLayer(name)}
          onAddLayerOpen={() => setIsAddLayerOpen(true)}
          onAddLayerClose={() => setIsAddLayerOpen(false)}
          onActivateMapTool={activateMapTool}
          onSetQuestion={setQuestion}
          onCollapsePanel={() => setLayersCollapsed(true)}
        />}
        <MapCanvas
          mapRef={mapRef}
          basemap={basemap}
          onBasemapChange={setBasemap}
          onMapClick={handleMapClick}
          locationSearch={locationSearch}
          onLocationSearchChange={setLocationSearch}
          onLocationSearch={handleLocationSearch}
          locationSearchLoading={isLocationSearchLoading}
          locating={isLocating}
          onCurrentLocation={goToCurrentLocation}
          onStreetView={openStreetView}
          bufferEnabled={isBufferAnalysisEnabled}
          onToggleBuffer={() => void toggleBufferAnalysis()}
          queryLabel={queryLabel}
          selectedPoint={selectedPoint}
          onClearMap={clearMap}
        />
        {assistantCollapsed ? <button className="panel-reopen panel-reopen-right" type="button" aria-label="Open analysis and AI assistant" title="Open analysis and AI assistant" onClick={() => setAssistantCollapsed(false)}>✦</button> : <aside className="right-panel">
          <div
            className="right-panel-resize-handle"
            role="separator"
            aria-label="Resize AI analysis panel"
            aria-orientation="vertical"
            aria-valuemin={320}
            aria-valuemax={maxAssistantWidth}
            aria-valuenow={Math.min(assistantWidth, maxAssistantWidth)}
            aria-valuetext={`${Math.min(assistantWidth, maxAssistantWidth)} pixels`}
            tabIndex={0}
            onPointerDown={startAssistantResize}
            onPointerMove={moveAssistantResize}
            onPointerUp={stopAssistantResize}
            onPointerCancel={stopAssistantResize}
            onLostPointerCapture={() => stopAssistantResize()}
            onKeyDown={resizeAssistantWithKeyboard}
          />
          <AnalysisResults
            total={queryResults.length}
            valves={valves}
            pumpStations={pumpStations}
            facilities={facilities}
            queryLabel={queryLabel}
            hasSelectedPoint={selectedPoint !== null}
            summary={analysisSummary}
            results={queryResults}
            onClear={() => setQueryResults([])}
          />
          <AiAssistant
            tab={rightTab}
            messages={chatHistory}
            question={question}
            loading={isCopilotLoading}
            onTabChange={setRightTab}
            onQuestionChange={setQuestion}
            onSubmitQuestion={(text) => void submitQuestion(text)}
            onActivateMapTool={activateMapTool}
            onCollapsePanel={() => setAssistantCollapsed(true)}
          />
        </aside>}
      </main>
    </div>
  )
}

