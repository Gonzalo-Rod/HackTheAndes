"""Prepare the documented coarse HydroBASINS fallback; never train a risk model."""

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from shapely import STRtree
from shapely.geometry import shape, mapping, box
from shapely.ops import unary_union
from shapely.prepared import prep
from road_data.domain.catchments import (
    area_km2,
    MAX_UPSTREAM_AREA_KM2,
    containing_basin_segments,
    SegmentIndex,
    point_intersections,
    sampling_points,
    upstream_ids,
    valid_polygon,
)
from road_data.integrations.hydrobasins import read_archive, read_geometry, read_json


def prepare(root: Path, corridor_path: Path, segments_path: Path) -> dict:
    corridor = read_json(corridor_path)
    segments_json = read_json(segments_path)
    river_snapshot = read_json(root / "data/.cache/ana-rivers.json")
    road = shape(corridor["geometry"])
    revision = corridor["properties"]["geometryRevision"]
    segments = [
        (feature["id"], shape(feature["geometry"]))
        for feature in segments_json["features"]
    ]
    segment_index = SegmentIndex(segments)
    # Clip display lines only after calculating crossings against the unsimplified source.
    clip = road.buffer(0.03)
    prepared_clip = prep(clip)
    reader, indexes, downstream = read_archive(
        root / "data/.cache/hybas_sa_lev12_v1c.zip"
    )
    crossings: list[dict] = []
    rivers: list[dict] = []
    # Clip display lines only after calculating crossings against the unsimplified source.
    for index, feature in enumerate(river_snapshot["data"]["features"]):
        river = shape(feature["geometry"])
        if not prepared_clip.intersects(river):
            continue
        rivers.append(
            {
                "type": "Feature",
                "properties": {"sourceIndex": index, "source": "ANA via SUTRAN"},
                "geometry": mapping(river.intersection(clip)),
            }
        )
        for point in point_intersections(road.intersection(river)):
            links = segment_index.crossing_ids(point)
            if links:
                crossings.append(
                    {"sourceIndex": index, "point": point, "segmentIds": links}
                )
    containing: dict[int, list[dict]] = {}
    corridor_basins: dict[int, object] = {}
    candidate_bounds = box(*road.bounds)
    prepared_road = prep(road)
    crossing_tree = STRtree([crossing["point"] for crossing in crossings])
    for identifier, index in indexes.items():
        bounds = reader.shape(index).bbox
        if not box(*bounds).intersects(candidate_bounds):
            continue
        geometry = valid_polygon(read_geometry(reader, index))
        if prepared_road.intersects(geometry):
            corridor_basins[identifier] = geometry
        selected = [
            crossings[position]
            for position in sorted(crossing_tree.query(geometry, predicate="covers"))
        ]
        if selected:
            containing[identifier] = selected
    crossing_segments = {
        segment for item in crossings for segment in item["segmentIds"]
    }
    # Segments without a mapped river crossing still drain through the basin they lie in.
    local = containing_basin_segments(
        [(i, line) for i, line in segments if i not in crossing_segments],
        corridor_basins,
    )
    geometry_cache: dict[int, object] = dict(corridor_basins)
    large_river_outlets: list[int] = []
    features = []
    outlets = sorted(set(containing) | set(local))
    for outlet_id in outlets:
        local_crossings = containing.get(outlet_id, [])
        local_segments = local.get(outlet_id, [])
        ancestors = upstream_ids([outlet_id], downstream)
        for identifier in ancestors:
            if identifier not in geometry_cache:
                geometry_cache[identifier] = valid_polygon(
                    read_geometry(reader, indexes[identifier])
                )
        geometry = valid_polygon(
            unary_union([geometry_cache[identifier] for identifier in ancestors])
        )
        if area_km2(geometry) > MAX_UPSTREAM_AREA_KM2:
            ancestors = [outlet_id]
            geometry = geometry_cache[outlet_id]
            large_river_outlets.append(outlet_id)
        points = sampling_points(geometry)
        pour_point = (
            local_crossings[0]["point"]
            if local_crossings
            else next(line for i, line in segments if i == local_segments[0]).interpolate(
                0.5, normalized=True
            )
        )
        features.append(
            {
                "type": "Feature",
                "id": f"hydrobasins-v1c-sa12-{outlet_id}",
                "geometry": mapping(geometry),
                "properties": {
                    "hydrobasinId": outlet_id,
                    "upstreamIds": ancestors,
                    "areaKm2": area_km2(geometry),
                    "meanSlopeDegrees": None,
                    "method": "hydrobasins",
                    "association": (
                        "river_crossing" if local_crossings else "containing_basin"
                    ),
                    "lowConfidence": True,
                    "samplePoints": points,
                    "pourPoint": list(pour_point.coords[0]),
                    "crossings": [
                        {
                            "point": list(item["point"].coords[0]),
                            "segmentIds": item["segmentIds"],
                            "riverSourceIndex": item["sourceIndex"],
                        }
                        for item in local_crossings
                    ],
                    "segmentIds": sorted(
                        {
                            segment
                            for item in local_crossings
                            for segment in item["segmentIds"]
                        }
                        | set(local_segments)
                    ),
                },
            }
        )
    reader.close()
    if not features:
        raise ValueError("No defensible road/catchment associations found")
    return {
        "schemaVersion": 1,
        "geometryRevision": revision,
        "preparedAt": datetime.now(timezone.utc).isoformat(),
        "type": "FeatureCollection",
        "features": features,
        "provenance": {
            "sourceUrl": "https://data.hydrosheds.org/file/HydroBASINS/standard/hybas_sa_lev12_v1c.zip",
            "licenseUrl": "https://data.hydrosheds.org/file/technical-documentation/HydroSHEDS_TechDoc_v1_4.pdf",
            "attribution": "HydroBASINS (Lehner and Grill, 2013), derived from HydroSHEDS v1 data, copyright WWF (2006-2022), used under license. Source license and prescribed attribution apply.",
            "archiveSha256": "50afa9deb75d9fd5d61b5f43fa92586f0bdfe5242018a1f2fbe5a1837871d37c",
            "hydrographySourceUrl": river_snapshot["sourceUrl"],
            "hydrographyRetrievedAt": river_snapshot["retrievedAt"],
            "hydrographySha256": hashlib.sha256(
                json.dumps(
                    river_snapshot["data"], sort_keys=True, separators=(",", ":")
                ).encode()
            ).hexdigest(),
            "samplingGridDegrees": 0.1,
            "limitations": [
                "Coarse upstream topology plus the entire crossing sub-basin, including its downstream portion; not a watershed delineated to the road crossing.",
                "Small tributaries and road drainage works are unresolved.",
                "Mean slope and susceptibility are not inferred from elevation samples.",
                "Mapped river intersections are candidate crossings, not field-verified structures.",
                "Segments without a mapped crossing use the level-12 basin containing their midpoint and its upstream basins; the pour point is a road point, not an outlet.",
            ]
            + (
                [
                    f"Where the upstream union exceeds {MAX_UPSTREAM_AREA_KM2} km2 (a major river), only the local level-12 basin is used; upstream river flooding is not represented."
                ]
                if large_river_outlets
                else []
            ),
        },
        "diagnostics": {
            "crossingCount": len(crossings),
            "containingBasinCount": sum(
                1
                for feature in features
                if feature["properties"]["association"] == "containing_basin"
            ),
            "coarseBasinCount": len(features),
            **(
                {"localOnlyLargeRiverCount": len(large_river_outlets)}
                if large_river_outlets
                else {}
            ),
            "linkedSegments": len(
                {
                    segment
                    for feature in features
                    for segment in feature["properties"]["segmentIds"]
                }
            ),
        },
        "rivers": {"type": "FeatureCollection", "features": rivers},
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    root = Path(__file__).resolve().parents[1]
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--corridor", type=Path, default=root / "data/pe22/corridor.geojson"
    )
    parser.add_argument(
        "--segments", type=Path, default=root / "data/pe22/segments-1km.geojson"
    )
    arguments = parser.parse_args()
    result = prepare(root, arguments.corridor, arguments.segments)
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = arguments.output.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(result, separators=(",", ":"), allow_nan=False), encoding="utf8"
    )
    temporary.replace(arguments.output)
    print(json.dumps({"state": "prepared", **result["diagnostics"]}))


if __name__ == "__main__":
    main()
