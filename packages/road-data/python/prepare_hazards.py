"""Prepare bounded display layers and explicit sample/road exposure, without a risk score."""

import argparse
import json
import gzip
from pathlib import Path
from shapely import STRtree
from shapely.geometry import shape
from shapely.ops import unary_union, transform
from pyproj import Transformer
from road_data.domain.hazards import (
    polygonal,
    weighted_susceptibility,
    unit_overlap,
    clipped_features,
)


def utm_epsg(road) -> int:
    """Southern-hemisphere UTM zone of the road centroid; Peru spans zones 17 to 19."""
    zone = int((road.centroid.x + 180) // 6) + 1
    return 32700 + zone


def prepare(
    source_path: Path,
    catchments_path: Path,
    corridor_path: Path,
    segments_path: Path,
    hydrography_path: Path,
) -> dict:
    source = json.loads(gzip.decompress(source_path.read_bytes()))
    catchments = json.loads(catchments_path.read_text())
    road = shape(json.loads(corridor_path.read_text())["geometry"])
    segments = json.loads(segments_path.read_text())["features"]
    hydrography = json.loads(gzip.decompress(hydrography_path.read_bytes()))
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
    epsg = utm_epsg(road)
    project_to_meters = Transformer.from_crs(4326, epsg, always_xy=True).transform
    project_to_wgs84 = Transformer.from_crs(epsg, 4326, always_xy=True).transform
    display_region = transform(
        project_to_wgs84, transform(project_to_meters, road).buffer(2000)
    )
    source["susceptibility"]["features"] = clipped_features(
        source["susceptibility"]["features"], display_region, shape
    )
    source["warnings"]["features"] = clipped_features(
        source["warnings"]["features"], region, shape
    )
    projected_geometries = [
        transform(project_to_meters, geometry) for geometry in geometries
    ]
    # Long roads query thousands of polygons per segment without a spatial index.
    tree = STRtree(projected_geometries)
    segment_exposure = []
    for segment in segments:
        line = transform(project_to_meters, shape(segment["geometry"]))
        affected = [
            (classes[index], projected_geometries[index].intersection(line))
            for index in sorted(tree.query(line, predicate="intersects"))
            if classes[index] > 0
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


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    pilot = root / "data/pe22"
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source", type=Path, default=root / "data/spatial/hazards-source.json.gz"
    )
    parser.add_argument("--catchments", type=Path, default=pilot / "catchments.json")
    parser.add_argument("--corridor", type=Path, default=pilot / "corridor.geojson")
    parser.add_argument("--segments", type=Path, default=pilot / "segments-1km.geojson")
    parser.add_argument(
        "--output", type=Path, default=root / "data/.cache/hazards-candidate.json"
    )
    arguments = parser.parse_args()
    result = prepare(
        arguments.source,
        arguments.catchments,
        arguments.corridor,
        arguments.segments,
        root / "data/spatial/hydrographic-units.json.gz",
    )
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(
        json.dumps(result, separators=(",", ":"), allow_nan=False)
    )
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


if __name__ == "__main__":
    main()
