"""Metrics apply only to reviewed windows, never an inferred complete rainy season."""

import numpy as np
from sklearn.metrics import (
    precision_recall_fscore_support,
    log_loss,
    brier_score_loss,
    average_precision_score,
)
from road_data.training.data import episode_weights


def metrics(rows: list[dict], scores, threshold: float, *, probabilistic: bool) -> dict:
    labels = np.array([row["label"] for row in rows])
    predictions = np.asarray(scores) >= threshold
    weights = episode_weights(rows)
    precision, recall, f1, _ = precision_recall_fscore_support(
        labels, predictions, average="binary", sample_weight=weights, zero_division=0
    )
    return {
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
        "truePositiveWindows": int(np.sum(predictions & (labels == 1))),
        "falsePositiveWindows": int(np.sum(predictions & (labels == 0))),
        "logLoss": float(log_loss(labels, scores, sample_weight=weights, labels=[0, 1]))
        if probabilistic
        else None,
        "brierScore": float(brier_score_loss(labels, scores, sample_weight=weights))
        if probabilistic
        else None,
        "averagePrecision": float(
            average_precision_score(labels, scores, sample_weight=weights)
        )
        if probabilistic
        else None,
    }


def choose_threshold(rows: list[dict], scores, candidates) -> float:
    # Higher threshold wins an F1 tie; selection uses validation windows only.
    return float(
        max(
            candidates,
            key=lambda threshold: (
                metrics(rows, scores, float(threshold), probabilistic=False)["f1"],
                float(threshold),
            ),
        )
    )
