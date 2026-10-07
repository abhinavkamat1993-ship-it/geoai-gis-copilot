import Graphic from '@arcgis/core/Graphic'
import type Geometry from '@arcgis/core/geometry/Geometry'
import type { LayerDefinition } from '../../layers/layerDefinitions'
import { matchesLayerType } from '../../layers/layerDefinitions'
import type { OperationalLayer } from '../../layers/connectors'

export type SpatialQueryOutcome = {
  count: number
  summary: string
  features: Graphic[]
}

type QuerySpatialLayersOptions = {
  geometry: Geometry
  featureType: string | null
  definitions: LayerDefinition[]
  visibility: Record<string, boolean>
  layers: Record<string, OperationalLayer>
}

/** Queries only visible layers so both the map and AI respect the user's layer selection. */
export async function querySpatialLayers({
  geometry,
  featureType,
  definitions,
  visibility,
  layers,
}: QuerySpatialLayersOptions): Promise<SpatialQueryOutcome> {
  const visibleLayers = definitions
    .filter((definition) => visibility[definition.name])
    .filter((definition) => !featureType || matchesLayerType(definition, featureType))
    .map((definition) => ({ definition, layer: layers[definition.name] }))
    .filter((entry): entry is typeof entry & { layer: OperationalLayer } => Boolean(entry.layer))

  if (visibleLayers.length === 0) {
    const summary = featureType
      ? `Turn on the ${featureType} layer to include it in analysis.`
      : 'Turn on one or more layers to include features in analysis.'
    return { count: 0, summary, features: [] }
  }

  const results = await Promise.all(visibleLayers.map(async ({ definition, layer }) => {
    try {
      const { features } = await layer.queryFeatures({
        geometry,
        spatialRelationship: 'intersects',
        returnGeometry: true,
        outFields: ['*'],
      })
      const singularName = definition.name.replace(/ies$/, 'y').replace(/s$/, '')

      return {
        definition,
        features: features.map((feature) => new Graphic({
          geometry: feature.geometry,
          attributes: {
            ...feature.attributes,
            layer_name: definition.name,
            ...(definition.category === 'Assets'
              ? { asset_type: feature.attributes?.asset_type ?? singularName }
              : {}),
          },
        })),
        error: null as string | null,
      }
    } catch (error) {
      console.error(`Spatial query failed for ${definition.name}:`, error)
      return { definition, features: [] as Graphic[], error: error instanceof Error ? error.message : 'Unknown service error' }
    }
  }))

  const features = results.flatMap((result) => result.features)
  const layerCounts = results
    .filter((result) => result.features.length > 0)
    .map(({ definition, features: layerFeatures }) => `${definition.name}: ${layerFeatures.length}`)
    .join(' · ') || 'No matching features in the selected layers.'
  const sources = results
    .filter((result) => result.features.length > 0)
    .map(({ definition }) => `${definition.sourceClass} · ${definition.dataOwner}`)
  const failedLayers = results.filter((result) => result.error).map(({ definition }) => definition.name)
  const sourceSummary = sources.length > 0 ? ` | Sources: ${[...new Set(sources)].join('; ')}` : ''
  const failureSummary = failedLayers.length > 0
    ? ` | Could not query: ${failedLayers.join(', ')}. A service failure is not the same as zero matching features.`
    : ''
  const summary = `${layerCounts}${sourceSummary}${failureSummary}`

  return { count: features.length, summary, features }
}
