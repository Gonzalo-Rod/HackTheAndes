# PE-22 terrain elevation

Role C's elevation slice adds one terrain sample at the geodesic midpoint of
each of the 174 [display segments](pe22-geometry.md). It lives entirely in
`packages/road-data/`, with a replaceable provider, pure sampling logic, an
orchestration service, and a transactional Postgres adapter.

## Source and captured result

The [Open-Meteo elevation API](https://open-meteo.com/en/docs/elevation-api)
documents Copernicus DEM 2021 GLO-90 at 90 m resolution and supports at most
100 coordinates per request. The committed snapshot was retrieved in two
requests at `2026-10-17T21:23:56.045Z`: 174 samples, ranging from **227 to
4,801 m**. Source URLs, coordinates, dataset attribution, retrieval time, and
the geometry revision are retained in
`packages/road-data/data/pe22/elevation.json`.

Credit: Copernicus DEM GLO-90 (2021), served by Open-Meteo. Retain the
[Copernicus dataset citation](https://doi.org/10.5270/ESA-c5d3d65) and
Open-Meteo attribution when presenting or redistributing the data. The dataset
identity comes from the provider documentation; the API response itself supplies
only elevation values.

These are terrain estimates at road midpoints, not surveyed road-deck heights.
A 90 m terrain grid and one sample per display segment cannot establish local
slope, drainage direction, catchments, or forecast accuracy. No risk score or
trained model is produced by this module.

## Reproduce and import

From the repository root, with Node.js 24.3 or newer:

```sh
npm --prefix packages/road-data ci

# Refresh the public elevation source; no credentials required.
npm --prefix packages/road-data run pe22:elevation

# Validate the committed cache against the current road sampling plan, offline.
npm --prefix packages/road-data run pe22:elevation -- --offline

# Operator step on a fresh database; uses the existing management configuration.
npm --prefix packages/road-data run db:migrate -- --dry-run
npm --prefix packages/road-data run db:migrate

# Runtime imports use the scoped backend connection from ignored .env.local.
npm --prefix packages/road-data run db:import-pe22
npm --prefix packages/road-data run db:import-elevation
```

Migration `20261017212000_segment_elevations.sql` is already applied to the
shared project. Add a new migration for future changes rather than editing it.
The real import stored all 174 samples; repeating it updated zero segment
elevation values. A subsequent read verified 174 matching segment/provenance
rows and preserved null official kilometers and unverified calibration.

The base GeoJSON and its manifest deliberately remain unchanged: their
`elevationM` fields are null and their enrichment status describes that base
artifact. The separate elevation overlay joins by segment ID and exact geometry
revision. Database import populates `segments.elevation_m` and stores provenance
in `segment_elevations`; re-importing base geometry preserves that enrichment.

## Contracts and behavior

Browser consumers can validate the overlay using
`elevationSnapshotSchema` from `@peruroad/road-data/elevation/contracts`.
Server consumers use `@peruroad/road-data/elevation` for the provider, sampling
plan, cache validation, and preparation service, and
`importPe22Elevation` from `@peruroad/road-data/database` for persistence.
Build the package before consuming its compiled exports. Public read routes and
dashboard presentation remain a separate application integration task.

Sampling follows distance along curved geometry rather than averaging endpoint
coordinates. All provider responses and persisted snapshots pass Zod validation;
missing values, count mismatches, no-data sentinels, duplicate segments, mixed
revisions, and incompatible caches are rejected. Requests use the shared HTTP
wrapper with its timeout, safe retry policy, and structured logs.

The importer requires complete coverage of an existing geometry revision. It
checks each location is within 5 m of its segment, allowing numerical differences
between Turf and PostGIS, and checks measured midpoint chainage within 1 mm.
Ordered row locks serialize concurrent imports, newer retrieval times take
precedence, and validation failures roll back the entire import. Geometry,
official kilometer fields, and calibration labels are preserved. RLS and grants
keep the table restricted to server roles.

| Situation                                | Visible result                                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Successful refresh                       | `state: ready`, live mode, retrieval time and data age; replace the file only after every batch validates. |
| Explicit offline verification            | `state: ready`, cached mode and original retrieval time; no network or file replacement.                   |
| Refresh failure with compatible cache    | `state: cached`, `refreshFailed: true`, original retrieval time and age; keep the file and exit 1.         |
| Refresh failure without compatible cache | `state: unavailable`, zero available samples and exit 1; no invented elevation values.                     |

A simulated network outage verified the cached fallback and unchanged file hash.
Offline tests cover sampling, payload validation, batch boundaries, timeouts,
HTTP 429/500 handling, and cache compatibility. Three database tests cover repeat
and concurrent imports, stale snapshots, invalid coverage, off-road locations,
bad chainage, and rollback, using isolated synthetic revisions.

Next, calibrate source kilometer references and build the sourced gazetteer,
then prepare catchment and weather inputs. The agreed notification checkpoint
before selecting and training the ML forecast model remains pending.
