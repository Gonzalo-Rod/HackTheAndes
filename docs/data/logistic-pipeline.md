# Logistic-regression training pipeline

The pipeline predicts **rainfall-related road-disruption onset**, using existing
weather forecasts as inputs. It is implemented and tested, but currently refuses
to fit real data: we lack verified negative windows and historically available
feature records. A successful synthetic test proves code execution, not forecasting skill.

The [label review](training-labels.md) supports six positive events, only two of
which link to catchments; those two belong to one weather episode. The pipeline
keeps this limitation visible rather than manufacturing training rows.

## Layout and contracts

- `packages/road-data/src/contracts/training-labels.ts`: reviewed event and monitoring evidence.
- `src/contracts/logistic-training.ts` and `training-report.ts`: feature provenance, dataset, policy, artifact and report schemas.
- `src/domain/training/`: deterministic label assignment, nominal archive auditing, dataset assembly and portable scoring.
- `src/integrations/training/` and `src/services/prepare-training.ts`: validated file access and preparation.
- `python/road_data/training/`: offline split checks, fitting, baseline comparison and frozen evaluation.
- `data/training/`: reviewed inputs and fixed policy. Actual fitting runs and reports are ignored under `data/.cache/ml/`.

Paths after the first bullet are relative to `packages/road-data`. Python is
an offline operator dependency. Server consumers use the compiled `/training`
and `/training/contracts` exports; Vercel does not run or install scikit-learn.

## Inputs and historical availability

The first model has five fixed numeric features:
`forecastRainMm` over the selected horizon, forecast-based antecedent rain over
72/168 hours, estimated catchment slope, and catchment area. Rain values are mm,
slope is degrees and area is km². Geological classes and official warnings remain
separate context until their historical predictor eligibility is established.
An LLM does not select labels, compute model scores or invent feature values.

`as-of-features.json` accepts observations with a catchment, UTC-hour-aligned
decision time, horizon and source evidence for **every** feature. Each source
requires a byte hash, locator, explanation and evidenced `availableAt` no later
than the decision time. Retrospective ERA5 cannot be passed as a forecast or
operational antecedent predictor. The data builder derives labels from reviewed
events/monitoring; an observation cannot supply its own `label` field.

An `availableAt` value is an evidence claim requiring review, not a flag that
makes data historically valid. A forecast's retrieval today cannot establish its
2024 delivery time. Original delivery logs, archived publication metadata or other
documented historical availability are needed. No such evidence has been invented.
The empty observation registry therefore produces **zero eligible training rows**.

`ml:prepare` separately audits six nominal feature rows for the two mapped
positives and three horizons. It retains missing values as null and marks every
nominal row ineligible for fitting. Future-hour archive selection uses fixed-lead
offsets with one extra nominal day; prior rain uses the previous-day-one model
estimate. This conservative selection is an audit aid, **not proof of public
availability** or a coherent issued run. Current static-data availability is also
unverified for the historical decision dates. These rows never enter `ml:train`.

## Fixed training design

The participant approved regularized logistic regression. The initial policy is
checked in as `data/training/logistic-policy.json` before fitting:

| Partition | Decision/target coverage, UTC |
|---|---|
| Training | January 1, 2024 05:00 through April 1, 2024 05:00 |
| Validation | April 4, 2024 05:00 through May 1, 2024 05:00 |
| Held-out evaluation | January 1, 2025 05:00 through May 1, 2025 05:00 |

Every target window must fit wholly inside its partition. The three-day embargo
prevents 72-hour targets from bridging the training/validation boundary. Episodes
and positive source-event IDs cannot cross partitions. No random row split is used.
Each episode receives total weight one so repeated windows/nearby locations do
not pretend to be independent weather events.

The transformation is `log1p` followed by a `StandardScaler` fitted on training
rows only. L2 logistic regression uses fixed `C=0.1`, `lbfgs` and a 2,000-iteration
budget; these are initial engineering choices, not tuned physical constants.
Failure to converge is an error. Both training and validation require reviewed
examples of both classes; passing this mechanical check does not establish a
statistically adequate sample or trustworthy probabilities.

The binary evaluation threshold maximizes episode-weighted validation F1, choosing
the higher threshold on a tie. The transparent rainfall-only baseline selects
among training-rain quantiles 50/75/90/95% using that same validation criterion.
These are experimental comparison thresholds, not green/yellow/orange/red warning
cutoffs. They are frozen in the exported artifact before evaluation.

## Commands

Requires Node 24.3+, Python 3.14 and the existing C package setup:

```sh
npm --prefix packages/road-data ci
python3.14 -m venv packages/road-data/.venv
packages/road-data/.venv/bin/python -m pip install --only-binary=:all: -r packages/road-data/requirements-ml.lock.txt

npm --prefix packages/road-data run ml:labels:check -- --verify
npm --prefix packages/road-data run ml:prepare
npm --prefix packages/road-data run ml:train -- --horizon 24
```

The last command currently exits **2** with a validated blocked report and
`model: null`. Exit 0 means an experimental fit completed; exit 1 means invalid
inputs or an execution/dependency failure. A blocked result is expected with the
current evidence and is not a broken installation. Reports identify missing
positive/negative classes, missing verified feature rows and monitoring gaps.
Unique run directories prevent a failed attempt from appearing to produce an old model.

When the reviewed data genuinely supports fitting, run the same command for
`--horizon 6`, `24` and `72`. Each produces its own horizon-specific JSON artifact.
Keep the model file unchanged and evaluate it separately:

```sh
npm --prefix packages/road-data run ml:evaluate -- --horizon 24 --artifact /absolute/path/to/completed/run/model.json
```

Evaluation requires the exact dataset/policy hashes from training and both classes
in the holdout. Training never computes 2025 performance; evaluation never refits
the scaler/model or changes thresholds. Further model selection after viewing
holdout scores would invalidate that holdout and needs a new independent period.

## Outputs and limits

Artifacts contain only JSON coefficients, intercept, means/scales, feature order,
horizon, source revision, dataset/policy hashes, thresholds and library version.
There is no pickle execution. Zod validates inputs and Python outputs; generated
JSON Schemas and Python semantic checks enforce the offline boundary. Exported
scores are checked against the fitted pipeline and against TypeScript scoring.

Reports give episode-weighted precision, recall, F1, log loss, Brier score and
average precision, plus raw counts of flagged reviewed windows and independent
episodes. These describe **reviewed windows only**; sampled controls cannot
establish real-world prevalence or full-season false-alarm rates. Probabilities
remain uncalibrated and artifacts are explicitly experimental. No synthetic
performance number is published as a result on PE-22.

The portable scorer does not activate `/api/risk`, assign operational warning
levels or send alerts. The full product still needs validated model results,
warning-threshold decisions, inference/storage integration, hourly scheduling,
dispatch and alert evaluation. Current source-data APIs and the active SUTRAN
schedule remain independent of these offline commands.
