import { useState } from 'react'
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

  return (
    <div className="app-shell">

      <WorkspaceHeader
        question={question}
        onQuestionChange={setQuestion}
        onSubmitQuestion={() => void submitQuestion()}
        onOpenTools={() => setRightTab('tools')}
      />
      {/* MAIN */}
      <main className={`main-grid${layersCollapsed ? ' layers-collapsed' : ''}${assistantCollapsed ? ' assistant-collapsed' : ''}`}>

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
          <AnalysisResults
            total={queryResults.length}
            valves={valves}
            pumpStations={pumpStations}
            facilities={facilities}
            queryLabel={queryLabel}
            hasSelectedPoint={selectedPoint !== null}
            summary={analysisSummary}
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

