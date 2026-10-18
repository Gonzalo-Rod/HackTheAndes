import copy
import json
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
from road_data.training.data import split_rows
from road_data.training.logistic import train, evaluate, predict
from training_fixtures import dataset, row, POLICY, NOW

ROOT = Path(__file__).resolve().parents[1]


class LogisticTrainingTests(unittest.TestCase):
    def test_refuses_empty_or_positive_only_datasets_without_calling_fit(self):
        for rows in [[], [r for r in dataset()["rows"] if r["label"] == 1]]:
            with patch("road_data.training.logistic.Pipeline.fit") as fitting:
                model, report = train(
                    {**dataset(), "rows": rows}, POLICY, 24, "a" * 64, "b" * 64, NOW
                )
                self.assertIsNone(model)
                self.assertEqual(report["status"], "blocked")
                fitting.assert_not_called()

    def test_all_horizons_have_the_same_fitting_contract(self):
        for horizon in (6, 24, 72):
            model, report = train(
                dataset(horizon), POLICY, horizon, "a" * 64, "b" * 64, NOW
            )
            self.assertEqual(model["horizonHours"], horizon)
            self.assertEqual(report["status"], "trained_experimental")
            self.assertIsNone(report["metrics"]["test"])
            self.assertFalse(model["probabilitiesCalibrated"])

    def test_scaling_and_coefficients_never_use_validation_or_holdout_features(self):
        original = dataset()
        reference, _ = train(original, POLICY, 24, "a" * 64, "b" * 64, NOW)
        changed = copy.deepcopy(original)
        for record in changed["rows"]:
            if record["decisionAt"] >= "2024-04-01":
                record["features"]["forecastRainMm"] = 10000
        alternative, _ = train(changed, POLICY, 24, "a" * 64, "b" * 64, NOW)
        self.assertEqual(reference["means"], alternative["means"])
        self.assertEqual(reference["coefficients"], alternative["coefficients"])
        expected = np.mean(
            np.log1p(
                [
                    [r["features"][name] for name in reference["featureNames"]]
                    for r in original["rows"][:12]
                ]
            ),
            axis=0,
        )
        np.testing.assert_allclose(reference["means"], expected)

    def test_purges_target_windows_crossing_split_boundaries_and_checks_episode_leakage(
        self,
    ):
        inputs = dataset(72)
        inputs["rows"].append(row("2024-03-31", 1, 72))
        _, purged = split_rows(inputs, POLICY, 72)
        self.assertEqual(purged, 1)
        inputs["rows"][12]["episodeId"] = inputs["rows"][0]["episodeId"]
        with self.assertRaisesRegex(ValueError, "crosses"):
            split_rows(inputs, POLICY, 72)

    def test_rejects_future_information_missing_values_duplicates_and_bad_intervals(
        self,
    ):
        for kind in ("future", "null", "duplicate", "interval", "reanalysis"):
            inputs = dataset()
            if kind == "future":
                inputs["rows"][0]["sources"][0]["availableAt"] = NOW
            if kind == "null":
                inputs["rows"][0]["features"]["forecastRainMm"] = None
            if kind == "duplicate":
                inputs["rows"].append(copy.deepcopy(inputs["rows"][0]))
            if kind == "interval":
                inputs["rows"][0]["validUntil"] = inputs["rows"][0]["decisionAt"]
            if kind == "reanalysis":
                inputs["rows"][0]["sources"][0]["kind"] = "reanalysis"
            with self.assertRaises(ValueError):
                split_rows(inputs, POLICY, 24)

    def test_evaluation_uses_frozen_artifact_and_never_changes_its_thresholds(self):
        inputs = dataset()
        artifact, _ = train(inputs, POLICY, 24, "a" * 64, "b" * 64, NOW)
        frozen = copy.deepcopy(artifact)
        report = evaluate(inputs, POLICY, artifact, "a" * 64, "b" * 64, "c" * 64, NOW)
        self.assertEqual(report["status"], "evaluated_experimental")
        self.assertIsNone(report["metrics"]["validation"])
        self.assertEqual(artifact, frozen)
        with self.assertRaisesRegex(ValueError, "Frozen artifact"):
            evaluate(inputs, POLICY, artifact, "d" * 64, "b" * 64, "c" * 64, NOW)

    def test_typescript_scores_match_exported_python_model(self):
        inputs = dataset()
        artifact, _ = train(inputs, POLICY, 24, "a" * 64, "b" * 64, NOW)
        records = inputs["rows"][-4:]
        script = """import {scoreLogistic} from './src/domain/training/score.ts';
const chunks=[];for await(const part of process.stdin)chunks.push(part);
const p=JSON.parse(Buffer.concat(chunks).toString('utf8'));
console.log(JSON.stringify(p.features.map(f=>scoreLogistic(p.model,f,24).score)));"""
        result = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            input=json.dumps(
                {"model": artifact, "features": [r["features"] for r in records]}
            ),
            text=True,
            capture_output=True,
            check=True,
            cwd=ROOT,
        )
        np.testing.assert_allclose(
            json.loads(result.stdout), predict(artifact, records), atol=1e-12
        )


if __name__ == "__main__":
    unittest.main()
