# ML training checkpoint

Input engineering for Role C tasks 1–3 is implemented. No model has been selected,
trained or evaluated. Follow the [Team Plan](../team-plan.md): agree on the target,
labels, features, algorithm and temporal evaluation before starting training.

## What is ready

The [input manifest](../../packages/road-data/data/model-inputs-manifest.json)
identifies eight weather captures, terrain and official spatial context, and
eight dated PE-22 incident candidates. Scripts, validated contracts, Supabase
persistence and read APIs are described in the [input handoff](model-inputs.md).
January–April 2024 and 2025 fixed-lead rainfall archives and retrospective ERA5
references allow a rainfall-forecast study. February–March 2023 ERA5 supports a
Yaku reconstruction; it cannot demonstrate that an alert was predictable.

## What prevents a credible road-event probability model today

- Only six candidate events are available in 2024 and two in 2025. The candidates
  still require label review. Two 2024 records occur on the same day and must not
  be treated as independent weather episodes in a random split.
- The Provías export misses an independently documented COEN event. Unreported
  days/segments are unknown, not verified negative examples. A conventional binary
  classifier trained on invented negatives would have misleading accuracy.
- Provías times are date-only. The additional COEN event has conflicting times
  and still needs geocoding. No event hour or catchment assignment is invented.
- The January 30, 2024 event lacks the selected archived forecast coverage. Later
  offsets also have different archive start dates; use explicit missingness masks.
- Previous Runs stores fixed offsets for each valid hour. Combining them into a
  24/72-hour forecast at one historical decision time requires an explicit as-of
  design and proof of information availability. Capture time is not issuance.
- ERA5 retrospective rain and present-day susceptibility are not automatically
  legitimate pre-event predictors. Geological publication history is unverified.
- Catchments are coarse, only 38 of 174 segments have links, slope is sampled and
  official chainage is uncalibrated. The forecast grid cannot resolve individual
  small quebradas. These gaps remain visible in any eventual output.

The current registry deliberately records `negativeExamples: 0`,
`coverage: "incomplete"` and `trainingReady: false`. Those flags are evidence
controls, not a claim that an algorithm cannot technically fit these rows.

## Decisions for the next checkpoint

The original product target is road-disruption risk. Retain that direction by
agreeing on a precise target (for example, rainfall-related disruption within
24 hours), reviewing candidate labels and obtaining trustworthy coverage for
event and non-event periods. Freeze the 2025 holdout before feature selection or
tuning. Keep correlated catchments, neighboring segments and same-day records
together when defining validation groups. With the present counts, treat any
experiment as exploratory and report the uncertainty; do not claim calibrated
probabilities or reliable held-out skill.

An alternative to discuss explicitly is ML calibration of **rainfall forecasts**
against retrospective reference rainfall, followed by a transparent road-hazard
baseline. The captured weather seasons support investigating that target, but
rainfall skill would not establish road-disruption skill. This changes what the
ML component predicts and must be agreed with the participant before implementation.
No such substitution has been made.

For either choice, write the decision-time/valid-time contract first, restrict
predictors to information demonstrably available then, compare against an
unchanged transparent baseline and evaluate separately at 6, 24 and 72 hours.
Choose the smallest defensible algorithm only after that data contract; no
library, model family, threshold or performance number is selected here.

After the checkpoint: implement the agreed feature matrix and training pipeline,
save the model and provenance, perform the fixed temporal evaluation, then wire
hourly inference and B's alert evaluation. Risk, dispatch and alert outputs remain
unavailable until those components are implemented and verified.
