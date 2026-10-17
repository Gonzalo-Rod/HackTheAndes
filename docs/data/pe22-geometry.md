# PE-22 geometry and display segments

This implements the first geometry slice of [Role C](../team-plan.md): a
reproducible public-source snapshot, a continuous corridor, and 1-km display
segments inside `packages/road-data/`. The 174 display segments are now loaded
in Supabase/PostGIS through the [database importer](../../supabase/README.md).
Calibrated kilometer markers, elevation enrichment, and the place-name
gazetteer are still pending.

## Source and verified coverage

Checked October 17, 2026 using the same metadata/geometry join as SUTRAN's
[public road map](https://alertasviales.sutran.gob.pe/):

- [Road metadata](https://api.sigea.sutran.gob.pe/public/road-network/segments?red=nacional):
  7,327 national records, including 32 exact `PE-22` sections with source IDs,
  kilometer ranges, published length, name, surface, and condition.
- [National road GeoJSON](https://d27ijeauab3idp.cloudfront.net/red-vial-nacional.geojson):
  7,327 geometries keyed by the same section ID. The asset URL was discovered
  from the official map's frontend; the CDN address can change.

All 32 selected metadata rows matched exactly one geometry. Their endpoints
join exactly when ordered by source kilometer range, from approximately
`[-76.989085, -12.035575]` near Lima to `[-75.909265, -11.522615]` near La Oroya.
Coordinates are longitude/latitude. This snapshot does not include the onward
route to Huancayo or assert that the road data is current, surveyed, or complete
for every operational use. Original survey date, accuracy, simplification, and
reuse terms remain unverified; retain SUTRAN/MTC attribution.

## Measured distance versus source kilometers

The continuous geometry measures **173.8727227 km**, using Turf's spherical
length calculation. The published section kilometer ranges span **0–175.134**.
The mismatch is not uniform: the section labeled `17.887–19.004` has a published
length of 1.117 km but approximately 2.9151 km of geometry. We therefore do not
assign official kilometer markers by accumulating distance or interpolating
blindly within each source section.

The output has **174 segments**: 173 one-kilometer segments and a final remainder
of approximately 0.8727 km. Each carries:

- `distanceFromOriginStartKm` / `distanceFromOriginEndKm`: measured along the
  captured geometry from its first coordinate, not surveyed kilometer markers.
- `sourceReferences`: IDs and full original kilometer ranges of overlapping
  source sections. These ranges are evidence for later calibration, not exact
  kilometer values for the generated segment endpoints.
- `officialKmStart`, `officialKmEnd`, and `elevationM`: null.
- `kilometerCalibration: "unverified"`.
- `geometryRevision`: SHA-256 of canonical assembled coordinates, plus a stable
  segment ID containing that revision and the zero-based segment index.

A source ordering or retrieval-time change does not change segment IDs.
Coordinate edits produce a new revision; downstream records should retain that
revision rather than assuming segment IDs survive road geometry updates.
One-kilometer display resolution does not imply one-kilometer forecast accuracy.

## Reproduce and consume

```sh
npm --prefix packages/road-data ci
npm --prefix packages/road-data run pe22:prepare -- --offline
npm --prefix packages/road-data test

# Explicitly refresh the public sources when desired:
npm --prefix packages/road-data run pe22:prepare
```

Artifacts are versioned in `packages/road-data/data/pe22/`:

| File                   | Purpose                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `source.json`          | Validated PE-22 sections, source URLs, retrieval timestamp, national input counts. |
| `corridor.geojson`     | Ordered continuous `LineString` for the map.                                       |
| `segments-1km.geojson` | Display-segment `FeatureCollection` for D and later database loading.              |
| `diagnostics.json`     | Measured and published lengths and their differences per source section.           |
| `manifest.json`        | Dataset revision, pending fields, segment count, file SHA-256 hashes.              |

The offline command deterministically rebuilds from `source.json`; it does not
refresh that snapshot's retrieval time. Files are individually replaced through
temporary files, with the manifest written last. After interruption, verify all
manifest hashes or rerun offline preparation before consuming the dataset.
Offline tests verify these hashes and reproduce the committed derived files.

Application code can validate segments through the browser-safe
`@peruroad/road-data/geometry/contracts` entry point. Geometry preparation and
source adapters are server-only exports from `@peruroad/road-data/geometry`.
Shared spatial tables now live in `supabase/migrations/`; root application
dependencies remain separate.

## Validation and failure behavior

The adapter uses the shared HTTP wrapper and validates source envelopes,
identities, joins, ranges, and selected geometry with Zod. Missing/duplicate
joins, invalid selected records, or empty PE-22 selection reject the dataset.
The pure core orders sections, removes repeated join coordinates, checks source
range continuity, rejects zero-length sections, and requires exact geometric
endpoint continuity. It never invents connecting lines, fills missing sections,
or silently reverses source geometry.

Turf [length](https://turfjs.org/docs/api/length) and
[line slicing](https://turfjs.org/docs/api/lineSliceAlong) provide geodesic
measurement and segment extraction. Tests check total length, shared endpoints,
the last remainder, stable identities, invalid coordinates, disconnected source
sections, and source failures. On source/build failure the CLI exits nonzero
before replacing artifacts; consumers should retain their previous verified
dataset and show its timestamp or an unavailable state.

## Next steps with the team

1. Cross-check source kilometer references against trustworthy markers and
   incident locations, recording the calibration method and uncertainty.
2. Obtain elevation through a documented terrain source, preserving null when
   unavailable; create a sourced gazetteer for B rather than guessed place/km pairs.
3. Integrate the implemented PostGIS tables/importer with A's read APIs, filtering
   the intended geometry revision and respecting the shared access rules.
4. Give D the GeoJSON and contracts now, with measured-distance and pending-data
   labels. Link segments to catchments before weather sampling and risk modeling.

Geometry preparation still needs no credentials. Database import now uses the
configured scoped connection; authenticated scheduled jobs remain a separate
integration step with A.
