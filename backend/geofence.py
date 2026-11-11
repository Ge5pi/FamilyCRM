"""Geofence geometry helpers."""

from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_M = 6_371_000


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in metres (haversine)."""
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = (
        sin(d_lat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * asin(sqrt(a))


def is_inside(
    latitude: float, longitude: float, fence_latitude: float, fence_longitude: float, radius_m: float
) -> bool:
    return distance_m(latitude, longitude, fence_latitude, fence_longitude) <= radius_m
