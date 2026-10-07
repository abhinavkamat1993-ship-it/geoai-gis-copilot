import type Geometry from '@arcgis/core/geometry/Geometry'
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol'
import SimpleLineSymbol from '@arcgis/core/symbols/SimpleLineSymbol'
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol'

export function getFeatureSymbol(geometry: Geometry, highlighted = false) {
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
    return new SimpleLineSymbol({ color: accent, width: highlighted ? 5 : 3 })
  }

  return new SimpleFillSymbol({
    color: highlighted ? [255, 198, 46, 0.25] : [35, 126, 245, 0.18],
    outline: { color: accent, width: highlighted ? 3 : 2 },
  })
}
