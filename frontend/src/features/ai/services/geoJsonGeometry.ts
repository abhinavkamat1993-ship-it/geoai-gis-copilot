import Point from '@arcgis/core/geometry/Point'
import Multipoint from '@arcgis/core/geometry/Multipoint'
import Polygon from '@arcgis/core/geometry/Polygon'
import Polyline from '@arcgis/core/geometry/Polyline'
import type Geometry from '@arcgis/core/geometry/Geometry'

type GeoJsonGeometry = { type?: unknown; coordinates?: unknown }
const spatialReference = { wkid: 4326 }

function isPosition(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number'
}

function isPositionArray(value: unknown): value is number[][] {
  return Array.isArray(value) && value.every(isPosition)
}

export function geoJsonToArcgisGeometry(value: Record<string, unknown>): Geometry | null {
  const geometry = value as GeoJsonGeometry
  const coordinates = geometry.coordinates
  if (geometry.type === 'Point' && isPosition(coordinates)) {
    return new Point({ longitude: coordinates[0], latitude: coordinates[1], spatialReference })
  }
  if (geometry.type === 'MultiPoint' && isPositionArray(coordinates)) {
    return new Multipoint({ points: coordinates, spatialReference })
  }
  if (geometry.type === 'LineString' && isPositionArray(coordinates)) {
    return new Polyline({ paths: [coordinates], spatialReference })
  }
  if (geometry.type === 'MultiLineString' && Array.isArray(coordinates) && coordinates.every(isPositionArray)) {
    return new Polyline({ paths: coordinates, spatialReference })
  }
  if (geometry.type === 'Polygon' && Array.isArray(coordinates) && coordinates.every(isPositionArray)) {
    return new Polygon({ rings: coordinates, spatialReference })
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(coordinates) && coordinates.every((polygon) =>
    Array.isArray(polygon) && polygon.every(isPositionArray))) {
    return new Polygon({ rings: coordinates.flat(1), spatialReference })
  }
  return null
}
