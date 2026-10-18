# Climate exposure, live conditions and driver alerts

**Participant-approved direction, October 17, 2026.** PeruRoad Climate supports
preparedness for rainfall-related hazards along the Rímac–PE-22 corridor. It
combines forecast rainfall with mapped terrain susceptibility and valid official
advisories, while retaining live road conditions and WhatsApp alerts for drivers.
**Tasks 1–2 are implemented:** deterministic assessment, immutable Supabase
persistence, a validated bundled fallback and `GET /api/exposure`. Driver-message
delivery, dashboard wiring, hourly scheduling and departure planning remain later
integration steps. No driver alert has been sent by this implementation.

## Users and decisions

Drivers and dispatchers need to know what is happening on their stretch and what
weather exposure lies ahead. Maintenance and emergency teams need to identify
areas requiring attention and inspection. The environmental focus is rainfall,
debris flows, slope failures, flooding and drainage conditions; other traffic
incidents remain available as current road context, separately identified.

The core question is: **where does forecast rainfall overlap with susceptible
terrain, and which linked road sections need attention?** Outputs are estimated
exposure and attention priorities. They do not establish the probability, precise
location or time of a future landslide, or certify that a route is safe.

## Inputs already prepared

| Input | Existing integration | Interpretation |
| --- | --- | --- |
| Forecast and recent model-estimated rainfall | Catchment weather captures and `/api/weather/catchments` | Next 24/72-hour totals and six-hour windows; retain model, grid, timestamps and missing hours. Recent modeled rain is not a gauge observation. |
| INGEMMET susceptibility | Validated source polygons, spatial summaries and `/api/hazards` | Official static classes retained with source attribution; map coverage and regional precision remain explicit. |
| Catchments and terrain | `/api/catchments`, geometry and slope captures | Coarse associations and sampled slopes, with low-confidence notices; 38 of 174 road segments currently have catchment links. |
| SENAMHI activation advisories | Official-product capture and `/api/hazards` | Keep official severity, affected area and validity separate from PeruRoad exposure. Current captures have `automatedRiskUse: false`. |
| Current road conditions | SUTRAN ingestion/history and incident APIs | Confirmed source-reported impacts and dated status changes. An absent alert does not establish clearance. |
| Environmental field reports | B text-report flow after location confirmation; media/verification pending | Rain, debris, rising water, drainage obstruction and slope failures; retain verification status and source. |

See [model inputs](model-inputs.md) for source provenance and reproduction.
Forecast availability is independent of whether our own disruption classifier can
be trained. Static susceptibility is a terrain input, not a live event feed.

## Assessment behavior

1. Read validated weather and susceptibility summaries for each captured catchment
   and its linked segments; preserve geometry revisions and association confidence.
2. Compute a transparent attention category from documented, versioned rules.
   Rainfall thresholds and their rationale must be recorded before use; they are
   attention criteria, not empirically calibrated landslide thresholds. Do not
   treat official susceptibility classes as rainfall triggers on their own.
3. Return 24/72-hour summaries and six-hour windows, each with reasons, rainfall
   amounts, susceptibility, source times, validity, spatial coverage and rule version.
   Official advisories and confirmed incidents remain identifiable context.
4. Keep coverage and freshness separate from the category. Unsupported catchment
   links, missing rainfall or missing required susceptibility produce an explicit
   unknown/unavailable assessment. Cached results carry their actual age and
   cannot silently become current results.
5. Store the inputs and assessment identity so a teammate can reproduce each
   result. Schedule refresh, persistence and alert evaluation only after local
   integration checks pass. The existing SUTRAN poll remains independent.

The implemented public contract is exported from
`@peruroad/road-data/exposure/contracts`. The existing `/api/risk` and dispatch
unavailable responses retain their original shapes until B/D integration; the
new exposure endpoint does not silently change their meaning.

### Versioned attention policy

