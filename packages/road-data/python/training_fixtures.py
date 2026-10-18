"""Synthetic fixtures exclusively for offline tests; never training evidence."""

from datetime import datetime, timezone, timedelta
from road_data.training.data import FEATURES

POLICY = {
    "schemaVersion": 1,
    "id": "logistic-v1-2024-2025",
    "train": {"fromUtc": "2024-01-01T05:00:00Z", "untilUtc": "2024-04-01T05:00:00Z"},
    "validation": {
        "fromUtc": "2024-04-04T05:00:00Z",
        "untilUtc": "2024-05-01T05:00:00Z",
    },
    "test": {"fromUtc": "2025-01-01T05:00:00Z", "untilUtc": "2025-05-01T05:00:00Z"},
    "embargoHours": 72,
    "regularizationC": 0.1,
    "maximumIterations": 2000,
    "baselineQuantiles": [0.5, 0.75, 0.9, 0.95],
}
NOW = "2026-10-18T00:00:00Z"


def row(day, label, horizon=24):
    date = datetime.fromisoformat(day).replace(hour=5, tzinfo=timezone.utc)
    kinds = [
        "archived_forecast",
        "forecast_based_antecedent",
        "forecast_based_antecedent",
        "dem",
        "static_geometry",
    ]
    return {
        "id": f"synthetic-{day}",
        "catchmentId": "synthetic-catchment",
        "decisionAt": date.isoformat(),
        "validUntil": (date + timedelta(hours=horizon)).isoformat(),
        "horizonHours": horizon,
        "label": label,
        "episodeId": f"synthetic-episode-{day}",
        "labelEvidenceIds": [f"synthetic-evidence-{day}"],
        "features": dict(
            zip(
                FEATURES,
                [50 if label else 1, 30 if label else 2, 80 if label else 5, 20, 100],
            )
        ),
        "sources": [
            {
                "featureNames": [name],
                "kind": kind,
                "availableAt": "2023-01-01T00:00:00Z",
                "evidence": {
                    "sourceUrl": "https://example.test/synthetic-only",
                    "sourceSha256": "d" * 64,
                    "locator": "Synthetic test fixture",
                    "finding": "Never evidence of real forecast skill",
                },
            }
            for name, kind in zip(FEATURES, kinds)
        ],
    }


def dataset(horizon=24):
    rows = [
        row(f"{prefix}-{day:02}", day % 2, horizon)
        for prefix, start in [("2024-02", 1), ("2024-04", 4), ("2025-02", 1)]
        for day in range(start, start + 12)
    ]
    return {
        "schemaVersion": 1,
        "target": "rainfall_related_road_disruption_onset",
        "dataKind": "reviewed_public_sources",
        "geometryRevision": "a" * 64,
        "sourceHashes": {"synthetic_test_fixture_only": "b" * 64},
        "rows": rows,
    }
