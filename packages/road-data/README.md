# @peruroad/road-data

Member C's independent Data & Model package for PeruRoad Climate. The current
implementation reads and validates SUTRAN alerts and per-alert history. Database
persistence, scheduled polling, weather adapters, and risk models remain future
work under the [Team Plan](../../docs/team-plan.md).

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
pure domain logic, provider integrations, and later services/database adapters.

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

## Application integration later

`npm run build` emits JavaScript and declarations into `dist/`. The package
exports two entry points:

```ts
// Server-side adapters; import from route handlers or services.
import { createSutranAdapter, createFetchJsonTransport } from "@peruroad/road-data";

// Shared schemas and types; suitable for dashboard consumers too.
import { officialRoadAlertSchema } from "@peruroad/road-data/contracts";
import type { OfficialRoadAlert } from "@peruroad/road-data/contracts";
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
`/contracts` entry point. This package is private and is not published to npm.

[Adapter documentation](../../docs/data/sutran-adapter.md) describes contracts,
source semantics, HTTP behavior, and the remaining ingestion work. Changes go
through a feature branch, CI, and teammate review before merging into main.
