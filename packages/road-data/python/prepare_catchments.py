"""Prepare the documented coarse HydroBASINS fallback; never train a risk model."""

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from shapely.geometry import shape, mapping, box
from shapely.ops import unary_union
from road_data.domain.catchments import (
    area_km2,
    crossing_segment_ids,
    point_intersections,
    sampling_points,
    upstream_ids,
    valid_polygon,
)
from road_data.integrations.hydrobasins import read_archive, read_geometry, read_json


def prepare(root: Path) -> dict:
    corridor = read_json(root / "data/pe22/corridor.geojson")
    segments_json = read_json(root / "data/pe22/segments-1km.geojson")
    river_snapshot = read_json(root / "data/.cache/ana-rivers.json")
    road = shape(corridor["geometry"])
    revision = corridor["properties"]["geometryRevision"]
    segments = [
        (feature["id"], shape(feature["geometry"]))
        for feature in segments_json["features"]
    ]
    reader, indexes, downstream = read_archive(
        root / "data/.cache/hybas_sa_lev12_v1c.zip"
    )
    crossings: list[dict] = []
    rivers: list[dict] = []
    # Clip display lines only after calculating crossings against the unsimplified source.
    clip = road.buffer(0.03)
    for index, feature in enumerate(river_snapshot["data"]["features"]):
        river = shape(feature["geometry"])
        if not river.intersects(clip):
            continue
        rivers.append(
            {
                "type": "Feature",
                "properties": {"sourceIndex": index, "source": "ANA via SUTRAN"},
                "geometry": mapping(river.intersection(clip)),
            }
        )
        for point in point_intersections(road.intersection(river)):
            links = crossing_segment_ids(point, segments)
            if links:
                crossings.append(
                    {"sourceIndex": index, "point": point, "segmentIds": links}
                )
    containing: dict[int, list[dict]] = {}
    candidate_bounds = box(*road.bounds)
    for identifier, index in indexes.items():
        bounds = reader.shape(index).bbox
        if not box(*bounds).intersects(candidate_bounds):
            continue
        geometry = valid_polygon(read_geometry(reader, index))
        selected = [
            crossing for crossing in crossings if geometry.covers(crossing["point"])
        ]
        if selected:
            containing[identifier] = selected
    geometry_cache: dict[int, object] = {}
    features = []
    for outlet_id, local_crossings in sorted(containing.items()):
        ancestors = upstream_ids([outlet_id], downstream)
        for identifier in ancestors:
            if identifier not in geometry_cache:
                geometry_cache[identifier] = valid_polygon(
                    read_geometry(reader, indexes[identifier])
                )
        geometry = valid_polygon(
            unary_union([geometry_cache[identifier] for identifier in ancestors])
        )
        points = sampling_points(geometry)
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
                    "lowConfidence": True,
                    "samplePoints": points,
                    "pourPoint": list(local_crossings[0]["point"].coords[0]),
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
            ],
        },
        "diagnostics": {
            "crossingCount": len(crossings),
            "coarseBasinCount": len(features),
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
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    result = prepare(root)
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = arguments.output.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(result, separators=(",", ":"), allow_nan=False), encoding="utf8"
    )
    temporary.replace(arguments.output)
    print(json.dumps({"state": "prepared", **result["diagnostics"]}))


if __name__ == "__main__":
    main()
