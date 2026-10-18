# Verified environmental map handoff

This corrects the initial integration after the participant rejected an undated,
unlocated SENASA reference in the main evidence view. Research-source verification
and map-record eligibility now have separate requirements. The map is available
at `http://localhost:3000/`; no deployment or remote schedule was activated.

## What is mapped

The catalog contains **323 environmental records**: 303 official INGEMMET
critical-zone points, 11 daily warning-area records from SENAMHI notices
415, 420, 421 and 422, and nine dated station/town references. These are
**312 point records and 11 area records**, not 323 confirmed emergencies.
There are four distinct weather notices; different days and warning levels
remain separate records because their geometries and validity differ.

The national view opens by default. The header combines road and environmental
record counts and states each component. Topic filters affect the environmental
map and list together; the PE-22/Mantaro option uses a defined navigation window,
not a mine boundary or a verified road-impact footprint. All eligible records
enter the map even when the sidebar initially displays a shorter list.

The 303 INGEMMET points are in Cajamarca, Lambayeque, Tumbes, Piura,
La Libertad and Amazonas. INGEMMET publishes each with `NRO_AVISO=421`; the
official source classifies 160 points as Nivel 2 and 143 as Nivel 3. These are
**inventory locations associated with notice 421, not 303 forecast footprints**.
The separate 11 SENAMHI polygons show forecast coverage. The map labels the
points as inventory and dates them by the associated notice validity; neither
the point nor the notice confirms a landslide or road closure.
Every original coordinate is retained. Screen-space count labels group nearby
zones and anchor to an actual member point; this avoids moving a cluster offshore
and avoids asynchronous MapLibre worker lookups that could expire during refresh.
The country outline is derived from the 25 SUTRAN department geometries after
removing shared internal edges, so only Peru's complete perimeter is emphasized.
The national road network is off by default and uses a neutral color when enabled;
forecast polygons retain muted fills with subdued outlines.

SENAMHI warning areas use original WFS MultiPolygons. The 13 retained source
risk features become 11 records when features sharing notice/map/level are
grouped without changing their coordinates. Nivel 1 national background polygons
are excluded. Dates come from the feature properties and match the published
notice: for example, warning 422 map one begins at 14:00 Lima on 18 October
and ends at 23:59:59 that day; map two has its own 19 October validity.

The nine existing station/town references preserve their earlier observation or
forecast dates. Some official atlas coordinates are rounded to 0.1 degrees;
their approximation is disclosed. They identify station/locality references,
not precise affected fields, observed hazard footprints or mining assets.

## Eligibility and excluded records

`map-evidence_christian.ts` requires official geometry, an official geometry-source
URL, an official evidence-source URL, and a verified observation/publication date.
Forecasts additionally require a valid start and end. Zod validates coordinate
ranges, closed polygon rings, HTTP(S) URLs and date formats before normalization.
The service excludes invalid records and makes source errors visible.

The 13 original records without verified geometry or date stay in downloadable
research documents. They are absent from `catalog.records`, the map and the main
list, including when an old `?evidencia=` link targets them. No district centroid,
news location guess, or point added to fill the map replaces missing evidence.
No dated local pest outbreak with verified geometry was obtained; an empty pest
filter means no eligible evidence was found, not that pests are absent.

## Sources and capture

- [INGEMMET official critical zones under notice, GeoJSON](https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_PERU_ALERTA/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson)
- [SENAMHI official notice text](https://www.senamhi.gob.pe/?p=aviso-meteorologico-vigente&a=2026&b=29287&c=00&d=SENA)
- [SENAMHI warning 422, first daily WFS map](https://idesep.senamhi.gob.pe/geoserver/g_aviso/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=g_aviso:view_aviso&maxFeatures=50&viewparams=qry:422_1_2026&outputFormat=application/json)

The additional sources were captured through Tavily and saved after verification
at **2026-10-18T02:28:30Z (17 October, 21:28 Lima)**. Original retained geometries
and attributes are in `official-map-geometries-2026-10-17_christian.json`;
normalized input is in `verified-map-evidence-2026-10-17_christian.json`.
Tavily's transport escaped underscores; those escapes were decoded for JSON
parsing. Coordinates were not simplified, averaged or displaced.

The source registry now contains **41 references**. Existing earlier source
entries retain their verification times; two new entries document the successful
ArcGIS/WFS capture. The geographic pass made eight advanced searches and five
advanced extraction attempts, requesting 18 URLs and successfully extracting 13.
The final attempt returned HTTP 429. CLI requests also failed DNS both inside
the sandbox and on an approved retry; no CLI/provider refresh is claimed.

The estimated Tavily ledger is **726/2,000 credits**, using the existing
per-call estimation model; billing was not returned. The older source-registry
estimate of 688 was stale and is explicitly reconciled to the prior main ledger's
700 before adding this pass's estimated 26. Calls, source URLs, failures and
verification rules are recorded in `geography-verification-2026-10-17_christian.json`.

## Refresh behavior and checks

Road alerts and Open-Meteo retain their existing refresh behavior. The browser
re-reads the research catalog every five minutes; **this does not fetch fresh
INGEMMET/SENAMHI data**. Environmental captures require a reviewed snapshot update
and a rebuild/deployment. Forecast badges and polygon fading use their published
validity, independently of the retrieval time, so expiry never becomes a claim
of a new incident. The weekly collector remains independent of these captures.

The geographic correction is covered by source-coordinate preservation tests,
polygon preservation and daily-validity tests, missing-date/provenance rejection,
old-link exclusion, notice-list priority, and MapLibre's actual style validator
for warning fills and record-count labels. The full suite passes **239 tests
in 29 files**. HTTP checks verify the live local catalog's 323 records have zero
missing geometries, dates or provenance links. Lint, type checking, repository-wide
formatting, the production build and diff whitespace checks pass; all 22 research
document links return 200 and appear in the production trace. Browser automation is unavailable here;
visual interaction and WebGL rendering still require an actual browser check.
