import type { RefObject } from 'react'
import type { LayerDefinition } from '../layerDefinitions'
import type { MapTool } from '../../gis-tools/types/gisTool'

type LayerManagerProps = {
  definitions: LayerDefinition[]
  categories: string[]
  visibility: Record<string, boolean>
  allLayersCheckboxRef: RefObject<HTMLInputElement | null>
  allLayersSelected: boolean
  allCategoriesCollapsed: boolean
  collapsedCategories: Record<string, boolean>
  addLayerOpen: boolean
  activeMapTool: MapTool
  onToggleAllLayers: (visible: boolean) => void
  onToggleAllGroups: () => void
  onToggleCategory: (category: string) => void
  onToggleLayer: (name: string, visible: boolean) => void
  onZoomToLayer: (name: string) => void
  onAddLayerOpen: () => void
  onAddLayerClose: () => void
  onActivateMapTool: (tool: MapTool) => void
  onSetQuestion: (question: string) => void
  onCollapsePanel: () => void
}

/** Layer controls stay together so visibility and source labels are managed in one place. */
export function LayerManager({
  definitions, categories, visibility, allLayersCheckboxRef,
  allLayersSelected, allCategoriesCollapsed, collapsedCategories,
  addLayerOpen, activeMapTool, onToggleAllLayers, onToggleAllGroups,
  onToggleCategory, onToggleLayer, onZoomToLayer, onAddLayerOpen,
  onAddLayerClose, onActivateMapTool, onSetQuestion, onCollapsePanel,
}: LayerManagerProps) {
  return (
    <aside className="left-panel">
      <section className="panel-section">
        <div className="panel-heading">
          <h2>LAYERS</h2>
          <div className="panel-heading-actions">
            <button type="button" className="panel-collapse-button" aria-label="Collapse layers panel" title="Collapse layers panel" onClick={onCollapsePanel}>‹</button>
            <label className="all-layers-toggle" title="Show or hide all layers">
              <input
                ref={allLayersCheckboxRef}
                type="checkbox"
                checked={allLayersSelected}
                aria-label="Toggle all operational layers"
                onChange={(event) => onToggleAllLayers(event.target.checked)}
              />
              <span>All</span>
            </label>
            <button
              type="button"
              className="collapse-layers-button"
              aria-label={allCategoriesCollapsed ? 'Expand all layer groups' : 'Collapse all layer groups'}
              title={allCategoriesCollapsed ? 'Expand all layer groups' : 'Collapse all layer groups'}
              onClick={onToggleAllGroups}
            >
              {allCategoriesCollapsed ? '⌄' : '⌃'}
            </button>
            <button type="button" aria-label="Add layer" title="Add layer" onClick={onAddLayerOpen}>＋</button>
          </div>
        </div>

        <div className="layer-search">
          <span>⌕</span>
          <input placeholder="Search layers..." />
        </div>

        <div className="layer-list">
          {categories.map((category) => (
            <div className="layer-category" key={category}>
              <div className="layer-category-title" role="button" tabIndex={0} onClick={() => onToggleCategory(category)}>
                <span>{collapsedCategories[category] ? '▸' : '▾'}</span>
                <strong>{category}</strong>
              </div>
              {!collapsedCategories[category] && definitions
                .filter((layer) => layer.category === category)
                .map((layer) => (
                  <div className="layer-row" key={layer.id}>
                    <label className="layer-toggle" htmlFor={layer.id}>
                      <input
                        id={layer.id}
                        type="checkbox"
                        checked={visibility[layer.name] ?? false}
                        onChange={(event) => onToggleLayer(layer.name, event.target.checked)}
                      />
                      <span>{layer.name}</span>
                      <span
                        className={`layer-source-badge ${layer.sourceClass === 'AUTHORITATIVE' ? 'is-public' : 'is-demo'}`}
                        title={`${layer.sourceClass} · ${layer.dataOwner}. ${layer.lastUpdated ? `Updated ${layer.lastUpdated}.` : 'Last-updated timestamp not reported in the registry.'} ${layer.usageNotes}`}
                      >
                        {layer.sourceClass === 'AUTHORITATIVE' ? 'AUTHORITATIVE · PUBLIC' : layer.sourceClass}
                      </span>
                    </label>
                    <button
                      type="button"
                      className="layer-menu-button"
                      title={`Zoom to ${layer.name}`}
                      aria-label={`Zoom to ${layer.name}`}
                      onClick={() => onZoomToLayer(layer.name)}
                    >
                      ⋯
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </section>

      {addLayerOpen && (
        <div className="add-layer-overlay">
          <div className="add-layer-panel">
            <div className="add-layer-header">
              <div><h3>Add Layer</h3><p>Select a GIS dataset to display on the map.</p></div>
              <button type="button" onClick={onAddLayerClose}>×</button>
            </div>
            <div className="add-layer-list">
              {definitions.map((layer) => {
                const visible = visibility[layer.name] ?? false
                return (
                  <div className="add-layer-row" key={layer.id}>
                    <div><strong>{layer.name}</strong><span>{layer.category}</span></div>
                    <button type="button" onClick={() => onToggleLayer(layer.name, !visible)}>
                      {visible ? 'Remove' : 'Add'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <section className="panel-section map-tools-section">
        <h2>MAP TOOLS</h2>
        <button className={`tool-row ${activeMapTool === 'select-point' ? 'active' : ''}`} type="button" onClick={() => onActivateMapTool('select-point')}>📍 Select Point</button>
        <button className={`tool-row ${activeMapTool === 'draw-polygon' ? 'active' : ''}`} type="button" onClick={() => onActivateMapTool('draw-polygon')}>⬡ Draw Polygon</button>
        <button className={`tool-row ${activeMapTool === 'draw-line' ? 'active' : ''}`} type="button" onClick={() => onActivateMapTool('draw-line')}>〰 Draw Line</button>
        <button className={`tool-row ${activeMapTool === 'measure-distance' ? 'active' : ''}`} type="button" onClick={() => onActivateMapTool('measure-distance')}>📏 Measure Distance</button>
        <button className={`tool-row ${activeMapTool === 'measure-area' ? 'active' : ''}`} type="button" onClick={() => onActivateMapTool('measure-area')}>📐 Measure Area</button>
        <button className={`tool-row ${activeMapTool === 'identify-feature' ? 'active' : ''}`} type="button" onClick={() => onActivateMapTool('identify-feature')}>🔎 Identify Feature</button>
      </section>

      <section className="panel-section recent-section">
        <h2>RECENT QUERIES</h2>
        {[
          'Find valves within 5 km',
          'Find pump stations within 5 km',
          'Find critical assets within 5 km',
          'Find facilities within 10 km',
        ].map((item) => (
          <button key={item} type="button" onClick={() => onSetQuestion(item)}>{item}</button>
        ))}
      </section>
    </aside>
  )
}
