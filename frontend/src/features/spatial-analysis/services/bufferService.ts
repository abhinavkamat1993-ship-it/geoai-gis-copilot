import Point from '@arcgis/core/geometry/Point'
import type Geometry from '@arcgis/core/geometry/Geometry'
import * as geodesicBufferOperator from '@arcgis/core/geometry/operators/geodesicBufferOperator'

/** Uses a geodesic buffer so distance remains meaningful across the map's projection. */
export async function createKilometerBuffer(point: Point, distanceKm: number): Promise<Geometry | null> {
  if (!geodesicBufferOperator.isLoaded()) {
    await geodesicBufferOperator.load()
  }

  return geodesicBufferOperator.execute(point, distanceKm, { unit: 'kilometers' }) ?? null
}
