# PeruRoad API

Member A's Node.js/Next.js API application, consuming C's compiled
`@peruroad/road-data` package. It has its own dependencies, lockfile, and checks
under `apps/api/` so teammates can integrate their root-level frontend separately.
The current step mounts and verifies the existing SUTRAN ingestion handler;
dashboard APIs, paid access, and weather/model endpoints are later
steps under the full [Team Plan](../../docs/team-plan.md).

## Install and build

Use Node.js 24.3 or newer. Run from the repository root, in this order:

```sh
npm --prefix packages/road-data ci
npm --prefix packages/road-data run build
npm --prefix apps/api ci
npm --prefix apps/api run lint
npm --prefix apps/api run format:check
npm --prefix apps/api run typecheck
npm --prefix apps/api test
npm --prefix apps/api run build
npm --prefix apps/api run test:http
```

Run type generation and builds sequentially: both manage `.next/` files.
Builds and the default tests need no live credentials. `test:http` starts and
stops a relocated standalone production artifact using an unreachable loopback
test database and a temporary random job secret; it does not call SUTRAN or
Supabase. It verifies mounted HTTP boundaries, public CA packaging, excluded
environment files, and credential-free logs.

The build uses webpack for production dependency/asset tracing. `.npmrc` sets
`install-links=true` so npm installs the local data package as a real package
instead of a symlink; Next.js can then keep it and `pg` external, preserving the
native `import.meta.url` certificate lookup. `outputFileTracingRoot` covers the
repository, with a narrow certificate include. Runtime source validation,
persistence, and audit behavior remain in the data package. After changing that
package, rebuild it and reinstall the API dependency before rebuilding the API;
the installed copy does not update automatically.

## Run locally

Provide only these server environment variables, listed in `.env.example`:

- `DATABASE_URL`: the existing scoped `peruroad_backend` connection.
- `DATABASE_SSL_MODE=verify-full`: verifies Supabase's public CA and hostname.
- `ROAD_DATA_JOB_SECRET`: the same base64url secret used by n8n.

Keep values in your shell environment or ignored local files. To reuse the
existing local settings without copying a secret file into the app or its build
artifact, run from `apps/api/`:

```sh
node --env-file=../../packages/road-data/.env.local node_modules/next/dist/bin/next dev --hostname 127.0.0.1
```

Replace `dev` with `start` to run the production build. Alternatively, set the
three variables in your environment and use `npm --prefix apps/api run dev` or
`npm --prefix apps/api start`. Do not place local environment files in the
production artifact; `test:http` rejects artifacts containing `.env` files.

Verified locally on October 17, 2026: a relocated production artifact served
health over HTTP, rejected missing credentials, and completed two real
SUTRAN/Supabase jobs using verified database TLS. Both selected four current
PE-22 alerts without creating duplicate revisions/history, and repeating each
execution ID reused its stored outcome. This verifies local production HTTP
integration; no public deployment or scheduled n8n execution is claimed.

The configuration adapter delegates validation to the shared package. Runtime
configuration is validated before initializing the first job, keeping builds
independent of secrets; missing or invalid settings return a safe 503. The pool
and handler are reused within each server process. No management token or
Supabase secret API key is needed by the job.

## Routes

| Route                   | Behavior                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`       | Public liveness JSON only; does not establish database/provider health or scheduled ingestion.                  |
| `POST /api/jobs/sutran` | Delegates to the protected SUTRAN handler; requires a bearer job secret and a valid bounded execution envelope. |

The job uses the Node.js runtime and declares `maxDuration=150`. It returns 401
for missing/wrong credentials, 400 for invalid input, 413 for oversized bodies,
409 for an already-running execution, 503 for partial/unavailable ingestion, and
200 only for completed ingestion plus durable audit. Unsupported HTTP methods
receive Next.js's 405 response. The job has no CORS allowance for browser access.
See the [n8n handoff](../../workflows/n8n/README.md) for request shape, deduplication,
source failure handling, and activation checks.

The API app exposes no dashboard data, customer records, or database connection
details at this stage. There is no root UI; the health route is the public smoke
check until dashboard integration is implemented.

## Vercel deployment

The [peruroad-api project](https://vercel.com/gozlie/peruroad-api) was created in
the Gozlie team through the authenticated Vercel MCP connection on October 17, 2026. Its configured root is `apps/api`, with Node.js 24, source files outside
the root enabled, and Fluid compute with a 150-second default function timeout.
The hosted build successfully installed/built the data package before the API
using the committed `vercel.json` commands.

- [Public health check](https://peruroad-api-gozlie.vercel.app/api/health).
- Protected job: `POST https://peruroad-api-gozlie.vercel.app/api/jobs/sutran`.
- [Verified deployment](https://peruroad-fx5gynog9-gozlie.vercel.app/api/health):
  `dpl_4ZffbgG6qk8uLpqdwXN25JwT9MUv`, source commit `8dd3e33` on
  `feat/api-foundation`.

Vercel's Git integration cannot currently access the private repository, so this
deployment used an MCP upload of the 98 tracked API/data-package files at that
commit, excluding all `.env*` files. Automatic Git deployments remain pending;
the source snapshot does not update when the branch changes. Keep the PR stack
unmerged and deploy later changes explicitly until Git access is configured.

All three server variables are stored as sensitive variables targeting Preview
only; their names, types, and targets were verified without displaying values.
For API-created Preview deployments, explicitly use Vercel's `target: "staging"`
value; the first request with an omitted target was classified as Production
and cancelled before completion. The verified deployment uses `staging` and its
stable project alias; Production variables have not been configured.

Vercel's sign-in gate is disabled for this API project so the public health route
and authenticated server-to-server job calls are reachable. The job's bearer
authentication remains mandatory. On the hosted deployment, missing/wrong
credentials returned 401, malformed input returned 400, and oversized input
returned 413. Two real SUTRAN/Supabase executions each selected four unchanged
alerts with no duplicate revisions/history; repeat requests reused their stored
outcomes. Both completed audit rows were verified directly over verified database
TLS, and the stable alias returned the same saved outcome.

Next, configure the existing n8n draft's HTTPS URL and credential, verify two
manual n8n executions, then publish and check scheduled runs in a separate step.
The workflow remains inactive; deploying the API does not enable polling.

Framework references: [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers),
[production file tracing](https://nextjs.org/docs/app/api-reference/config/next-config-js/output),
and [Vercel shared-source setup](https://vercel.com/docs/monorepos/monorepo-faq).
