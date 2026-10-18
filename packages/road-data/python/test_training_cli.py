import json
import subprocess
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from training_fixtures import dataset, POLICY, NOW

ROOT = Path(__file__).resolve().parents[1]


class TrainingBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        script = """import {z} from 'zod';
import {trainingDatasetSchema,trainingPolicySchema,logisticArtifactSchema} from './src/contracts/logistic-training.ts';
import {trainingReportSchema} from './src/contracts/training-report.ts';
console.log(JSON.stringify({dataset:z.toJSONSchema(trainingDatasetSchema),policy:z.toJSONSchema(trainingPolicySchema),artifact:z.toJSONSchema(logisticArtifactSchema),report:z.toJSONSchema(trainingReportSchema)}));"""
        result = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        cls.schemas = json.loads(result.stdout)

    def invoke(self, directory, operation="train", extra=None):
        import sys

        return subprocess.run(
            [
                sys.executable,
                str(ROOT / "python/train_logistic.py"),
                operation,
                "--directory",
                str(directory),
                "--horizon",
                "24",
                "--created-at",
                NOW,
                *(extra or []),
            ],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def prepare(self, root, inputs):
        path = Path(root)
        for name, value in [
            ("dataset", inputs),
            ("policy", POLICY),
            ("schemas", self.schemas),
        ]:
            (path / f"{name}.json").write_text(json.dumps(value, allow_nan=False))
        return path

    def test_empty_real_shape_produces_report_exit_two_and_no_model(self):
        with TemporaryDirectory() as root:
            path = self.prepare(root, {**dataset(), "rows": []})
            result = self.invoke(path)
            self.assertEqual(result.returncode, 2, result.stdout)
            self.assertEqual(
                json.loads((path / "report.json").read_text())["status"], "blocked"
            )
            self.assertFalse((path / "model.json").exists())

    def test_synthetic_boundary_fits_exports_and_evaluates_frozen_json(self):
        with TemporaryDirectory() as root:
            path = self.prepare(root, dataset())
            result = self.invoke(path)
            self.assertEqual(result.returncode, 0, result.stdout)
            model = (path / "model.json").read_bytes()
            evaluation = path / "evaluation"
            evaluation.mkdir()
            self.prepare(evaluation, dataset())
            result = self.invoke(
                evaluation, "evaluate", ["--artifact", str(path / "model.json")]
            )
            self.assertEqual(result.returncode, 0, result.stdout)
            self.assertEqual((path / "model.json").read_bytes(), model)
            self.assertEqual(
                json.loads((evaluation / "report.json").read_text())["status"],
                "evaluated_experimental",
            )
            changed = json.loads(model)
            changed["intercept"] += 0.1
            (path / "model.json").write_text(json.dumps(changed))
            result = self.invoke(
                evaluation, "evaluate", ["--artifact", str(path / "model.json")]
            )
            self.assertEqual(result.returncode, 1)

    def test_rejects_invalid_json_boundary_without_writing_a_model(self):
        with TemporaryDirectory() as root:
            path = self.prepare(root, dataset())
            (path / "dataset.json").write_text('{"rows": [NaN]}')
            result = self.invoke(path)
            self.assertEqual(result.returncode, 1)
            self.assertFalse((path / "model.json").exists())
            self.assertNotIn("NaN", result.stdout)


if __name__ == "__main__":
    unittest.main()
