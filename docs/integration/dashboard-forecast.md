# Possible-huaico estimates on the dashboard

Since October 18, 2026 an item covers at most 10 km and never spans two different catchment
links, so each card names a concrete stretch. On the map, each item gets a violet glow band
on the terrain, the road drawn solid with a white casing, and a "POSIBLE HUAICO" label.

The **Pronóstico** tab displays `possible_huaico` items labeled **Posible huaico ·
estimación**. These are forecast rainfall conditions overlapping susceptible
terrain under `climate-exposure-v2` (v1 records remain readable), not observed incidents, event probabilities,
confirmed damage or a predicted occurrence time. The underlying rainfall bins
are experimental engineering criteria, not calibrated huaico thresholds.

Open the shared Preview with `?vista=pronostico`, or choose **Posibles huaicos ·
estimación** in the layers panel. Choose 24 or 72 hours, then a dated six-hour
window. Dates and both ends of a window use `America/Lima`, including midnight
crossings. The default is the first available elevated window; a quiet window
can be selected explicitly. There is no invented future event when no eligible
window exists.

Each item shows an approximate mapped kilometer range, the forecast window,
maximum linked-catchment rainfall in that window, maximum high/very-high
susceptible area fraction among linked catchments, and any wet-antecedent reason.
These maxima are not sums or road-wide averages. Only contiguous elevated segments
with the same category and time window are grouped; unsupported gaps and different
categories remain separate. Geometry distances are not official road markers.

**Ver tramo en mapa** focuses the actual stored segment geometries. Dashed purple
stretches identify elevated estimates; gray identifies unsupported segments.
A separate map badge identifies the selected forecast time window. Clicking a
purple stretch selects its corresponding forecast item. Incompatible geometry
is not drawn, missing geometries are disclosed, and partially mapped grouped
items cannot be focused as if their full location were available.

The observed **Eventos reportados** list, historical timeline, incident counts,
road status and impact metrics exclude these generated items. No forecast item
is inserted into `public.incidents`, and an exposure decrease never reopens a
road. Current SUTRAN/community conditions retain their existing source labels.

## Data and freshness

The browser validates `GET /api/exposure?horizonHours=72` and `GET /api/segments`
through the shared HTTP adapter. It refreshes every five minutes and exposes a
manual refresh button; the independent ingestion workflow updates rainfall and
assessments hourly. The client rechecks freshness every 30 seconds, so an open
tab suppresses active estimates at the exact weather-age deadline, for future
captures/assessments, expired windows, unavailable inputs or snapshot fallback.
A failed refresh visibly identifies the cached data; it never silently means zero
rainfall, a cleared incident or a safe road.

Capture time and evaluated/unknown coverage are visible. Expand **Fuentes, fecha
y límites** for model/grid size, susceptibility provenance, experimental policy,
coarse catchment association, source links and unknown publication/forecast issue
times. Rainfall is model-estimated, not a gauge observation.

WhatsApp continues to evaluate the same assessment's **24-hour summary** every
30 minutes, sending only eligible material escalations in the subscribed range.
The dashboard's six-hour view provides finer time context; the two horizons need
not have identical categories. `EXPOSICION` links directly to the forecast tab.
This release does not change messaging consent, delivery limits or checkpoints.

## Modules and verification

- `src/domain/exposure/forecast-events.ts`: pure time/coverage/grouping projection.
- `src/domain/exposure/forecast-map.ts`: revision-checked geometry join and bounds.
- `src/hooks/use-climate-forecast.ts`: validated reads, polling and UI selection.
- `src/components/dashboard/ClimateForecastPanel.tsx`: forecast presentation.
- `src/components/map/forecast-layers.ts`: distinct map styling and selection.

Offline tests cover contiguous grouping, unsupported gaps, distinct levels,
maxima, 24/72-hour bounds, exact expiry/freshness, future/snapshot/unavailable
inputs, Lima midnight, explicit/default window selection, and mismatched/missing
geometry. These checks and visual inspection establish implementation behavior,
not measured hazard-prediction skill or real-user impact. No new credentials,
database tables or migrations are required.
