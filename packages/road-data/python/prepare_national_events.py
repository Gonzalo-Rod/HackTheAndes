"""Normalize every Provías emergency row nationwide for display; no labels or model inputs."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from road_data.domain.historical_events import (
    excel_date,
    kilometer,
    normalized,
    rainfall_reported,
    road_event_category,
    road_status,
)
from road_data.integrations.provias import read_rows

# Generous mainland-and-sea bounds for Peru; points outside are kept without a position.
PERU_BOUNDS = (-81.5, -18.5, -68.5, 0.1)
REQUIRED_COLUMNS = (
    "CODIGO",
    "DEPARTAMENTO",
    "PROVINCIA",
    "DISTRITO",
    "RUTA",
    "PROGRESIVA INICIAL",
    "PROGRESIVA FINAL",
    "LATITUD",
    "LONGITUD",
    "ORIGEN EMERGENCIA",
    "PELIGRO EMERGENCIA",
    "TIPO EMERGENCIA",
    "INICIO",
    "TRANSITABILIDAD INICIAL",
    "DESARROLLO",
)


def position(longitude: str, latitude: str) -> list[float] | None:
    try:
        lng, lat = float(longitude), float(latitude)
    except ValueError:
        return None
    west, south, east, north = PERU_BOUNDS
    return [lng, lat] if west <= lng <= east and south <= lat <= north else None


def normalize_rows(rows: list[dict[str, str]], year: int) -> tuple[list[dict], dict]:
    header_index = next(
        i
        for i, row in enumerate(rows)
        if "RUTA" in row.values() and "INICIO" in row.values()
    )
    columns = {normalized(value): key for key, value in rows[header_index].items()}
    if any(name not in columns for name in REQUIRED_COLUMNS):
        raise ValueError("Provias export columns changed")
    events = []
    diagnostics = {"year": year, "rows": 0, "outsideWindow": 0, "withoutPosition": 0}
    for row in rows[header_index + 1 :]:

        def get(key: str) -> str:
            return row.get(columns[key], "").strip()

        if not get("CODIGO"):
            continue
        diagnostics["rows"] += 1
        identifier = get("CODIGO")
        if not identifier.isdigit():
            raise ValueError("Invalid Provias event identity")
        date = excel_date(get("INICIO"))
        if not f"{year}-01-01" <= date <= f"{year}-04-30":
            diagnostics["outsideWindow"] += 1
            continue
        point = position(get("LONGITUD"), get("LATITUD"))
        if point is None:
            diagnostics["withoutPosition"] += 1
        raw_type = " ".join(get("TIPO EMERGENCIA").split())
        events.append(
            {
                "id": f"provias:{identifier}",
                "sourceYear": year,
                "date": date,
                "roadCode": normalized(get("RUTA")),
                "department": get("DEPARTAMENTO").title(),
                "province": get("PROVINCIA").title(),
                "district": get("DISTRITO").title(),
                "kmStart": kilometer(get("PROGRESIVA INICIAL")),
                "kmEnd": kilometer(get("PROGRESIVA FINAL")),
                "position": point,
                "category": road_event_category(raw_type),
                "rawType": raw_type,
                "initialStatus": road_status(get("TRANSITABILIDAD INICIAL")),
                "rainfallReported": rainfall_reported(
                    get("ORIGEN EMERGENCIA"),
                    get("PELIGRO EMERGENCIA"),
                    get("DESARROLLO"),
                ),
            }
        )
    return events, diagnostics


def prepare(root: Path) -> dict:
    sources = json.loads(
        (root / "data/.cache/historical-event-sources.json").read_text()
    )
    events = []
    diagnostics = []
    for source in sources:
        path = root / f"data/.cache/provias-{source['year']}.xlsx"
        if hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
            raise ValueError("Historical workbook hash mismatch")
        year_events, year_diagnostics = normalize_rows(read_rows(path), source["year"])
        events.extend(year_events)
        diagnostics.append(year_diagnostics)
    if len({event["id"] for event in events}) != len(events):
        raise ValueError("Duplicate national event identity")
    return {
        "schemaVersion": 1,
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
        "events": sorted(events, key=lambda event: (event["date"], event["id"])),
        "diagnostics": diagnostics,
        "coverage": "incomplete",
        "limitations": [
            "Solo enero–abril de 2024 y 2025, según la exportación pública de Provías Nacional.",
            "La exportación omite eventos documentados por otras fuentes; la cobertura es incompleta.",
            "Fechas sin hora; la mención de lluvias es del texto de la fuente, no una causa verificada.",
        ],
    }


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    result = prepare(root)
    target = root / "data/.cache/national-events-candidate.json"
    target.write_text(json.dumps(result, separators=(",", ":"), allow_nan=False))
    print(
        json.dumps(
            {
                "state": "prepared",
                "events": len(result["events"]),
                "diagnostics": result["diagnostics"],
            }
        )
    )
