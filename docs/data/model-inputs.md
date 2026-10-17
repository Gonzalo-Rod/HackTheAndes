# Weather, terrain and official hazard inputs

Member C's input pipelines are independent modules in `packages/road-data`.
They capture, validate, prepare and persist source data; they do not train a
model or turn official warning classes into PeruRoad risk levels. The
[ML checkpoint](ml-readiness.md) records the remaining scientific decisions.

## Captured data and provenance

The machine-readable [manifest](../../packages/road-data/data/model-inputs-manifest.json)
pins the road revision, artifact SHA-256 hashes, coverage and readiness. All
captures retain their actual retrieval/assembly time. A retrieval time is not a
forecast initialization, public issue time or geological survey date.

| Input | Current artifact and coverage | Interpretation |
|---|---|---|
| Operational precipitation | `data/weather/live.json.gz`: 11 catchments, 12 distinct returned grid cells; 168 past hours plus current hour and 72 future hours | ECMWF IFS 0.25-degree grid, approximately 25 km; past rainfall is also a model estimate |
| Archived precipitation forecasts | January–April 2024 and 2025, `precipitation_previous_day1` through `previous_day4` | Fixed offsets per valid hour, not a coherent run available at one decision time |
| Antecedent archive buffers | December 24–31 before each evaluation year | The December 2023 forecast buffer is all null; it is retained as evidence of missing coverage |
| Retrospective reference rainfall | ERA5, December 24–April 30 for the two seasons | Evaluation targets/reconstruction only; historical operational availability is not established |
| Yaku reconstruction | ERA5, February–March 2023 | Reconstruction, never evidence of advance warning |
| Catchment terrain | `data/pe22/catchment-terrain.json`: 11 sampled slope estimates | Area-weighted gradients at the existing coarse query points; not a full-resolution catchment DEM average |
| INGEMMET susceptibility | 270 queried source polygons; 235 in the road display layer | Static mass-movement susceptibility; source publication date and pre-2024 availability remain unverified |
| SENAMHI activation warnings | 10 national polygons in this capture, none intersecting the analysis region | Empty local intersection does not mean absence of danger |
| Hydrographic cross-check | 14 reference units obtained through SENAMHI; almost complete broad-basin overlap for all 11 catchments | Confirms broad geographical consistency, not precise upstream delineation or original ANA publication |
| Historical incidents | Eight candidates, six in 2024 and two in 2025 | Incomplete and awaiting label review; zero verified negative examples |

The operational summary exposes area-weighted past 72/168-hour totals, next
24/72-hour totals and twelve six-hour windows. Hourly rainfall uses the preceding
hour convention: a total over `(start, end]` includes the hour ending at `end`.
Any null/missing hour in a contributing cell makes the aggregate unavailable;
weights are never redistributed onto the available cells. Windows remain anchored
to the capture hour when serving a cache.

Actual archive coverage matters more than the requested dates. IFS day-one
coverage in this capture starts on February 3, 2024 at 22:00 UTC; later offsets
start later. January 2024 remains missing. The 2025 January–April capture is
complete for all four offsets. See the manifest for per-variable counts.

## Spatial preparation and limits

The existing [HydroBASINS fallback](pe22-catchments.md) remains low-confidence:
11 upstream unions, 68 mapped crossings and only 38 of 174 segments linked.
The crossing sub-basin includes territory downstream of the road. Unlinked
segments are unknown, never safe. The independent hydrographic overlay does not
remove these limitations. Official chainage remains uncalibrated; measured road
distance is not an official kilometer marker.

Slope estimation uses Copernicus GLO-90 elevations at four positions, 90 m west,
east, south and north of each unique query point. Central differences estimate
the local gradient; the original area weights produce means of approximately
15.29–22.49 degrees. There are 93 unique query points and 372 elevation queries.
The approximation and source are stored with the catchment database enrichment;
the original catchment artifact retains its explicitly unknown slope field.

