# Shared database

Supabase PostgreSQL with PostGIS is the shared database for the full Team Plan.
The initial database work from A's role was implemented in this session at the
participant's request. All team-wide schema changes belong in `migrations/`;
data adapters and operator commands remain in `packages/road-data/`.

## Current project and verification

Project: [HackTheAndes](https://supabase.com/dashboard/project/cdqnintcqryfbfjjlgqv),
region `us-west-2`. Existing project API keys were retrieved; no additional
project, subscription, API key, or administrator-password reset was created.

Four migrations were applied atomically after a rollback-only dry run. They
create PostGIS and 29 application tables, all with RLS and no anonymous or
authenticated browser grants. A scoped `peruroad_backend` login has application
table permissions and its own RLS policies, without superuser, database/role
creation, or RLS-bypass privileges. This login is trusted server infrastructure;
application handlers must still enforce organization permissions, entitlements,
rate limits, and webhook authentication.

The live check stored 174 PE-22 segments, three official SUTRAN alerts, three
source revisions, and six history facts. A second geometry import and SUTRAN
poll added no duplicates. Seven real-Postgres tests verified concurrency,
rollback, null revision uniqueness, constraints, and access controls; synthetic
test IDs were removed afterward. These observations do not establish a deployed
dashboard, merged application incidents, a risk model, or continuous polling.

## Tables and boundaries

| Migration                     | Tables                                                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spatial_foundation`          | `geometry_revisions`, `segments`, `catchments`, `segment_catchments`, `gazetteer`, `hazard_layers`, `weather_inputs`, `official_warnings`, `risk_scores`                |
| `reports_and_incidents`       | `private.delivery_contacts`, `reports`, `incidents`, `incident_reports`, `incident_status_log`, `organizations`, `subscriptions`                                        |
| `product_workflows`           | `passes`, `private.payment_events`, `trips`, `calls`, `dispatch_decisions`, `waitlist`, `weekly_reports`, `private.api_calls`                                           |
| `official_archive_and_access` | `private.official_alerts`, `private.official_alert_versions`, `private.official_alert_history`, `incident_official_alerts`, `private.ingestion_runs`; shared RLS/grants |

Names in the Team Plan are logical singular entities; SQL names above are the
physical shared contract. Parent/child arrays are represented by join tables
for reports, official sources, and catchments. Money uses integer minor units
for passes, with currency recorded explicitly. Reports and call transcripts
store encrypted content, and delivery references are foreign keys to encrypted
destinations; B must supply the encryption/HMAC helpers before collecting data.
No real contact data or demo customers were inserted during setup.

Official source facts remain separate from application `incidents`; matching,
cause classification, confidence, clearing, and segment assignment require
explicit domain rules with B. No lifecycle status or closure duration was
invented during official ingestion. Weather, warnings, catchments, risk, payments,
and messaging tables are foundations and currently have no implemented pipeline.

Segments retain geometry revision IDs, measured-distance fields, source section
references, and null official kilometers/elevation until calibrated/enriched.
Consumers must select the intended `geometry_revision`; importing a new geometry
does not delete historical revisions. Re-importing existing IDs preserves later
calibration and elevation. See [geometry notes](../docs/data/pe22-geometry.md).

## Local configuration

The participant's management token remains in the ignored
`packages/road-data/.env`. Project settings, existing publishable/secret keys,
and the generated scoped connection are in ignored `.env.local`, mode `0600`.
Never copy those values into commits, documentation, browser bundles, or logs.
All variable names and their purpose are in the package's `.env.example`.

On a fresh clone, install with `npm --prefix packages/road-data ci`, then set
the management token and project reference locally. The commands load `.env`
and then `.env.local`; explicitly supplied process variables take precedence.

```sh
# Apply new migrations; --dry-run rolls the entire pending deployment back.
npm --prefix packages/road-data run db:migrate -- --dry-run
npm --prefix packages/road-data run db:migrate

# Initial owner setup: reuse API keys and configure a new scoped database login.
npm --prefix packages/road-data run supabase:configure

npm --prefix packages/road-data run db:import-pe22
npm --prefix packages/road-data run sutran:ingest
npm --prefix packages/road-data run db:check
```

Bootstrap does not rotate an existing shared login when its password is missing
locally. Teammates should obtain the connection settings through the team's
secure credential-sharing mechanism. The management token is only for operator
commands; deployed application code needs the scoped connection and any required
server API key, without the management token.

Migrations use temporary, five-minute CLI administrator credentials issued by
the Management API. The runner uses a single transaction, deployment lock,
standard `supabase_migrations.schema_migrations` history, and content-drift
checks. Do not alter an applied file or manually replay its SQL. A lost commit
response is uncertain: inspect history or rerun the runner's checks before
assuming failure; never delete history to make an error disappear.

## TLS and runtime integration

The database pool verifies the certificate chain and hostname using Supabase's
public root CA in `packages/road-data/certs/`. The certificate URL comes from
the provider's [dashboard source](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json).
Its SHA-256 fingerprint is
`807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`.
It is a public trust certificate, not a private key. See the official
[TLS guidance](https://supabase.com/docs/guides/platform/ssl-enforcement) and
[connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres).
The shared pooler hostname was read from Management API configuration.

```ts
import {
  createDatabasePool,
  createPostgresOfficialAlertRepository,
  loadDatabaseConfiguration,
} from "@peruroad/road-data/database";

const pool = createDatabasePool(loadDatabaseConfiguration());
const repository = createPostgresOfficialAlertRepository(pool);
// Inject into createSutranIngestionService({ source, repository }).
```

Transactions use one checked-out connection and transaction-scoped advisory
locks, including absent alert IDs. No provider HTTP request occurs inside the
transaction. Source history keys are SHA-256 digests of canonical source facts;
null source revisions dedupe through `UNIQUE NULLS NOT DISTINCT`.

## Checks and pending application work

`npm --prefix packages/road-data test` runs offline checks without credentials.
`npm --prefix packages/road-data run test:db` is opt-in and runs against the
configured database: it uses random test alert IDs and removes only those IDs.
CI creates a disposable local PostGIS database and applies migrations from
scratch. Its bootstrap script refuses non-loopback hosts and database names
other than `peruroad_test`; it is never used on the shared project.

`db:check` verifies the scoped connection, counts, secret-key API access, valid
publishable-key Auth access, and denied browser access to operational tables.
Supabase may return HTTP 401 (SQL permission error) or 403 for the latter. Cached
data/unavailable UI handling still belongs to application read APIs.

The protected ingestion handler and inactive ten-minute n8n workflow are prepared;
see [the scheduler handoff](../workflows/n8n/README.md). Next, A deploys that
handler and validated read APIs, then C connects and verifies the schedule. Realtime/browser access
policies and organization authorization need explicit application work; no
anonymous table grants, paid-feature access, or schedule was enabled here.
