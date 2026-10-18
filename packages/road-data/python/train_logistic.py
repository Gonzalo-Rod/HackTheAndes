"""Offline CLI used by the validating Node operator; no network, database or pickle."""

import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
from road_data.training.data import read_document
from road_data.training.logistic import train, evaluate


def write_document(path: Path, value: dict) -> str:
    raw = (json.dumps(value, indent=2, allow_nan=False) + "\n").encode()
    descriptor, temporary = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(raw)
        Path(temporary).replace(path)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return hashlib.sha256(raw).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=["train", "evaluate"])
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--horizon", type=int, choices=[6, 24, 72], required=True)
    parser.add_argument("--created-at", required=True)
    parser.add_argument("--artifact", type=Path)
    args = parser.parse_args()
    schemas, _ = read_document(args.directory / "schemas.json")
    dataset, dataset_hash = read_document(
        args.directory / "dataset.json", schemas["dataset"]
    )
    policy, policy_hash = read_document(
        args.directory / "policy.json", schemas["policy"]
    )
    model = None
    if args.operation == "train":
        model, report = train(
            dataset, policy, args.horizon, dataset_hash, policy_hash, args.created_at
        )
    else:
        if args.artifact is None:
            raise ValueError("Evaluation requires a frozen model artifact")
        artifact, artifact_hash = read_document(args.artifact, schemas["artifact"])
        if args.directory.resolve() == args.artifact.parent.resolve():
            raise ValueError("Evaluation must not overwrite its training run directory")
        frozen_report, _ = read_document(
            args.artifact.parent / "report.json", schemas["report"]
        )
        if (
            frozen_report["operation"] != "train"
            or frozen_report["status"] != "trained_experimental"
            or frozen_report["artifactSha256"] != artifact_hash
        ):
            raise ValueError(
                "Artifact differs from the completed frozen training report"
            )
        if artifact["horizonHours"] != args.horizon:
            raise ValueError("Evaluation horizon differs from frozen model")
        report = evaluate(
            dataset,
            policy,
            artifact,
            dataset_hash,
            policy_hash,
            artifact_hash,
            args.created_at,
        )
    if model is not None:
        Draft202012Validator(
            schemas["artifact"], format_checker=FormatChecker()
        ).validate(model)
        report["artifactSha256"] = write_document(args.directory / "model.json", model)
    Draft202012Validator(schemas["report"], format_checker=FormatChecker()).validate(
        report
    )
    write_document(args.directory / "report.json", report)
    print(
        json.dumps(
            {
                "status": report["status"],
                "horizonHours": args.horizon,
                "blockers": report["blockers"],
            }
        )
    )
    return 2 if report["status"] == "blocked" else 0


if __name__ == "__main__":
    try:
        result = main()
    except Exception as error:
        # Provider content and paths are not echoed through arbitrary exception messages.
        print(json.dumps({"status": "failed", "errorType": type(error).__name__}))
        result = 1
    raise SystemExit(result)
