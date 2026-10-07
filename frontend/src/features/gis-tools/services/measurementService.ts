import type Polygon from '@arcgis/core/geometry/Polygon'
import type Polyline from '@arcgis/core/geometry/Polyline'
import * as geodeticLengthOperator from '@arcgis/core/geometry/operators/geodeticLengthOperator'
import * as geodeticAreaOperator from '@arcgis/core/geometry/operators/geodeticAreaOperator'

export async function measureDistanceKm(geometry: Polyline): Promise<number> {
  if (!geodeticLengthOperator.isLoaded()) await geodeticLengthOperator.load()
  return geodeticLengthOperator.execute(geometry, { unit: 'kilometers' })
}

export async function measureAreaKm2(geometry: Polygon): Promise<number> {
  if (!geodeticAreaOperator.isLoaded()) await geodeticAreaOperator.load()
  return geodeticAreaOperator.execute(geometry, { unit: 'square-kilometers' })
}
