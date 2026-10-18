# ML training readiness

We have chosen **regularized logistic regression to predict rainfall-related road
disruption**, using existing weather forecasts as inputs. The participant approved
label review and pipeline implementation. The pipeline is implemented, but the real
dataset is not yet sufficient for fitting; no real-data model has been trained or evaluated.

## Reviewed evidence

| Status | Current result |
|---|---|
| Documented positive events | Six: five Provías records with explicit rainfall/road-impact narratives, plus one deduplicated COEN event |
| Unresolved candidates | Two: rainfall causation or disruption onset remains unverified |
| Independent positive episodes | Four conservatively grouped episodes |
| Mapped positive events | Two, both in the same weather episode |
| Verified non-event monitoring windows | Zero |
| Historically available feature observations | Zero |

The original eight-candidate source capture is preserved. The separate
[label review](training-labels.md) records the evidence and corrects the initial
assumption that every Provías rainfall trigger was unresolved. A positive event
can still be unusable for fitting because location, timing or predictor availability
is unresolved. Unreported days remain unknown, not negative labels.

## Implemented pipeline

The [pipeline handoff](logistic-pipeline.md) describes executable preparation,
training and evaluation commands. It supports 6-, 24- and 72-hour targets, strict
historical feature provenance, chronological 2024 training/validation and frozen
2025 evaluation. It compares against a transparent rainfall threshold, exports a
portable experimental JSON model, and refuses to fit unsupported labels.

Tests fit synthetic fixtures to verify the implementation. They are separate from
the real dataset and establish no forecast accuracy. Current real-data commands
produce a blocked report and no model artifact. Risk APIs, warning levels and alert
delivery are not activated by running this offline pipeline.

## Evidence needed before fitting real data

1. Obtain reviewed monitoring periods that affirmatively establish no target event
   across the linked roads; feed silence and an initial `NORMAL` status are insufficient.
2. Improve catchment/road associations and event timing, especially for the 2025
   COEN case. Date-only records cannot become exact six-hour examples.
3. Establish historical availability for every predictor. Current capture time is
   not past issuance; ERA5 reconstruction cannot substitute for a historical forecast.
4. Add enough independent episodes for the fixed training, validation and holdout
   partitions. The present mapped positives cover only one 2024 episode.

The selected IFS archive is missing early 2024 hours. Catchments remain coarse,
only 38 of 174 segments have links, sampled slope is approximate and official
chainage is uncalibrated. Keep those uncertainties explicit. The next step is
improving the evidence, then rerunning the existing pipeline without weakening its
label/time checks. Hourly inference, risk storage, dispatch and alert evaluation
follow a defensible trained result.
