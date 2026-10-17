# PeruRoad API

Member A's Node.js/Next.js API application, consuming C's compiled
`@peruroad/road-data` package. It has its own dependencies, lockfile, and checks
under `apps/api/` so teammates can integrate their root-level frontend separately.
The current step mounts and verifies the existing SUTRAN ingestion handler;
dashboard APIs, paid access, weather/model endpoints, and deployment are later
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
details at this stage. There is no root UI; the health route is the local smoke
check until dashboard integration is implemented.

## Next step: Vercel preview deployment

The user has a Vercel account; project creation and login remain pending. Create
a project for this API with **Root Directory `apps/api`**, Node.js 24, and
**Include source files outside the Root Directory** enabled. The committed
`vercel.json` installs/builds the data package before installing/building the app.
Deploy the feature branch as a preview; keep the current PR stack unmerged.

Set the three server variables in that project's Preview environment. Use the
hosting secret store rather than repository environment files. Verify the
account's execution-duration support; a route declaration does not raise the
hosting plan's limit. Confirm the preview permits n8n's server-to-server access:
any deployment-protection requirement must be configured explicitly while the
job endpoint continues to require its own secret.

After deployment, check the public health route, missing-credential rejection,
and two authenticated real job executions with database audit evidence. Only
then configure the existing n8n draft's HTTPS URL and credential and publish it
in a separate step. No scheduled polling is enabled by installing or running
this API application.

Framework references: [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers),
[production file tracing](https://nextjs.org/docs/app/api-reference/config/next-config-js/output),
and [Vercel shared-source setup](https://vercel.com/docs/monorepos/monorepo-faq).
