"""Validate offline inputs and purge uncertain/cross-boundary samples before fitting."""

import hashlib
import json
import math
from datetime import datetime, timedelta
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

FEATURES = (
    "forecastRainMm",
    "antecedentRainMm72h",
    "antecedentRainMm168h",
    "meanSlopeDegrees",
    "catchmentAreaKm2",
)
HORIZONS = (6, 24, 72)
HOUR_SECONDS = 3600


def instant(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Timestamps require an explicit UTC offset")
    return parsed


def read_document(path: Path, schema: dict | None = None) -> tuple[dict, str]:
    raw = path.read_bytes()
    if len(raw) > 32 * 1024 * 1024:
        raise ValueError("Training input exceeds the bounded file limit")

    def reject_constant(value):
        raise ValueError("Non-finite JSON constant")

    value = json.loads(raw, parse_constant=reject_constant)
    if schema is not None:
        Draft202012Validator(schema, format_checker=FormatChecker()).validate(value)
    return value, hashlib.sha256(raw).hexdigest()


def validate_rows(dataset: dict) -> None:
    keys, ids = set(), set()
    for row in dataset["rows"]:
        start, end = instant(row["decisionAt"]), instant(row["validUntil"])
        if row["horizonHours"] not in HORIZONS or end - start != timedelta(
            hours=row["horizonHours"]
        ):
            raise ValueError("Row horizon/target window mismatch")
        if start.timestamp() % HOUR_SECONDS:
            raise ValueError("Decisions require UTC hour alignment")
        if row["label"] not in (0, 1) or isinstance(row["label"], bool):
            raise ValueError("Unknown labels cannot enter supervised training")
        key = row["catchmentId"], start, row["horizonHours"]
        if key in keys or row["id"] in ids:
            raise ValueError("Duplicate training sample")
        keys.add(key)
        ids.add(row["id"])
        if set(row["features"]) != set(FEATURES) or any(
            isinstance(v, bool)
            or not isinstance(v, (int, float))
            or not math.isfinite(v)
            or v < 0
            for v in row["features"].values()
        ):
            raise ValueError("Missing, non-finite or invalid feature value")
        names = [name for source in row["sources"] for name in source["featureNames"]]
        if sorted(names) != sorted(FEATURES):
            raise ValueError("Incomplete feature availability evidence")
        kinds = {
            "forecastRainMm": "archived_forecast",
            "antecedentRainMm72h": "forecast_based_antecedent",
            "antecedentRainMm168h": "forecast_based_antecedent",
            "meanSlopeDegrees": "dem",
            "catchmentAreaKm2": "static_geometry",
        }
        for source in row["sources"]:
            if instant(source["availableAt"]) > start:
                raise ValueError("Future information cannot enter the feature matrix")
            if any(kinds[name] != source["kind"] for name in source["featureNames"]):
                raise ValueError("Retrospective or incompatible feature provenance")


def split_rows(dataset: dict, policy: dict, horizon: int) -> tuple[dict, int]:
    validate_rows(dataset)
    if horizon not in HORIZONS:
        raise ValueError("Unsupported prediction horizon")
    periods = [policy[name] for name in ("train", "validation", "test")]
    for period in periods:
        if instant(period["fromUtc"]) >= instant(period["untilUtc"]):
            raise ValueError("Invalid chronological split")
    for previous, following in zip(periods, periods[1:]):
        if instant(previous["untilUtc"]) + timedelta(hours=72) > instant(
            following["fromUtc"]
        ):
            raise ValueError("A 72-hour split embargo is required")
    splits = {name: [] for name in ("train", "validation", "test")}
    purged = 0
    for row in dataset["rows"]:
        if row["horizonHours"] != horizon:
            continue
        for name, selected in splits.items():
            period = policy[name]
            if instant(row["decisionAt"]) >= instant(period["fromUtc"]) and instant(
                row["validUntil"]
            ) <= instant(period["untilUtc"]):
                selected.append(row)
                break
        else:
            purged += 1
    seen_groups, seen_events = set(), set()
    for rows in splits.values():
        groups = {row["episodeId"] for row in rows}
        events = {
            e for row in rows if row["label"] == 1 for e in row["labelEvidenceIds"]
        }
        if groups & seen_groups or events & seen_events:
            raise ValueError("An episode/event crosses chronological partitions")
        seen_groups.update(groups)
        seen_events.update(events)
    return splits, purged


def counts(rows: list[dict]) -> dict:
    positives = sum(row["label"] == 1 for row in rows)
    return {
        "rows": len(rows),
        "positiveRows": positives,
        "negativeRows": len(rows) - positives,
        "episodes": len({row["episodeId"] for row in rows}),
        "positiveEpisodes": len(
            {row["episodeId"] for row in rows if row["label"] == 1}
        ),
        "negativeEpisodes": len(
            {row["episodeId"] for row in rows if row["label"] == 0}
        ),
    }


def episode_weights(rows: list[dict]) -> list[float]:
    sizes = {}
    for row in rows:
        sizes[row["episodeId"]] = sizes.get(row["episodeId"], 0) + 1
    return [1 / sizes[row["episodeId"]] for row in rows]