`climate-exposure-v1` is an **experimental engineering policy**. Its numeric bins
are initial attention criteria, not SENAMHI thresholds, climatological percentiles
or fitted hazard thresholds. Official station thresholds vary geographically and
are not directly transferable to our coarse, area-averaged weather grids. See
[SENAMHI's threshold methodology](https://www.gob.pe/institucion/senamhi/informes-publicaciones/656506-estimacion-de-umbrales-de-precipitaciones-extremas-para-la-emision-de-avisos-meteorologicos).

| Criterion | Initial value and rationale |
| --- | --- |
| Forecast-rain bins, 6 h | 1 / 5 / 10 mm; simple positive-rain and increasing-volume attention bins for an inspectable initial policy |
| Forecast-rain bins, 24 h | 4 / 20 / 40 mm; same average-rate bins over the longer window |
| Forecast-rain bins, 72 h | 12 / 60 / 120 mm; same average-rate bins; summaries also retain any higher six-hour attention category |
| Required known susceptibility weight | At least 90%; remaining weight stays unknown and is never redistributed |
| High-susceptibility overlap | At least 20% of total sampled catchment weight in official classes 4/5; an explicit initial overlap gate |
| Wet antecedents | At least 30 mm in 72 h or 70 mm in 168 h; an initial wet-weather attention modifier, not measured soil moisture |
| Weather freshness | Less than 90 minutes from capture; allows an hourly refresh with a 30-minute margin. Capture freshness does not establish model issuance time. |

Rain bins produce an initial rank of 0–3. Without the high-susceptibility overlap,
attention is capped at `watch`. With that overlap and nonzero rain rank, raise the
rank by one; wet antecedents add one more, capped at three. Rank 0/1/2/3 maps to
`routine` / `watch` / `priority` / `high_attention`. Dry/below-threshold forecasts
are not escalated by static susceptibility or wet antecedents alone. `routine`
means no elevated signal under this rule set; it does not establish safety.
Upper ranks can saturate at the same final category; amounts and reasons remain
available for review. No warning level is a calibrated probability.

Missing forecast/antecedent hours or insufficient susceptibility produces an
unknown result. A segment uses the maximum attention across its linked catchments;
any unknown linked assessment makes the segment unknown. Its rainfall field is the
maximum linked catchment total, explicitly labeled, rather than rain at the road.

### Persistence and API

`public.climate_exposure_assessments` stores immutable complete batches. Each batch
retains the numerical inputs, weather capture, spatial associations, policy, source
hashes, result and timestamps. Hashes use normalized validated JSON, not compressed
file bytes. Identity depends on inputs and policy, so a retry preserves the first
stored result; older source captures cannot displace newer weather on reads.
Database reads and bundled reads validate schemas, hashes and exact replay from
stored inputs. Browser roles have no table access; the server exposes a sanitized
read without the internal input bundle.

`GET /api/exposure?horizonHours=24` (or `72`, default `24`) returns `{ data, meta }`.
Data contains catchment and segment assessments, all six-hour windows, reasons,
provenance and rule version. Metadata identifies `database` versus `snapshot`,
`ready`/`stale`/`unavailable`, actual age and the selected horizon. Unknown or repeated
query parameters return 400. If both database and bundle are unreadable, return a
safe 503 with the standard error shape.

At read time, stale/future sources and expired windows lose their public category
and become unknown; their original anchor is never moved. This is a projection of
the stored batch, whose identity remains the audit reference. A database outage
can use the validated, dated bundle with the same freshness checks. Both responses
keep `automatedAlertUse: false` pending the separate B integration. SENAMHI remains
attributed context via `/api/hazards`, with automated assessment use disabled.

### Reproduce and refresh manually

Use the existing package setup and server credentials from the database guide.
The new migration is additive; never modify an applied migration.

```sh
npm --prefix packages/road-data run db:migrate
npm --prefix packages/road-data run weather:capture -- operational
npm --prefix packages/road-data run model-inputs:check
npm --prefix packages/road-data run exposure:prepare
npm --prefix packages/road-data run db:import-weather
npm --prefix packages/road-data run db:import-exposure
npm --prefix packages/road-data run exposure:prepare -- --verify
```

The gzip bundle is `packages/road-data/data/exposure/latest.json.gz`. It contains
public source data only and is included in the package/deployment. CI verifies
that it reproduces from committed source inputs. Until the later hourly job is
connected, manually refresh/import as above; a successful initial import does not
keep forecasts fresh indefinitely.

## WhatsApp alerts stay in the core

Subscriptions use a driver-confirmed stretch or route. The planned categories are:

| Alert | Required basis | Message distinction |
| --- | --- | --- |
| Road-condition update | Current official or independently confirmed incident/status change | State the source-reported condition and observation time. |
| Climate-exposure advisory | Fresh, complete assessment that crosses a documented attention threshold and has a supported link to the subscribed stretch | Say **estimated climate exposure**, identify the forecast window and reasons, and link the corresponding map view. |
| Official advisory | An applicable, currently valid SENAMHI advisory with verified product identity and temporal eligibility | Attribute the advisory to SENAMHI and preserve its severity and validity. |
| Community report | Report pipeline evidence meeting B's confidence/notification policy | Preserve `no confirmado` until independently verified; never describe it as an official event. |

For a climate-exposure message, include the named stretch, forecast rainfall and
window, susceptibility, data age and uncertainty. Official kilometer references
must remain distinct from uncalibrated distances along the captured road geometry.
Use concise Spanish messages and a dashboard link. Do not imply live driver GPS;
trip position remains a schedule estimate unless a person explicitly shares a pin.

Keep explicit opt-in, opt-out, deduplication, bundling, quiet hours and approved
provider delivery mechanisms. B owns messaging and subscription policy; C supplies
validated assessments and changes. Normal exposure updates respect quiet hours;
any urgent exception requires an explicit reviewed policy and is not inferred from
an estimated exposure category. Stale/incomplete inputs suppress new automated
climate-exposure escalation and expose an unavailable state. The same assessment
cannot generate repeated alerts on every poll.

An incident being cleared does not clear a climate advisory. An exposure decrease
does not reopen a road. No advisory polygon intersecting a route does not establish
safety. Automated use of SENAMHI captures stays disabled until their temporal
eligibility and validity checks support it.

## Real-time conditions and the dashboard stay

Retain the SUTRAN ten-minute server poll and status archive. Retain incident change
notifications and the planned report-to-map flow; identify each source's update
cadence and last successful refresh. Weather/exposure refresh is planned hourly,
so the interface must not imply second-by-second weather observations.

Keep the 3D road map, susceptibility/advisory layers, rainfall windows, route
profiles, incident panels and history. Separate official conditions, estimated
exposure, unverified reports and retrospective reconstruction. A segment with no
usable assessment stays unknown. The departure planner can compare estimated
exposure at assumed arrival times while showing confirmed restrictions separately;
it cannot certify a safe departure or infer closure duration from alert expiry.

## Evaluation and next implementation order

Verify spatial associations, threshold boundaries, missing/stale inputs, time
windows, source attribution and idempotent alert changes. Use labeled test fixtures
for the message-to-map-to-subscriber flow, and record any actual consenting-user
test separately. Report data coverage, freshness and delivery results as measured;
they do not establish hazard-prediction accuracy. Yaku remains a reconstruction.

The logistic pipeline and reviewed event evidence remain available for later
research, with their existing blockers and frozen policy. No background periods
have been relabeled as verified negatives. Weather-focused ML would need its own
target, baseline and evaluation design; it is not a dependency for this pivot.

Completed: **assessment rules/contracts and offline tests → storage and read API**.
B's transport snapshot is now connected to source-grounded WhatsApp queries; see
[the integration guide](../integration/zavu-messaging.md). Automatic driver-alert delivery remains pending. The next checkpoint includes **dashboard wiring**, followed by hourly refresh,
alert evaluation and consenting-driver end-to-end verification. This continues the
participant's step-by-step workflow. Payments, Qatom and Yape remain outside scope.
