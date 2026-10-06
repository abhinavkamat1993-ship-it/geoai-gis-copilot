import type GeoJSONLayer from '@arcgis/core/layers/GeoJSONLayer'
import type MapView from '@arcgis/core/views/MapView'

/** Zooms the map to a layer's loaded feature extent with a small visual margin. */
export async function zoomToLayer(
  mapView: MapView,
  layer: GeoJSONLayer,
): Promise<void> {
  await layer.load()
  const { extent } = await layer.queryExtent()

  if (extent) {
    await mapView.goTo(extent.expand(1.2))
  }
}
