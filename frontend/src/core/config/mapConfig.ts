/** Default demo viewport sits over the Permian Basin, where regional GIS layers are available. */
export const mapConfig = {
  initialCenter: [-102, 32] as [number, number],
  initialZoom: 8,
  initialBasemap: 'osm',
}

/** Keep nationwide public service queries bounded to a useful, lightweight exploration window. */
export const publicDataExploreExtent = {
  xmin: -103.5,
  ymin: 30.8,
  xmax: -100.5,
  ymax: 33.2,
  spatialReference: { wkid: 4326 },
}
