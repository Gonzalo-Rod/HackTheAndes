"""Fit an experimental model; chronological 2025 evaluation is a separate operation."""

import warnings
import numpy as np
import sklearn
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.exceptions import ConvergenceWarning
from road_data.training.data import FEATURES, split_rows, counts, episode_weights
from road_data.training.metrics import metrics, choose_threshold


def matrix(rows: list[dict]):
    return np.array(
        [[row["features"][name] for name in FEATURES] for row in rows], dtype=float
    )


def report_base(dataset_hash, policy_hash, horizon, now, splits, purged, operation):
    return {
        "schemaVersion": 1,
        "operation": operation,
        "status": "blocked",
        "createdAt": now,
        "horizonHours": horizon,
        "datasetSha256": dataset_hash,
        "policySha256": policy_hash,
        "artifactSha256": None,
        "blockers": [],
        "splits": {
            **{name: counts(rows) for name, rows in splits.items()},
            "purgedRows": purged,
        },
        "metrics": {"train": None, "validation": None, "test": None},
        "baseline": {"rainThresholdMm": None, "validation": None, "test": None},
        "interpretation": "reviewed_windows_only_not_full_season_alarm_rates",
        "probabilitiesCalibrated": False,
    }


def require_classes(splits, names):
    return [
        f"{name}_requires_reviewed_positive_and_negative_examples"
        for name in names
        if {row["label"] for row in splits[name]} != {0, 1}
    ]


def train(
    dataset: dict,
    policy: dict,
    horizon: int,
    dataset_hash: str,
    policy_hash: str,
    now: str,
):
    splits, purged = split_rows(dataset, policy, horizon)
    report = report_base(
        dataset_hash, policy_hash, horizon, now, splits, purged, "train"
    )
    report["blockers"] = require_classes(splits, ("train", "validation"))
    if report["blockers"]:
        return None, report
    training, validation = splits["train"], splits["validation"]
    pipeline = Pipeline(
        [
            ("log", FunctionTransformer(np.log1p)),
            ("scale", StandardScaler()),
            (
                "classifier",
                LogisticRegression(
                    C=policy["regularizationC"],
                    l1_ratio=0.0,
                    solver="lbfgs",
                    max_iter=policy["maximumIterations"],
                ),
            ),
        ]
    )
    weights = episode_weights(training)
    with warnings.catch_warnings():
        warnings.simplefilter("error", ConvergenceWarning)
        pipeline.fit(
            matrix(training),
            [row["label"] for row in training],
            scale__sample_weight=weights,
            classifier__sample_weight=weights,
        )
    validation_scores = pipeline.predict_proba(matrix(validation))[:, 1]
    # Candidate decision thresholds are data-derived, not operational warning levels.
    threshold = choose_threshold(
        validation, validation_scores, np.unique(np.r_[0.0, validation_scores, 1.0])
    )
    rain_thresholds = np.unique(
        np.quantile(
            [r["features"]["forecastRainMm"] for r in training],
            policy["baselineQuantiles"],
        )
    )
    validation_rain = np.array([r["features"]["forecastRainMm"] for r in validation])
    rain_threshold = choose_threshold(validation, validation_rain, rain_thresholds)
    scale, classifier = (
        pipeline.named_steps["scale"],
        pipeline.named_steps["classifier"],
    )
    artifact = {
        "schemaVersion": 1,
        "algorithm": "l2_logistic_regression",
        "target": dataset["target"],
        "status": "experimental",
        "probabilitiesCalibrated": False,
        "createdAt": now,
        "geometryRevision": dataset["geometryRevision"],
        "datasetSha256": dataset_hash,
        "policySha256": policy_hash,
        "horizonHours": horizon,
        "featureNames": list(FEATURES),
        "transform": "log1p_then_standard_scaler",
        "means": scale.mean_.tolist(),
        "scales": scale.scale_.tolist(),
        "coefficients": classifier.coef_[0].tolist(),
        "intercept": float(classifier.intercept_[0]),
        "binaryThreshold": threshold,
        "baselineRainThresholdMm": rain_threshold,
        "regularizationC": policy["regularizationC"],
        "trainingLibrary": f"scikit-learn {sklearn.__version__}",
    }
    if not np.allclose(
        predict(artifact, validation), validation_scores, atol=1e-12, rtol=1e-10
    ):
        raise ValueError("Portable model export does not reproduce the fitted pipeline")
    report["status"] = "trained_experimental"
    report["metrics"]["train"] = metrics(
        training,
        pipeline.predict_proba(matrix(training))[:, 1],
        threshold,
        probabilistic=True,
    )
    report["metrics"]["validation"] = metrics(
        validation, validation_scores, threshold, probabilistic=True
    )
    report["baseline"].update(
        {
            "rainThresholdMm": rain_threshold,
            "validation": metrics(
                validation, validation_rain, rain_threshold, probabilistic=False
            ),
        }
    )
    return artifact, report


def predict(artifact: dict, rows: list[dict]):
    values = np.log1p(matrix(rows))
    logits = (
        (values - np.array(artifact["means"])) / np.array(artifact["scales"])
    ) @ np.array(artifact["coefficients"]) + artifact["intercept"]
    return np.exp(-np.logaddexp(0, -logits))


def evaluate(
    dataset: dict,
    policy: dict,
    artifact: dict,
    dataset_hash: str,
    policy_hash: str,
    artifact_hash: str,
    now: str,
):
    if (
        artifact["datasetSha256"] != dataset_hash
        or artifact["policySha256"] != policy_hash
        or artifact["geometryRevision"] != dataset["geometryRevision"]
    ):
        raise ValueError(
            "Frozen artifact does not match the pinned evaluation dataset/policy"
        )
    splits, purged = split_rows(dataset, policy, artifact["horizonHours"])
    report = report_base(
        dataset_hash,
        policy_hash,
        artifact["horizonHours"],
        now,
        splits,
        purged,
        "evaluate",
    )
    report["artifactSha256"] = artifact_hash
    report["blockers"] = require_classes(splits, ("test",))
    if report["blockers"]:
        return report
    rows = splits["test"]
    report["status"] = "evaluated_experimental"
    report["metrics"]["test"] = metrics(
        rows, predict(artifact, rows), artifact["binaryThreshold"], probabilistic=True
    )
    report["baseline"].update(
        {
            "rainThresholdMm": artifact["baselineRainThresholdMm"],
            "test": metrics(
                rows,
                np.array([r["features"]["forecastRainMm"] for r in rows]),
                artifact["baselineRainThresholdMm"],
                probabilistic=False,
            ),
        }
    )
    return report
