# n8n workflows

The SUTRAN workflow calls the application through an authenticated internal job
endpoint. Data validation, history enrichment, revision rules, and persistence
remain in `@peruroad/road-data`; n8n holds no database credentials.

## Current state

An unpublished workflow is saved in the account's personal project:
[PeruRoad — SUTRAN ingestion (10 minutes)](https://gozlie.app.n8n.cloud/workflow/67O2kAY8fPtWjD9K).
The API is deployed at
`https://peruroad-api-git-feat-api-foundation-gozlie.vercel.app/api/jobs/sutran`
and has passed direct authenticated HTTP ingestion checks. The cloud draft's
HTTPS URL is configured and its graph validates; the HTTP credential still needs
to be saved before real n8n execution and publication. The MCP connection can
list and attach credentials but provides no credential-creation tool, so this
one credential must be saved through n8n's UI. Weather ingestion, risk
recalculation, incident promotion, alert
evaluation, and the weekly report are separate pending integrations.

- `sutran-ingestion.sdk.js`: source for n8n's Workflow SDK/MCP builder. It is
  interpreted by n8n, not executed by the road-data package.
- `sutran-ingestion.json`: portable export of the saved draft, with `active: false`
  and no account-specific credential IDs, pin data, or personal information.
- `sutran-ingestion.settings.json`: workflow settings applied through MCP after
  creation; these are also included in the JSON export.

To change the cloud draft through MCP, inspect its latest details, read the SDK
and relevant node references, validate source with `validate_workflow`, then
apply targeted updates to the existing workflow. Do not create duplicates or
publish while URL/credential setup is pending. After saving, retrieve and compare
the graph and settings, and refresh the portable export without credentials or
test pin data. Import the JSON file through n8n's editor to restore it elsewhere.

## Backend handoff for member A

The handler is now mounted in the [API application](../../apps/api/README.md)
at `apps/api/src/app/api/jobs/sutran/route.ts` and deployed at the URL above.
The example below also applies when integrating with another Node.js
application.

Add the local package dependency and build it as described in
[the package README](../../packages/road-data/README.md). Mount its Web Request
handler at `POST /api/jobs/sutran` in the deployed Node.js application. A Next.js
route can stay this small:

```ts
import {
  createDatabasePool,
  loadDatabaseConfiguration,
} from "@peruroad/road-data/database";
import {
  createPostgresSutranJobHandler,
  loadJobConfiguration,
} from "@peruroad/road-data/jobs";

export const runtime = "nodejs";
export const maxDuration = 150;

const pool = createDatabasePool(loadDatabaseConfiguration());
const config = loadJobConfiguration();
const handle = createPostgresSutranJobHandler({
  pool,
  secret: config.ROAD_DATA_JOB_SECRET,
});

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
```

Deploy `DATABASE_URL`, `DATABASE_SSL_MODE=verify-full`, and
`ROAD_DATA_JOB_SECRET` as server environment variables. Preserve the package's
bundled public CA when deploying. The hosting platform must support the configured
duration; declaring `maxDuration` alone does not change a hosting-plan limit.
The Supabase management token and secret API key are unnecessary for this job.

Generate a random base64url job secret of at least 32 characters. Its local value
is configured in ignored `packages/road-data/.env.local`; keep the same value in
the backend environment and the n8n credential store. Never put it in workflow
parameters, source files, URLs, screenshots, or Git.

The request uses `Content-Type: application/json`,
`Authorization: Bearer <ROAD_DATA_JOB_SECRET>`, and only this body:

```json
{ "requestId": "n8n-sutran-123" }
```

Request IDs are 1–128 letters, digits, underscores, or hyphens. The handler checks
credentials with a constant-time digest comparison before parsing the body,
rejects unknown fields and bodies over 1 KiB, and fixes the source/road internally.
It passes a 120-second cooperative cancellation deadline to ingestion; database
statements have their existing eight-second timeout. Keep the endpoint server-only
and use HTTPS outside local checks.

| Status          | Meaning                                                                            |
| --------------- | ---------------------------------------------------------------------------------- |
| 200             | Ingestion and durable audit completed; returns aggregate counts.                   |
| 400 / 413 / 415 | Invalid JSON/request, oversized body, or incorrect media type.                     |
| 401             | Missing or incorrect job credential; ingestion never starts.                       |
| 405             | Unsupported method.                                                                |
| 409             | The same execution ID is already running.                                          |
| 503             | Partial ingestion, source/persistence failure, cancellation, or unconfirmed audit. |

`private.ingestion_runs` atomically reserves each execution ID. Repeating a
completed ID returns its stored outcome without polling again. A running ID
remains reserved if its process is terminated before finalizing the audit; inspect
that row and use a fresh execution ID for a deliberate recovery run. The next
scheduled execution naturally uses a new ID; source revisions and history also
deduplicate independently. Partial source results retain committed records and
retry pending enrichment during a later execution.

## Configure and verify before publishing

1. Deploy the endpoint and confirm unauthenticated requests return 401.
2. Replace the URL placeholder in **Archive SUTRAN through backend** with the
   deployed HTTPS endpoint. Redirects remain disabled to avoid forwarding job
   credentials to another destination.
3. Configure the **PeruRoad ingestion job** custom-auth credential to send the
   `Authorization` header. For the templated custom-auth type, use the template
   `{"headers":{"Authorization":"Bearer {{api_key}}"}}` and store the job secret
   as `api_key`. Select that credential on the HTTP node; no credential value
   belongs in the graph export.
   An existing **Header Auth** credential can also be reused: its header Name is
   `Authorization` and its Value is `Bearer ` followed by the same job secret.
   Match the HTTP node's generic authentication type to the saved credential
   before testing; keep secret values exclusively in the credential store.
4. Run **Manual verification** twice with different n8n execution IDs. Confirm
   HTTP 200, `status: complete`, two finished Supabase audit rows, and no duplicated
   revisions/history for unchanged source data. An empty valid source batch is a
   successful zero-count run.
5. Confirm the ten-minute interval, `America/Lima` timezone, 130-second HTTP
   timeout, and 150-second workflow timeout. Automatic POST retries are disabled;
   the next scheduled execution polls again.
6. Publish the existing workflow only after those live checks pass, then inspect
   two actual scheduled executions and the matching audit rows. Save an export
   before the trial ends.

HTTP failures stop the workflow. Even an HTTP 200 response must contain
`status: complete`; otherwise the explicit failure branch stops execution.
Failures remain visible in n8n's execution list and the backend audit. Messaging
notifications are not wired into this workflow yet.

## Verification commands

```sh
npm --prefix packages/road-data test
npm --prefix packages/road-data run test:db

# Explicit live SUTRAN/Supabase check through the local handler, without deployment.
npm --prefix packages/road-data run sutran:job:check
```

The live check runs two new ingestion IDs and repeats each to verify cached
outcomes, also checking missing credentials. It writes real source data/audit
rows; it does not start a server, contact n8n, or enable scheduling.

Verified on October 17, 2026: the local handler completed both real polls,
selected four current PE-22 alerts, archived one newly observed alert/history
event, and returned identical cached outcomes for duplicate execution IDs.
n8n's pinned-response test execution `1` succeeded; execution `2` intentionally
failed at **Fail unconfirmed ingestion** for a simulated partial outcome. These
were simulated n8n tests, not scheduled calls to a deployed backend.

MCP validation and pinned-response workflow tests verify the graph and failure
branch without calling the backend. They do not establish live deployed behavior.
The standard trial's 1,000-execution allowance covers approximately 210 baseline
scheduled runs over 30 hours for SUTRAN plus a future combined hourly weather/risk
workflow, before tests and other workflows; actual remaining account quota should
be checked in n8n. See [n8n's current trial limits](https://n8n.io/pricing/).
