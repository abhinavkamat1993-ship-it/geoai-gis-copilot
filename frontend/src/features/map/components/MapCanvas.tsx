import type { FormEvent, RefObject } from 'react'
import '@arcgis/map-components/components/arcgis-map'
import '@arcgis/map-components/components/arcgis-zoom'
import type { ArcgisMap } from '@arcgis/map-components/components/arcgis-map'
import type { ClickEvent } from '@arcgis/core/views/input/types'
import { mapConfig } from '../../../core/config/mapConfig'

type SelectedPoint = { longitude: number; latitude: number } | null

type MapCanvasProps = {
  mapRef: RefObject<ArcgisMap | null>
  basemap: string
  onBasemapChange: (basemap: string) => void
  onMapClick: (event: ClickEvent) => void
  locationSearch: string
  onLocationSearchChange: (value: string) => void
  onLocationSearch: (event: FormEvent<HTMLFormElement>) => void
  locationSearchLoading: boolean
  locating: boolean
  onCurrentLocation: () => void
  onStreetView: () => void
  bufferEnabled: boolean
  onToggleBuffer: () => void
  queryLabel: string
  selectedPoint: SelectedPoint
  onClearMap: () => void
}

/** Keeps ArcGIS custom elements and map-only controls out of the workspace state owner. */
export function MapCanvas({
  mapRef, basemap, onBasemapChange, onMapClick,
  locationSearch, onLocationSearchChange, onLocationSearch,
  locationSearchLoading, locating, onCurrentLocation, onStreetView,
  bufferEnabled, onToggleBuffer, queryLabel, selectedPoint, onClearMap,
}: MapCanvasProps) {
  return (
    <section className="map-workspace">
      <div className="map-container">
        <arcgis-map
          ref={mapRef}
          basemap={basemap}
          center={mapConfig.initialCenter.join(',')}
          zoom={mapConfig.initialZoom}
          onarcgisViewClick={(event) => onMapClick(event.detail)}
        >
          <arcgis-zoom slot="top-left" />
        </arcgis-map>

        <form className="map-search" onSubmit={onLocationSearch}>
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Search map location"
            placeholder="Search a place, address, or coordinates..."
            value={locationSearch}
            onChange={(event) => onLocationSearchChange(event.target.value)}
          />
          <button type="submit" aria-label="Search map location" title="Search map location" disabled={locationSearchLoading || !locationSearch.trim()}>
            {locationSearchLoading ? '…' : '➤'}
          </button>
        </form>

        <div className="map-location-controls" aria-label="Map location controls">
          <button type="button" onClick={onCurrentLocation} aria-label="Go to my current location" title="Go to my current location" disabled={locating}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2.5" />
              <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
            </svg>
          </button>
          <button type="button" onClick={onStreetView} aria-label="Open Street View at this map location" title="Open Street View at this map location">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="5" r="2.5" /><path d="M8.5 21v-4.5l1-5.5h5l1 5.5V21M9.5 14h5M7 21h10" />
            </svg>
          </button>
          <button
            type="button"
            className={bufferEnabled ? 'buffer-control active' : 'buffer-control'}
            onClick={onToggleBuffer}
            aria-label={bufferEnabled ? 'Turn off 2 km buffer analysis' : 'Turn on 2 km buffer analysis'}
            aria-pressed={bufferEnabled}
            title={bufferEnabled ? 'Turn off 2 km buffer analysis' : 'Turn on 2 km buffer analysis'}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2" /></svg>
          </button>
        </div>

        <div className="map-legend">
          <strong>Legend</strong>
          <span>🔴 Selected Location</span>
          <span>{bufferEnabled ? '▧ Analysis Buffer (' + (queryLabel.match(/\d+(?:\.\d+)?/)?.[0] || 2) + ' km)' : '▧ Buffer Analysis Off'}</span>
          <span>◆ Query Results</span>
        </div>

        <div className="map-bottom-bar">
          {selectedPoint && <div className="selected-location">
            <span>📍</span>
            <div>
              <strong>Selected Location</strong>
              <small>{selectedPoint.latitude.toFixed(4)}, {selectedPoint.longitude.toFixed(4)}</small>
            </div>
          </div>}
          <select aria-label="Map basemap" value={basemap} onChange={(event) => onBasemapChange(event.target.value)}>
            <option value="osm">🗺 Basemap · Streets</option>
            <option value="satellite">🛰 Basemap · Satellite</option>
            <option value="hybrid">🌐 Basemap · Hybrid</option>
            <option value="topo-vector">⛰ Basemap · Topographic</option>
          </select>
          <button type="button" className="clear-button" onClick={onClearMap}>Clear</button>
        </div>
      </div>
    </section>
  )
}
