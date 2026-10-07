from typing import Any

import geopandas as gpd
from pyproj import CRS
from shapely.geometry import shape


def to_geometry(feature: dict[str, Any]):
    geometry = feature.get("geometry")
    return shape(geometry) if geometry else None


def projected_frame(features: list[dict[str, Any]]) -> tuple[gpd.GeoDataFrame, CRS]:
    geometries = [to_geometry(feature) for feature in features]
    valid = [geometry for geometry in geometries if geometry is not None and not geometry.is_empty]
    if not valid:
        return gpd.GeoDataFrame(geometry=[], crs="EPSG:4326"), CRS.from_epsg(32613)
    source = gpd.GeoDataFrame(geometry=valid, crs="EPSG:4326")
    center = source.geometry.union_all().centroid
    zone = max(1, min(60, int((center.x + 180) // 6) + 1))
    epsg = (32600 if center.y >= 0 else 32700) + zone
    return source.to_crs(epsg=epsg), CRS.from_epsg(epsg)


def project_geometry(geometry, crs: CRS):
    series = gpd.GeoSeries([geometry], crs="EPSG:4326")
    return series.to_crs(crs).iloc[0]
