import FeatureLayer from '@arcgis/core/layers/FeatureLayer'
import GeoJSONLayer from '@arcgis/core/layers/GeoJSONLayer'
import type { LayerDefinition } from './layerDefinitions'

export type OperationalLayer = GeoJSONLayer | FeatureLayer

/** Creates a queryable ArcGIS layer from source metadata; UI and analysis use one layer API. */
export function createOperationalLayer(definition: LayerDefinition): OperationalLayer {
  if (definition.sourceType === 'GeoJSON') {
    return new GeoJSONLayer({
      url: definition.url,
      title: definition.name,
      outFields: ['*'],
    })
  }

  if (definition.sourceType === 'ArcGIS Feature Service') {
    if (definition.serviceLayerId === undefined) {
      throw new Error(`A service layer ID is required for ${definition.name}`)
    }

    return new FeatureLayer({
      url: `${definition.url}/${definition.serviceLayerId}`,
      title: definition.name,
      outFields: ['*'],
    })
  }

  const unsupported: never = definition.sourceType
  throw new Error(`Unsupported data connector: ${unsupported}`)
}
