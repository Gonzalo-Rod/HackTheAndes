"""Normalize reviewed public road records; do not fit models or invent control days."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.ops import transform
from road_data.domain.historical_events import (
    normalized,
    excel_date,
    kilometer,
    occurrence_day,
    natural_hazard,
)
from road_data.integrations.provias import read_rows


def prepare(root: Path) -> dict:
    geometry = json.loads((root / "data/pe22/corridor.geojson").read_text())
    segments = json.loads((root / "data/pe22/segments-1km.geojson").read_text())[
        "features"
    ]
    project = Transformer.from_crs(4326, 32718, always_xy=True).transform
    road = transform(project, shape(geometry["geometry"]))
    projected_segments = [
        (f["id"], transform(project, shape(f["geometry"]))) for f in segments
    ]
    sources = json.loads(
        (root / "data/.cache/historical-event-sources.json").read_text()
    )
    candidates = []
    exclusions = []
    diagnostics = []
    for source in sources:
        year = source["year"]
        path = root / f"data/.cache/provias-{year}.xlsx"
        if hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
            raise ValueError("Historical workbook hash mismatch")
        rows = read_rows(path)
        header_index = next(
            i
            for i, row in enumerate(rows)
            if "RUTA" in row.values() and "INICIO" in row.values()
        )
        columns = {normalized(value): key for key, value in rows[header_index].items()}
        required = [
            "RUTA",
            "CODIGO",
            "INICIO",
            "LATITUD",
            "LONGITUD",
            "TIPO EMERGENCIA",
            "PELIGRO EMERGENCIA",
            "PROGRESIVA INICIAL",
            "PROGRESIVA FINAL",
            "TRANSITABILIDAD INICIAL",
        ]
        if any(name not in columns for name in required):
            raise ValueError("Provias export columns changed")
        selected = 0
        for row in rows[header_index + 1 :]:

            def get(key: str) -> str:
                return row.get(columns[key], "").strip()

            if normalized(get("RUTA")) != "PE-22":
                continue
            selected += 1
            identifier = get("CODIGO")
            if not identifier.isdigit():
                raise ValueError("Invalid Provias event identity")
            date = excel_date(get("INICIO"))
            if not f"{year}-01-01" <= date <= f"{year}-04-30":
                raise ValueError("Provias date filter did not match event occurrence")
            kind = natural_hazard(get("TIPO EMERGENCIA"), get("PELIGRO EMERGENCIA"))
            if kind is None:
                exclusions.append(
                    {
                        "sourceId": identifier,
                        "provider": "provias",
                        "date": date,
                        "reason": "not_a_selected_natural_hazard",
                        "rawType": get("TIPO EMERGENCIA"),
                        "rawHazard": get("PELIGRO EMERGENCIA"),
                    }
                )
                continue
            longitude, latitude = float(get("LONGITUD")), float(get("LATITUD"))
            if not -180 <= longitude <= 180 or not -90 <= latitude <= 90:
                raise ValueError("Invalid Provias coordinate")
            point = transform(project, Point(longitude, latitude))
            offset = road.distance(point)
            closest = min(projected_segments, key=lambda pair: pair[1].distance(point))[
                0
            ]
            start, end = occurrence_day(date)
            candidates.append(
                {
                    "id": f"provias:{identifier}",
                    "provider": "provias",
                    "sourceIds": [identifier],
                    "sourceUrls": [source["sourceUrl"]],
                    "date": date,
                    "occurrenceFromUtc": start,
                    "occurrenceUntilUtc": end,
                    "timePrecision": "day",
                    "timeCandidatesUtc": [],
                    "position": [longitude, latitude],
                    "sourceKmStart": kilometer(get("PROGRESIVA INICIAL")),
                    "sourceKmEnd": kilometer(get("PROGRESIVA FINAL")),
                    "hazardType": kind,
                    "rawType": get("TIPO EMERGENCIA"),
                    "rawHazard": get("PELIGRO EMERGENCIA"),
                    "trigger": "unverified",
                    "initialRoadStatus": get("TRANSITABILIDAD INICIAL"),
                    "spatialMatch": {
                        "state": "within_500m" if offset <= 500 else "outside_corridor",
                        "distanceM": offset,
                        "segmentId": closest if offset <= 500 else None,
                    },
                    "labelStatus": "candidate_review_required",
                    "notes": [
                        "Source time of day is unavailable; no event hour is invented.",
                        "Natural-hazard type alone does not verify rainfall causation.",
                    ],
                }
            )
        diagnostics.append({"year": year, "exactPe22Records": selected})
    for event in json.loads((root / "data/events/coen-reviewed.json").read_text())[
        "events"
    ]:
        candidates.append(event)
    if len({event["id"] for event in candidates}) != len(candidates):
        raise ValueError("Duplicate historical event identity")
    return {
        "schemaVersion": 1,
        "geometryRevision": geometry["properties"]["geometryRevision"],
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
        "events": sorted(candidates, key=lambda event: (event["date"], event["id"])),
        "exclusions": exclusions,
        "diagnostics": diagnostics,
        "negativeExamples": 0,
        "coverage": "incomplete",
        "trainingReady": False,
        "limitations": [
            "The export omits a COEN-documented 2025 road landslide; coverage is incomplete.",
            "No unreported day or normal initial status is labeled as a negative event.",
            "Date-only and conflicting-hour events need interval-aware validation.",
            "Location matching does not verify event type, road membership or causal catchment.",
            "The small holdout cannot establish forecast skill.",
        ],
    }


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    result = prepare(root)
    target = root / "data/.cache/historical-events-candidate.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, separators=(",", ":"), allow_nan=False))
    print(
        json.dumps(
            {
                "state": "prepared",
                "events": len(result["events"]),
                "exclusions": len(result["exclusions"]),
                "trainingReady": False,
            }
        )
    )
