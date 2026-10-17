"""Prepare bounded display layers and explicit sample/road exposure, without a risk score."""

import json
import gzip
from pathlib import Path
from shapely.geometry import shape
from shapely.ops import unary_union, transform
from pyproj import Transformer
from road_data.domain.hazards import (
    polygonal,
    weighted_susceptibility,
    unit_overlap,
    clipped_features,
)


def prepare(root: Path) -> dict:
    source = json.loads(
        gzip.decompress((root / "data/spatial/hazards-source.json.gz").read_bytes())
    )
    catchments = json.loads((root / "data/pe22/catchments.json").read_text())
    road = shape(
        json.loads((root / "data/pe22/corridor.geojson").read_text())["geometry"]
    )
    segments = json.loads((root / "data/pe22/segments-1km.geojson").read_text())[
        "features"
    ]
    hydrography = json.loads(
        gzip.decompress((root / "data/spatial/hydrographic-units.json.gz").read_bytes())
    )
    geometries = [
        shape(feature["geometry"]) for feature in source["susceptibility"]["features"]
    ]
    invalid_source_polygons = sum(not geometry.is_valid for geometry in geometries)
    geometries = [polygonal(geometry) for geometry in geometries]
    classes = [
        feature["properties"]["class"]
        for feature in source["susceptibility"]["features"]
    ]
    region = unary_union(
        [shape(feature["geometry"]) for feature in catchments["features"]]
        + [road.buffer(0.01)]
    )
    project_to_meters = Transformer.from_crs(4326, 32718, always_xy=True).transform
    project_to_wgs84 = Transformer.from_crs(32718, 4326, always_xy=True).transform
    display_region = transform(
        project_to_wgs84, transform(project_to_meters, road).buffer(2000)
    )
    source["susceptibility"]["features"] = clipped_features(
        source["susceptibility"]["features"], display_region, shape
    )
    source["warnings"]["features"] = clipped_features(
        source["warnings"]["features"], region, shape
    )
    projected = Transformer.from_crs(4326, 32718, always_xy=True).transform
    projected_geometries = [transform(projected, geometry) for geometry in geometries]
    segment_exposure = []
    for segment in segments:
        line = transform(projected, shape(segment["geometry"]))
        affected = [
            (level, polygon.intersection(line))
            for level, polygon in zip(classes, projected_geometries)
            if level > 0 and polygon.intersects(line)
        ]
        coverage = (
            unary_union([geometry for _, geometry in affected]).length / line.length
            if affected
            else 0
        )
        segment_exposure.append(
            {
                "segmentId": segment["id"],
                "susceptibilityClasses": sorted({level for level, _ in affected}),
                "coverageFraction": min(1, coverage),
            }
        )
    units = [
        (feature["properties"]["nombre"], shape(feature["geometry"]))
        for feature in hydrography["data"]["features"]
    ]
    source["geometryDiagnostics"] = {
        "invalidSourcePolygons": invalid_source_polygons,
        "geometryPrecisionDecimals": 6,
        "displaySimplificationToleranceM": 25,
        "displayCorridorBufferM": 2000,
        "sourceSusceptibilityPolygonCount": len(geometries),
    }
    source["segmentExposure"] = segment_exposure
    source["catchmentExposure"] = [
        {
            "catchmentId": feature["id"],
            **weighted_susceptibility(
                feature["properties"]["samplePoints"], geometries, classes
            ),
        }
        for feature in catchments["features"]
    ]
    source["hydrographicCrossCheck"] = {
        "sourceUrl": hydrography["sourceUrl"],
        "capturedAt": hydrography["capturedAt"],
        "originalPublisherVerified": False,
        "catchments": [
            {
                "catchmentId": feature["id"],
                **unit_overlap(shape(feature["geometry"]), units),
            }
            for feature in catchments["features"]
        ],
    }
    source["limitations"].extend(
        [
            "Catchment susceptibility proportions are sampled area weights, not a complete polygon-area overlay.",
            "Hydrographic-unit overlap checks broad drainage consistency; it does not delineate a watershed to the road crossing.",
            "Official kilometer calibration remains unverified; source chainage is not silently converted to geometry distance.",
        ]
    )
    return source


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    result = prepare(root)
    target = root / "data/.cache/hazards-candidate.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, separators=(",", ":"), allow_nan=False))
    print(
        json.dumps(
            {
                "state": "prepared",
                "susceptibilityPolygons": len(result["susceptibility"]["features"]),
                "warningsIntersectingRegion": len(result["warnings"]["features"]),
                "segments": len(result["segmentExposure"]),
            }
        )
    )