INGEMMET queries cover the actual road axis and catchment query points. They do
not assert complete polygon coverage elsewhere. Class 0 remains unclassified;
classes 1–5 retain the verified provider legend. A point on multiple polygon
boundaries receives the highest known class; uncovered sample weight stays
unknown. Segment exposure uses original geometry, not the display simplification.
Preparation repairs 95 invalid source polygons. Only the display layer is clipped
to a 2 km road buffer and simplified by 25 m in UTM 18S, then rounded to six
decimal places; its approximately 827 KiB payload fits the deployment response
limit. Raw validated geometries remain in the compressed source artifact and
PostGIS, with repairs applied for spatial operations.

The correct SENAMHI product is `g_acti_quebrada:view_av_activ_qdra`, verified
against the [official activation map](https://www.senamhi.gob.pe/mapas/mapa-quebradas/).
Identity uses provider date plus `gid`, rather than transient GeoServer feature
IDs. The [official bulletin](https://www.senamhi.gob.pe/?p=aviso-activacion-quebrada)
supplies a start time and duration. Its local clock is explicitly interpreted
as `America/Lima`; a missing or mismatched bulletin leaves validity unknown.
Exact issue time remains null and `automatedRiskUse` remains false. The map hides
expired, future and unknown-validity warnings. Official colors/levels are not
PeruRoad forecast categories.

## Reproduction

Requires Node 24.3+, the package dependencies and Python 3.14. No source API
credentials are needed. Database commands need the existing scoped connection
in ignored `packages/road-data/.env.local`; apply migrations before imports.

```sh
npm --prefix packages/road-data ci
python3.14 -m venv packages/road-data/.venv
packages/road-data/.venv/bin/python -m pip install --only-binary=:all: -r packages/road-data/requirements-data.lock.txt

# Offline: validate all committed inputs and regenerate the display overlay.
npm --prefix packages/road-data run hazards:prepare
npm --prefix packages/road-data run model-inputs:check -- --verify

# Import committed, validated inputs without downloading providers again.
npm --prefix packages/road-data run db:import-pe22
npm --prefix packages/road-data run db:import-catchments
npm --prefix packages/road-data run db:import-weather
npm --prefix packages/road-data run db:import-model-inputs

# Refresh current sources, then prepare and import the replacement captures.
npm --prefix packages/road-data run weather:capture -- operational
npm --prefix packages/road-data run terrain:capture
npm --prefix packages/road-data run hydrography:capture
npm --prefix packages/road-data run hazards:capture
npm --prefix packages/road-data run hazards:prepare
npm --prefix packages/road-data run db:import-weather
npm --prefix packages/road-data run db:import-model-inputs

# Re-download and normalize official historical incident candidates.
npm --prefix packages/road-data run events:capture
npm --prefix packages/road-data run events:prepare
npm --prefix packages/road-data run db:import-model-inputs

# Example historical weather refresh; repeat with the other documented ranges.
npm --prefix packages/road-data run weather:capture -- previous_runs 2024-01-01 2024-04-30
npm --prefix packages/road-data run weather:capture -- reanalysis 2023-02-01 2023-03-31
npm --prefix packages/road-data run model-inputs:check
```

Historical weather refresh reuses the validated operational grid plan, reducing
repeated coordinate requests. Provider grid locations are retained and deduplicated
again; they are not assumed to be the requested coordinates. Native file readers
validate compressed contents before use. Raw national incident XLSX workbooks
remain in ignored operator cache; only the sanitized PE-22 candidates and source
hashes are committed. Rebuilding incident candidates therefore requires the public
download, while importing the committed candidates works offline.

Operator GIS/archive downloads use explicit bounded 120-second timeouts; normal
live calls retain the shared eight-second default and at most two retries.
INGEMMET requests can reuse a 24-hour ignored operator cache to resume expensive
spatial queries; capture time describes assembly, not a newly published geology
dataset. SENAMHI warnings are fetched fresh. Capture failure never replaces the
last valid committed artifact. Run captures/preparation serially in one checkout.

## Persistence and APIs

Migration `20261018000000_data_snapshots.sql` stores complete validated captures
with dataset/key/revision, capture time and content hash. Atomic upserts reject
older or equal-time retries. Terrain and hazard imports use database transactions
and advisory locks; original hazard geometry, national warnings and prepared
display snapshots commit together. A failure rolls back partial work. Browser
roles cannot read these tables directly.

| Public read route | Payload |
|---|---|
| `/api/weather/catchments` | Typed catchment totals and six-hour windows, returned grid locations and capture-anchored dates |
| `/api/hazards` | Prepared GeoJSON plus segment/catchment exposure, geometry diagnostics and source limitations |
| `/api/history/events` | Sanitized candidates, source provenance, exclusions and explicit training-readiness flags |
| `/api/history/weather?dataset=yaku-2023` | Yaku reconstruction series |
| `/api/history/weather?dataset=forecast-2024` or `forecast-2025` | Fixed-lead archives |
| `/api/history/weather?dataset=reference-2024` or `reference-2025` | Retrospective reference series |

These source-data reads are public; company dispatch and generated-report access
remain separately protected. Each route uses the pinned geometry revision and
validates stored JSON. On database failure, it serves the bundled validated
snapshot with its original capture time, age and visible fallback notice. Weather
and warning captures older than 90 minutes are marked stale. If both sources fail,
the route returns a safe 503. Historical dataset selection is allowlisted.
The dashboard adds official layer toggles, source explanations and stale/error
messages. It polls these read APIs every five minutes, which does not refresh the
provider captures. Hourly weather/model scheduling is a subsequent Role C task;
the existing ten-minute SUTRAN schedule is unchanged.

| Failing provider | Defined fallback and visible result |
|---|---|
| Open-Meteo rainfall or elevation | Capture exits nonzero and retains the last validated file/database capture. The API/source panel keeps its capture date and age; incomplete rainfall remains unavailable. |
| INGEMMET | Bounded operator cache can resume within 24 hours. Otherwise capture fails without replacing the validated overlay; the map/source panel retains its dated snapshot. |
| SENAMHI warnings | Capture failure preserves the prior dated layer; expired/unknown-validity warnings are hidden and no absence-of-hazard conclusion is drawn. |
| SENAMHI hydrographic units | Failed refresh retains the committed cross-check and its original capture time; no precise delineation claim is added. |
| Provías | Failed download/preparation preserves the sanitized candidate registry and incomplete-coverage notice; no fabricated labels are added. |
| Supabase | API serves the validated bundled source with `meta.state: snapshot`; if that fails too, safe 503 and visible dashboard error. |

## Sources, access and terms

| Provider | Primary reference | Use/terms boundary |
|---|---|---|
| Open-Meteo | [Forecast](https://open-meteo.com/en/docs), [Previous Runs](https://open-meteo.com/en/docs/previous-runs-api), [Historical Weather](https://open-meteo.com/en/docs/historical-weather-api), [Elevation](https://open-meteo.com/en/docs/elevation-api) | Keep Open-Meteo attribution; distinguish forecast, reanalysis and terrain. Public access is used for this prototype; recheck service terms before commercial operation. |
| INGEMMET | [Regional susceptibility layer and metadata](https://geocatminnube.ingemmet.gob.pe/arcgis/rest/services/SERV_SUSCEPTIBLE_MOV_MASA_REGIONAL/MapServer/1) | Public ArcGIS access is verified. A specific redistribution/commercial license and historical publication date are not verified; do not describe the source as freely licensed. |
| SENAMHI | [Activation map](https://www.senamhi.gob.pe/mapas/mapa-quebradas/), [IDESEP catalog](https://idesep.senamhi.gob.pe/portalidesep/idesep_componente_catalogo_geoservicios_wfs.jsp) | Public WFS access is verified; this is an attributed prototype snapshot, not an official redistributed warning service or a verified commercial license. |
| Provías / COEN | [Historical source audit](historical-events.md) | Public exports/reports are evidence, not an exhaustive event registry. Preserve provenance and unresolved facts. |
| HydroBASINS | [Catchment provenance and license](pe22-catchments.md) | Existing attribution and HydroSHEDS license obligations remain applicable. |

Tests cover precipitation weights/windows/nulls, malformed responses, all new
provider retries/timeouts, warning validity, spatial unknowns, source parsing,
snapshot idempotency, transactional rollback and browser privilege denial.
No forecast performance, field validation, station validation or visual browser
walkthrough is claimed by these checks.
