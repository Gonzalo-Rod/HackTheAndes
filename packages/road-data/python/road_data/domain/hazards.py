"""Pure geometry operations; susceptibility classes never become forecast risk labels."""

from shapely.geometry import Point, mapping, MultiPolygon, Polygon, GeometryCollection
from pyproj import Transformer
from shapely.ops import transform, unary_union
from shapely import make_valid, STRtree
from road_data.domain.catchments import area_km2

TO_METERS = Transformer.from_crs(4326, 32718, always_xy=True).transform
TO_WGS84 = Transformer.from_crs(32718, 4326, always_xy=True).transform
DISPLAY_SIMPLIFICATION_M = 25


def polygonal(geometry):
    geometry = make_valid(geometry) if not geometry.is_valid else geometry
    if isinstance(geometry, Polygon):
        return MultiPolygon([geometry])
    if isinstance(geometry, MultiPolygon):
        return geometry
    if isinstance(geometry, GeometryCollection):
        parts = [
            part
            for part in geometry.geoms
            if isinstance(part, (Polygon, MultiPolygon)) and part.area > 0
        ]
        return polygonal(unary_union(parts)) if parts else MultiPolygon([])
    return MultiPolygon([])


def classes_at(point, geometries, classes, tree):
    return sorted(
        {classes[int(index)] for index in tree.query(point, predicate="intersects")}
    )


def weighted_susceptibility(samples, geometries, classes):
    tree = STRtree(geometries)
    weights = {str(level): 0.0 for level in range(1, 6)}
    unknown = 0.0
    for sample in samples:
        levels = [
            level
            for level in classes_at(
                Point(sample["longitude"], sample["latitude"]),
                geometries,
                classes,
                tree,
            )
            if level > 0
        ]
        if levels:
            weights[str(max(levels))] += sample["weight"]
        else:
            unknown += sample["weight"]
    # Weights sum to one only up to floating-point error (PE-12A reached 1.0000000000000002).
    return {
        "classWeights": {level: min(1.0, weight) for level, weight in weights.items()},
        "unknownWeight": min(1.0, unknown),
        "method": "area_weighted_sampling",
        "boundaryRule": "highest_class",
    }


def unit_overlap(catchment, units):
    total = area_km2(catchment)
    matches = []
    pieces = []
    for name, geometry in units:
        overlap = polygonal(catchment.intersection(polygonal(geometry)))
        if overlap.is_empty or overlap.area == 0:
            continue
        pieces.append(overlap)
        matches.append(
            {"name": name, "areaFraction": min(1, area_km2(overlap) / total)}
        )
    covered = polygonal(unary_union(pieces)) if pieces else MultiPolygon([])
    return {
        "units": sorted(matches, key=lambda value: -value["areaFraction"]),
        "coverageFraction": min(1, area_km2(covered) / total)
        if not covered.is_empty
        else 0,
    }


def clipped_features(features, region, shape):
    result = []
    for feature in features:
        clipped = polygonal(polygonal(shape(feature["geometry"])).intersection(region))
        if not clipped.is_empty:
            display = transform(
                TO_WGS84,
                transform(TO_METERS, clipped).simplify(
                    DISPLAY_SIMPLIFICATION_M, preserve_topology=True
                ),
            )

            def rounded(value):
                if isinstance(value, (tuple, list)):
                    return [rounded(item) for item in value]
                return round(value, 6)

            geometry = mapping(display)
            geometry["coordinates"] = rounded(geometry["coordinates"])
            result.append({**feature, "geometry": geometry})
    return result
