# ML training readiness

**Current delivery direction:** the participant approved [climate exposure and
preparedness](climate-exposure.md), retaining live road conditions and WhatsApp
alerts for drivers. The deterministic assessment, persistence and read API are
implemented; B/D integration and alert changes are next. Training a disruption classifier is no longer a dependency
for delivery; the existing pipeline and evidence remain deferred research.

The earlier ML target was **rainfall-related road disruption**, using existing
weather forecasts as inputs. Regularized logistic regression and label review were
approved, and the pipeline is implemented, but the dataset remains insufficient
for fitting; no real-data model has been trained or evaluated.

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
chainage is uncalibrated. Keep those uncertainties explicit. Further research
requires improving the evidence before rerunning the pipeline without weakening
its label/time checks. Operational work now follows the separate climate-exposure
assessment plan, including storage, read APIs, hourly refresh and driver alerts.

## Training attempt and additional source checks — October 17, 2026

The real-data training commands were run for all three horizons at 19:31–19:32
Lima. Each returned exit code **2**, `status: "blocked"` and `model: null`.
The prepared dataset contains **zero eligible rows**, so there are no fitted
coefficients, training metrics or holdout results. The latest 24-hour run wrote
its local report under
`data/.cache/ml/runs/2026-10-18T00-31-26.131Z-d06f1b06-efe0-4c22-a005-e61c70ee3442/`.
These generated reports are intentionally ignored; rerun the commands to reproduce
the readiness result from the committed registries.

```sh
npm --prefix packages/road-data run ml:train -- --horizon 6
npm --prefix packages/road-data run ml:train -- --horizon 24
npm --prefix packages/road-data run ml:train -- --horizon 72
```

Additional public-source checks did not establish any eligible negative windows:

| Source inspected | Finding and label decision |
| --- | --- |
| [Deviandes public alerts](https://www.deviandes.com/AlertasDeviandes.html) | The page embeds Facebook and Twitter feeds; it does not provide a dated, complete monitoring export. Feed silence cannot establish a negative. |
| [Deviandes procedures](https://www.deviandes.com/procedimientos.html) | Links include the `F-32-001` shift-report form and emergency-attention procedure. The index does not supply completed historical shift records. |
| [Legacy SUTRAN viewer](https://gis.sutran.gob.pe/alerta_sutran/) | The old URL now redirects to the current alert map. Historical controls in the search index do not establish that the old archive remains available. |
| [SUTRAN October 11, 2024 announcement](https://www.gob.pe/institucion/sutran/noticias/1037899-elperunosedetiene-sutran-registro-100-de-transitabilidad-en-la-red-vial-nacional) | Despite the “100% transitability” headline, the text records restrictions at PE-22 km 10 and 76 before reopening. It neither resolves the target cause nor supplies full-window absence of disruption; it is also outside the fixed January–April split. |
| [Ositrán 2024 IIRSA Centro report](https://www.ositran.gob.pe/anterior/wp-content/uploads/2025/07/id-2024-iirsa-centro-tramo-2.pdf) | Page 17, table 6 aggregates emergency calls by type and whether traffic was interrupted. Annual totals have no event dates, locations or continuous non-event intervals and cannot supply catchment-window labels. |

[Open-Meteo's fixed-lead documentation](https://open-meteo.com/en/docs/previous-runs-api)
supports the archive's intended lead-time semantics, but does not give a per-value
public-delivery timestamp. The current nominal feature audit therefore still
requires a documented historical-availability policy before those reconstructed
inputs become eligible; a numerical value alone does not satisfy that check.

The participant reported no access to private historical monitoring records.
Fitting the agreed target still requires reviewed monitoring
intervals, more independent mapped positive episodes in the fixed partitions, and
defensible historical predictor availability. A model trained against sampled,
unverified background periods would require a separate label/target design and
could not be presented as this verified-label classifier.
