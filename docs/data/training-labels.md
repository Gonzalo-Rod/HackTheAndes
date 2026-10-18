# Road-disruption training labels

**Deferred research:** the [approved climate-exposure direction](climate-exposure.md)
uses a separate operational assessment. These reviewed labels remain unchanged;
unknown/background periods have not become verified negatives.

The target is **the onset of a rainfall-related road disruption affecting a road
segment linked to a catchment**, within a 6-, 24- or 72-hour forecast window.
It covers documented restrictions or interruptions caused by debris flows,
landslides, rockfall/slope failure or flooding. It does not predict an exact
landslide location, all traffic incidents, or the duration of an existing closure.

The participant approved label review and a regularized logistic-regression
pipeline. No real-data model has been fitted. The [pipeline handoff](logistic-pipeline.md)
explains the executable commands and the remaining data requirements.

## Label definitions

| Value | Required evidence |
|---|---|
| `1` | A reviewed source explicitly supports rainfall causation and road impact; the event is associated with a linked road segment, and its entire possible onset interval falls inside the target window. |
| `0` | Reviewed continuous monitoring affirmatively establishes no target event on **all linked road segments** for the entire target window; no overlapping candidate contradicts it. |
| Unknown | Incomplete monitoring, uncertain causation/impact, unresolved location, or an onset interval only partly overlapping the window. Excluded from fitting. |

An unreported day, a dry forecast, no SENAMHI warning, or an initial `NORMAL`
road status never supplies a negative label. Traffic-crash records are excluded
from this target; they are not non-event controls. Retrospective source narratives
can establish labels, but never become predictors.

All windows are half-open `[decisionAt, decisionAt + horizon)`. Provider date-only
records retain the complete Lima calendar day, 05:00 UTC to 05:00 UTC the following
day. A documented minute retains a one-minute interval. Conflicting minute-level
times retain the earliest candidate through the end of the latest candidate minute.
No source hour is invented or silently selected. An uncertain event overlapping a
negative window blocks that negative; a positive event wholly contained in a window
establishes the positive even if additional uncertain events overlap.

## Review outcome

This review adds evidence from the Provías `DESARROLLO` narratives, which the
initial discovery had not normalized. The original candidate capture remains
unchanged; decisions and source hashes live in the separate
[review registry](../../packages/road-data/data/training/label-review.json).
This corrects the earlier assumption that all seven Provías rainfall triggers
were unresolved: five narratives explicitly document rainfall causation.

| Event | Date | Decision | Evidence / remaining issue |
|---|---|---|---|
| Provías 19631 | 2024-01-30 | Unknown | Debris removal and restricted traffic are documented; rainfall causation is not. No catchment link; selected archived weather is missing. |
| Provías 19753 | 2024-02-21 | Positive event | Narrative explicitly links falling material to rainfall/slope instability; initial traffic is interrupted. One approximate catchment link; date-only onset. |
| Provías 19754 | 2024-02-22 | Positive event | Same explicit trigger/impact evidence. One approximate catchment link; date-only onset and source point approximately 272 m from the road axis. |
| Provías 19830 | 2024-03-02 | Positive event | Narrative explicitly attributes total road impact to rainfall-related slope failure. No catchment link; date-only onset. |
| Provías 19833 | 2024-03-02 | Positive event | Explicit rainfall-related slope failure and total road impact. No catchment link; date-only onset. |
| Provías 19985 | 2024-03-24 | Positive event | Narrative describes rainfall-related complete road impact and partial reopening. Initial `NORMAL` conflicts with that narrative and is preserved as a source inconsistency. No catchment link. |
| Provías 20934 | 2025-02-05 | Unknown | Narrative discusses pavement repairs, heavy traffic and unspecified natural effects; a rainfall-triggered disruption onset is not established. |
| COEN SINPAD 224418 | 2025-02-22 | Positive event | Explicit rainfall-triggered landslide and restricted PE-22 traffic at Surco km 68+800. Occurrence hours conflict and chainage remains ungeocoded. Two reports describe one event. |

The six positive events represent **four conservatively grouped episodes**. The
February 21–22 records share one episode; the two March 2 records share another.
Only two positive events link to catchments, and those share **one episode**.
This is not six independent catchment-level training examples. The two traffic
crashes remain excluded. There are **zero verified non-event monitoring windows**.
The [generated audit](../../packages/road-data/data/training/label-audit.json)
records these counts, spatial associations and interval-supported horizons.

Road association follows the existing 500 m projection rule and coarse catchment
links. It identifies a disruption on linked roads, not a verified causal watershed.
Unlinked segments are unknown. Date-only events cannot establish six-hour positives;
24/72-hour positives require a decision window containing the entire source interval.

## Sources and reproducibility

Provías evidence is from the two public exports in the
[historical source audit](historical-events.md), located by `CODIGO`, `DESARROLLO`,
`INICIO` and `TRANSITABILIDAD INICIAL`. Each review pins the inspected workbook
SHA-256 and paraphrases the finding without staff names or raw national records.
The [initial COEN report](https://portal.indeci.gob.pe/wp-content/uploads/2025/02/REPORTE-COMPLEMENTARIO-N.%C2%BA-2411-22-FEB2025-DESLIZAMIENTO-EN-EL-DISTRITO-DE-SURCO-LIMA-1-1.pdf)
supports rainfall causation on page 1 and restricted PE-22 traffic on page 2;
the [updated report](https://portal.indeci.gob.pe/wp-content/uploads/2025/02/REPORTE-COMPLEMENTARIO-N.%C2%BA-5032-19ABR2025-DESLIZAMIENTO-EN-EL-DISTRITO-DE-SURCO-LIMA-2.pdf)
preserves the same event identity but supplies a different occurrence hour.
These are source reviews by the agent, not field verification or a teammate's PR approval.

```sh
npm --prefix packages/road-data run ml:labels:check
npm --prefix packages/road-data run ml:labels:check -- --verify
```

The command validates the full candidate registry, checks source identities and
hashes, requires one review per candidate and regenerates/verifies the audit.
It does not independently read public websites or prove a textual claim. If
`events:prepare` replaces the candidate capture, the review hash must be checked
and repinned after review; CI deliberately rejects a stale binding. Re-downloading
an XLSX can change its bytes even when the event facts are unchanged.

Add genuine non-event evidence to
`packages/road-data/data/training/monitoring-coverage.json`. Each window requires
a source, locator, affirmative completeness statement, catchment scope and episode
ID. A warning/incident feed's silence is insufficient. Overlapping monitoring
episodes are rejected as ambiguous until reconciled. None has been invented here.
