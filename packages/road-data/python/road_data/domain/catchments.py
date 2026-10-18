"""Pure spatial preparation; no filesystem, network, database or clock access."""

from collections import defaultdict
from math import floor, isfinite
from typing import Iterable
from pyproj import Geod, Transformer
from shapely import STRtree, make_valid
from shapely.geometry import (
    GeometryCollection,
    MultiPoint,
    MultiPolygon,
    Point,
    Polygon,
    box,
)
from shapely.ops import transform
from shapely.geometry.polygon import orient
from shapely.geometry.base import BaseGeometry

GEOD = Geod(ellps="WGS84")
TO_METERS = Transformer.from_crs("EPSG:4326", "EPSG:32718", always_xy=True).transform
# A sampling mesh for area-weighted rainfall queries, not a claim of weather resolution.
SAMPLE_GRID_DEGREES = 0.1
# Exact road/river intersections can differ slightly from the separately segmented axis.
MAX_CROSSING_SEGMENT_DISTANCE_M = 20
MAX_SAMPLE_POINTS = 10_000
# Huaicos come from local quebradas. Above this area a crossing's upstream union is a major river
# (Huallaga, Maranon), whose rain average would dilute the local signal; PE-22's largest is ~7,000 km2.
MAX_UPSTREAM_AREA_KM2 = 10_000


def upstream_ids(outlets: Iterable[int], downstream: dict[int, int]) -> list[int]:
    reverse: dict[int, list[int]] = defaultdict(list)
    for source, target in downstream.items():
        if target:
            reverse[target].append(source)
    visited: set[int] = set()
    active: set[int] = set()

    def visit(identifier: int) -> None:
        if identifier in active:
            raise ValueError("Cycle in HydroBASINS upstream topology")
        if identifier in visited:
            return
        if identifier not in downstream:
            raise ValueError("Missing HydroBASINS outlet identity")
        active.add(identifier)
        for parent in reverse.get(identifier, []):
            visit(parent)
        active.remove(identifier)
        visited.add(identifier)

    for outlet in outlets:
        visit(outlet)
    return sorted(visited)


def point_intersections(geometry: BaseGeometry) -> list[Point]:
    if isinstance(geometry, Point):
        return [] if geometry.is_empty else [geometry]
    if isinstance(geometry, (MultiPoint, GeometryCollection)):
        return [point for part in geometry.geoms for point in point_intersections(part)]
    # Collinear road/river overlaps do not identify one crossing or a defensible outlet.
    return []


def valid_polygon(geometry: BaseGeometry) -> MultiPolygon:
    repaired = make_valid(geometry) if not geometry.is_valid else geometry
    if isinstance(repaired, Polygon):
        return MultiPolygon([repaired])
    if isinstance(repaired, MultiPolygon) and not repaired.is_empty:
        return repaired
    raise ValueError("Expected nonempty polygonal catchment")


def area_km2(geometry: BaseGeometry) -> float:
    if isinstance(geometry, MultiPolygon):
        return sum(area_km2(part) for part in geometry.geoms)
    area, _ = GEOD.geometry_area_perimeter(
        orient(geometry, sign=1.0) if isinstance(geometry, Polygon) else geometry
    )
    value = abs(area) / 1_000_000
    if not isfinite(value) or value <= 0:
        raise ValueError("Invalid geodesic catchment area")
    return value


def sampling_points(geometry: MultiPolygon) -> list[dict[str, float]]:
    west, south, east, north = geometry.bounds
    samples: list[dict[str, float]] = []
    for lon_index in range(
        floor(west / SAMPLE_GRID_DEGREES), floor(east / SAMPLE_GRID_DEGREES) + 1
    ):
        for lat_index in range(
            floor(south / SAMPLE_GRID_DEGREES), floor(north / SAMPLE_GRID_DEGREES) + 1
        ):
            cell = box(
                lon_index * SAMPLE_GRID_DEGREES,
                lat_index * SAMPLE_GRID_DEGREES,
                (lon_index + 1) * SAMPLE_GRID_DEGREES,
                (lat_index + 1) * SAMPLE_GRID_DEGREES,
            )
            clipped = geometry.intersection(cell)
            if clipped.is_empty or clipped.area <= 0:
                continue
            polygon = valid_polygon(clipped)
            point = polygon.representative_point()
            samples.append(
                {
                    "longitude": point.x,
                    "latitude": point.y,
                    "areaKm2": area_km2(polygon),
                }
            )
            if len(samples) > MAX_SAMPLE_POINTS:
                raise ValueError("Catchment exceeds configured sampling limit")
    total = sum(sample["areaKm2"] for sample in samples)
    if not total:
        raise ValueError("Catchment has no sampling area")
    return [{**sample, "weight": sample["areaKm2"] / total} for sample in samples]


class SegmentIndex:
    """Projected road segments with a spatial index; long roads have thousands of segments."""

    def __init__(self, segments: list[tuple[str, BaseGeometry]]):
        if not segments:
            raise ValueError("No road segments")
        self.identifiers = [identifier for identifier, _ in segments]
        self.lines = [transform(TO_METERS, line) for _, line in segments]
        self.tree = STRtree(self.lines)

    def crossing_ids(self, point: Point) -> list[str]:
        projected = transform(TO_METERS, point)
        nearby = self.tree.query(projected.buffer(MAX_CROSSING_SEGMENT_DISTANCE_M + 1))
        distances = [
            (self.identifiers[index], projected.distance(self.lines[index]))
            for index in nearby
        ]
        if not distances:
            return []
        minimum = min(distance for _, distance in distances)
        if minimum > MAX_CROSSING_SEGMENT_DISTANCE_M:
            return []
        return sorted(
            identifier
            for identifier, distance in distances
            if abs(distance - minimum) < 0.01
        )


def crossing_segment_ids(
    point: Point, segments: list[tuple[str, BaseGeometry]]
) -> list[str]:
    return SegmentIndex(segments).crossing_ids(point)


def containing_basin_segments(
    segments: list[tuple[str, BaseGeometry]], basins: dict[int, BaseGeometry]
) -> dict[int, list[str]]:
    """Group segments by the basin that covers their midpoint; boundary ties pick the lowest id."""
    grouped: dict[int, list[str]] = defaultdict(list)
    identifiers = list(basins)
    tree = STRtree([basins[basin] for basin in identifiers])
    for identifier, line in segments:
        midpoint = line.interpolate(0.5, normalized=True)
        matches = sorted(
            identifiers[index] for index in tree.query(midpoint, predicate="covered_by")
        )
        if not matches:
            # A midpoint in a basin gap or offshore stays unlinked rather than guessed.
            continue
        grouped[matches[0]].append(identifier)
    return {basin: sorted(ids) for basin, ids in grouped.items()}
