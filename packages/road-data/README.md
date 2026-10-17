# @peruroad/road-data

Member C's independent Data & Model package for PeruRoad Climate. The current
implementation reads and validates SUTRAN alerts and per-alert history, and
provides an idempotent ingestion service behind a transactional repository
interface, backed by a verified Postgres repository. It also prepares and imports
PE-22 geometry, 1-km display segments, terrain elevation, and a sourced landmark
gazetteer with nearest-road lookup, prepares a coarse HydroBASINS catchment
fallback with area-weighted weather query points. Catchment weather captures,
sampled slopes, official INGEMMET/SENAMHI overlays and historical event candidates
now have validated contracts, persistence and application read APIs; see the
[input handoff](../../docs/data/model-inputs.md). The deployed authenticated job
and active n8n schedule archive SUTRAN alerts every ten minutes. Hourly weather/
model automation and risk training remain pending the
[ML checkpoint](../../docs/data/ml-readiness.md).

Continue Role C work on `feat/data-model` and consolidated
[PR #10](https://github.com/Gonzalo-Rod/HackTheAndes/pull/10). B's protected HTTP
connection and TypeScript client are documented in the
[messaging handoff](../../docs/integration/member-b.md).

## Development

Requires Node.js 24.3 or newer and npm. From the repository root:

```sh
npm --prefix packages/road-data ci
npm --prefix packages/road-data run lint
npm --prefix packages/road-data run format:check
npm --prefix packages/road-data run typecheck
npm --prefix packages/road-data test
npm --prefix packages/road-data run build
```

Dependencies, lockfile, compiler settings, tests, and format/lint configuration
belong to this package. The Next.js application can be developed independently
at the repository root. The package does not require a root workspace or root
package manifest to run its checks.

The layers inside `src/` follow [AGENTS.md](../../AGENTS.md): shared contracts,
pure domain logic, provider integrations, and ingestion services. A database
adapter implements the persistence contract; shared migrations are in
`supabase/migrations/`. See the [database handoff](../../supabase/README.md).

## Live check

No credentials are needed for the public SUTRAN endpoints:

```sh
npm --prefix packages/road-data run sutran:check
```

The command prints normalized PE-22 records, with safe transport logs on stderr.
It exits with code 1 for upstream failure or rejected records and shows an
explicit unavailable state when the source fails. It does not persist data or
start scheduled polling. Tests run offline against captured public responses
and controlled failures.

## Application integration

`npm run build` emits JavaScript and declarations into `dist/`. The package
exports the following entry points:

```ts
// Server-side adapters; import from route handlers or services.
import { createSutranAdapter, createFetchJsonTransport } from "@peruroad/road-data";

// Shared schemas and types; suitable for dashboard consumers too.
import { officialRoadAlertSchema } from "@peruroad/road-data/contracts";
import type { OfficialRoadAlert } from "@peruroad/road-data/contracts";

// Server-side ingestion with injectable persistence.
import { createSutranIngestionService } from "@peruroad/road-data/ingestion";
import type { OfficialAlertRepository } from "@peruroad/road-data/ingestion";

// Server-side geometry preparation; client-safe geometry schemas live separately.
import { preparePe22Geometry } from "@peruroad/road-data/geometry";
import { displaySegmentsSchema } from "@peruroad/road-data/geometry/contracts";

// Server-side elevation preparation and a browser-safe overlay contract.
import { preparePe22Elevation } from "@peruroad/road-data/elevation";
import { elevationSnapshotSchema } from "@peruroad/road-data/elevation/contracts";

// Location helpers for B; source-reported kilometers remain unverified.
import { createRoadLocator, resolvePlaceName } from "@peruroad/road-data/locations";
import { gazetteerSchema } from "@peruroad/road-data/locations/contracts";

// Coarse catchment fallback and browser-safe contract.
import { loadBundledCatchments } from "@peruroad/road-data/catchments";
import { catchmentSnapshotSchema } from "@peruroad/road-data/catchments/contracts";

// Weather preparation, pure aggregation and browser-safe schemas.
import { prepareCatchmentWeather, summarizeOperationalWeather } from "@peruroad/road-data/weather";
import { weatherCaptureSchema } from "@peruroad/road-data/weather/contracts";

// Validated source snapshots and transactional spatial enrichment.
import {
  createDataSnapshotRepository,
  persistHazards,
  persistTerrain,
} from "@peruroad/road-data/model-inputs";
import { preparedHazardsSchema } from "@peruroad/road-data/model-inputs/spatial-contracts";
import { historicalEventsSchema } from "@peruroad/road-data/model-inputs/event-contracts";

// Server-only database pool and durable official-source repository.
import {
  createDatabasePool,
  createPostgresOfficialAlertRepository,
} from "@peruroad/road-data/database";

// Server-only scheduled job boundary, with durable execution deduplication.
import { createPostgresSutranJobHandler } from "@peruroad/road-data/jobs";
```

When integrating, member A adds the local dependency to the application's
`package.json`, relative to that file's location:

```json
{
  "dependencies": {
    "@peruroad/road-data": "file:packages/road-data"
  }
}
```

Install and build this package before the application build. Coordinate the
application's dependency installation and lockfile update with A; a workspace
can replace the file dependency later if the team adopts one. The backend entry
point uses Node.js APIs and belongs in server code; client components use the
`/contracts`, `/geometry/contracts`, `/elevation/contracts`, `/locations/contracts`,
`/catchments/contracts`, `/weather/contracts`, `/model-inputs/spatial-contracts`,
or `/model-inputs/event-contracts` entry point.
This package is private and is not published to npm.

## PE-22 geometry, catchments and SENAMHI access

```sh
# Refresh public source data and generate the corridor, segments, diagnostics, and hashes.
npm --prefix packages/road-data run pe22:prepare

# Reproduce the committed artifacts without network access.
npm --prefix packages/road-data run pe22:prepare -- --offline

# Refresh midpoint terrain elevations, or validate the committed cache offline.
npm --prefix packages/road-data run pe22:elevation
npm --prefix packages/road-data run pe22:elevation -- --offline

# Refresh the sourced gazetteer, or reproduce its cache offline.
npm --prefix packages/road-data run pe22:gazetteer
npm --prefix packages/road-data run pe22:gazetteer -- --offline

# Read-only access check; does not feed the risk model or require credentials.
npm --prefix packages/road-data run senamhi:check
```

The versioned `data/pe22/` snapshot currently yields 174 segments from about
173.87 measured kilometers. These are distances along the source geometry;
official kilometer calibration remains pending. A separate
elevation overlay provides 174 terrain samples with source metadata, while the
base GeoJSON remains unchanged. An elevation refresh failure shows a compatible
cache with its age, or an unavailable state, and exits nonzero.
The gazetteer adds 67 bridge/SOS/toll candidates, including 15 route-specific
kilometer references for review. Name matches require confirmation; duplicate
names remain ambiguous, and pins farther than 500 m from the road are rejected.
The preparation command exits nonzero on invalid/disconnected input or an
unavailable source. It validates and builds before replacing artifacts; verify
manifest hashes when consuming files after an interrupted write.

The SENAMHI command validates the complete configured WFS layer and reports
access metadata only. `reachable` means the layer was fetched and validated,
not that warnings are absent, current, relevant to PE-22, or ready for automated
risk use. The currently returned properties require product/validity review.

See [geometry handoff](../../docs/data/pe22-geometry.md),
[elevation handoff](../../docs/data/pe22-elevation.md),
[gazetteer handoff](../../docs/data/pe22-gazetteer.md),
[catchment preparation](../../docs/data/pe22-catchments.md), and
[SENAMHI discovery](../../docs/data/senamhi-access.md) for verified behavior,
source links, limitations, and integration steps. These public-source commands need no
Supabase or n8n credentials.

[Adapter documentation](../../docs/data/sutran-adapter.md) describes contracts,
source semantics and HTTP behavior. [Ingestion documentation](../../docs/data/sutran-ingestion.md)
covers the storage contract, failure results, and Supabase handoff. Changes go
through a feature branch, CI, and teammate review before merging into main.

## Supabase persistence

The shared schema and operator instructions are in [supabase/README.md](../../supabase/README.md).
Credentials are loaded only through `src/config/env.ts`, with names documented in
`.env.example`; values stay in ignored local environment files. The database
connection validates Supabase's public CA and hostname.

```sh
npm --prefix packages/road-data run db:check
npm --prefix packages/road-data run db:import-pe22
npm --prefix packages/road-data run db:import-elevation
npm --prefix packages/road-data run db:import-gazetteer
npm --prefix packages/road-data run db:import-catchments
npm --prefix packages/road-data run sutran:ingest
npm --prefix packages/road-data run test:db
```

These are explicit database/network commands; the default test suite remains
offline. `test:db` uses random temporary alert IDs and geometry revisions and
removes only its fixtures.
The ingestion command runs once, records a safe run summary, and exits nonzero
on partial/unavailable results. It does not enable continuous polling. Remote
migrations and initial credential provisioning require the management token;
runtime ingestion uses the scoped `peruroad_backend` login.

## Scheduled ingestion handoff

The [API application](../../apps/api/README.md) now consumes this package and
mounts the protected job at `POST /api/jobs/sutran` on a verified public Preview.

See [the n8n workflow guide](../../workflows/n8n/README.md) for the active schedule,
portable inactive export, `POST /api/jobs/sutran` integration, credential setup,
and activation checks.
`npm --prefix packages/road-data run sutran:job:check` explicitly checks real
SUTRAN/Supabase persistence through the local handler, including denied missing
credentials and repeated execution IDs. It requires `ROAD_DATA_JOB_SECRET` in
the ignored environment file and does not deploy or start scheduled polling.

## Model input capture and training checkpoint

See the [reproduction commands, API contracts, source terms and fallback table](../../docs/data/model-inputs.md).
`weather:capture`, `hazards:capture`, `hydrography:capture`, `terrain:capture` and
`events:capture` are operator commands; they do not start a schedule.
`hazards:prepare` works offline from committed source archives; `events:prepare`
uses the ignored public XLSX captures downloaded by `events:capture`.
`db:import-weather` and `db:import-model-inputs` import validated committed inputs.
`model-inputs:check` audits coverage and regenerates the hash manifest.
No model is trained by these commands. The registry retains incomplete event
coverage, unknown negatives and missing forecast hours explicitly.
