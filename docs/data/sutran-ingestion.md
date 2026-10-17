# SUTRAN ingestion and persistence handoff

The ingestion service is member C's second F8 implementation slice. It coordinates
the existing source adapter, pure revision rules, and an injectable repository.
Offline tests use a transactional in-memory fake; **there is no connected database,
Supabase repository implementation, deployed job endpoint, or n8n schedule yet**.

## Ownership and location

The [Team Plan](../team-plan.md) chooses Supabase PostgreSQL with PostGIS. C
defines the pipeline's data requirements and implements its data/model logic.
A coordinates the shared database schema and migrations with C, owns deployment
and credentials, and exposes the application read APIs. Agree physical table
names and incident integration together before adding migrations.

| Module inside `packages/road-data/`             | Responsibility                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/contracts/ingestion.ts`                    | Runtime schemas, source/repository interfaces, typed run results.                    |
| `src/domain/road-data/official-alert-update.ts` | Pure revision and freshness decisions; source history identity.                      |
| `src/services/ingest-sutran-alerts.ts`          | Ingestion use case, transaction orchestration, bounded history requests, accounting. |
| `src/services/sutran-history.ts`                | History validation and explicit degraded results.                                    |
| `tests/ingestion/`                              | Offline checks and a test-only transactional repository.                             |

Production persistence should implement `OfficialAlertRepository` in a database
adapter, following the existing package layers. App routes call the service;
n8n only schedules an authenticated job. Keep application scaffolding and
credentials out of this package until integration is coordinated with A.

## Service usage

After building and installing the local package, a server service can accept
the future database adapter explicitly:

```ts
import {
  createFetchJsonTransport,
  createSutranAdapter,
} from "@peruroad/road-data";
import {
  createSutranIngestionService,
  type OfficialAlertRepository,
} from "@peruroad/road-data/ingestion";

export function createOfficialDataJob(repository: OfficialAlertRepository) {
  return createSutranIngestionService({
    source: createSutranAdapter({ transport: createFetchJsonTransport() }),
    repository,
    maxHistoryRequests: 5,
  });
}

// In the authenticated job handler, after injecting the real repository:
// const result = await createOfficialDataJob(repository).run({ requestId });
```

`run` defaults to PE-22, generates a request ID when omitted, and accepts an
`AbortSignal`. Source calls share that request ID with the HTTP wrapper. The
default budget allows five history requests per run, configurable from zero to
twenty; each HTTP call retains the wrapper's timeout and retry budget. Schedule
the job every ten minutes and configure hosting time limits for the whole run.

`ok: false` indicates invalid options, an unavailable source, or an invalid
normalized batch; no writes are made for those failures. `ok: true` contains a
summary whose `status` can still be `partial`: inspect `sourceRejected`,
`conflicts`, `failed`, and `issues`. One failed record does not undo other
successfully committed records. Unexpected programming errors and cancellation
propagate, so the job boundary must handle them; earlier committed records may
remain and a retry must be safe.

## Required persistence semantics

These are logical storage requirements, not finalized table names or SQL:

| Logical record           | Identity and contents                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Current official alert   | Unique `(source, externalId)`, validated normalized alert JSON, `firstObservedAt`, `lastObservedAt`, and `historySynced` for the current revision.                                                     |
| Observed source revision | Unique `(source, externalId, sourceUpdatedAt)` with its normalized snapshot and retrieval timestamp. Handle null source timestamps explicitly as one unknown revision per alert.                       |
| Source history fact      | Unique canonical `sourceHistoryKey`: source, external ID, UTC occurrence timestamp, event type, and nullable raw road status. Retain the normalized history record, including null publication status. |

Use UTC timestamp storage and canonicalization; equal timestamp instants with
different offsets have the same identity. For nullable key fields, uniqueness
must treat matching null values as duplicates. Never rely on a nullable unique
column alone to enforce that requirement. The exported Zod schemas validate
stored JSON before the service uses it.

`findById` is a read used only to decide whether history needs fetching. The
authoritative read happens again inside `transaction(externalId, callback)`:

1. Serialize work for the source/external ID, including concurrent first inserts.
2. Read the latest committed state under that serialization.
3. Atomically save the current state, append its source revision, and dedupe/import
   history. All callback writes must commit together or all roll back on error.
4. Return the number of newly inserted history facts. Wrap expected database
   availability/validation failures in `OfficialAlertRepositoryError`; preserve
   unexpected programming errors.

Several independent HTTP writes to Supabase do not satisfy this transaction
contract. A's database adapter must provide an actual database transaction or an
equivalent atomic database operation that also preserves the locked revision
decision. Fetch provider data before entering the transaction; do not hold a
database lock during HTTP calls. Run equivalent concurrency and rollback checks
against the real database before considering durable ingestion complete.

The normalized source record deliberately has no application incident ID,
segment assignment, lifecycle state, or confidence score. A and C should agree
how these official records map to `incidents` and `incident_status_log`; this
service does not invent that mapping. Spatial joins can remain pending until
the PE-22 geometry exists.

## Revision, history, and fallback rules

- First observation inserts a snapshot. A newer known source timestamp updates
  it; an older revision is counted as stale and cannot overwrite current data.
- An identical revision refreshes `lastObservedAt` without another snapshot.
  Delayed polls cannot move freshness backwards. Changed content reusing the
  same revision is a conflict, retained in the run summary for investigation.
- A missing source timestamp cannot overwrite a known revision. An initially
  unknown revision can be upgraded when a known source timestamp arrives.
- History is fetched for a new/changed record or when `historySynced` is false.
  Partial, failed, or budget-deferred history leaves that flag false and the
  snapshot usable; later eligible polls retry enrichment. Persist valid history
  facts even if other facts were rejected. Discard facts for a different ID.
- History requests follow feed order. Persistent failures at the front of a feed
  can delay later history enrichment when the budget is exhausted; the run
  explicitly reports deferred records. Current snapshots are still processed.
- Empty feeds, missing records, and partial source responses never delete or
  clear previously stored records. A normal road status is retained as an
  official source fact, without automatically closing a merged incident.
- Publication facts with null status stay null. Validity dates are calendar
  dates; no event hour or closure duration is invented.

The application must display unavailable or partial states and cached-data age
from the stored observation timestamps when it integrates these results. A
successful empty feed does not refresh an absent record's observation time.
Summary logs contain counts and safe error categories, not provider payloads.

## Verification and remaining work

Run the package's lint, formatting, type check, offline tests, build, and export
checks from its README. Tests cover duplicate polls, source revision changes,
stale/out-of-order requests, conflicts, unknown timestamps, bounded enrichment,
partial history, source outages, cancellation, and transaction rollback using
the fake repository. These results establish the service behavior, not a
verified Supabase deployment.

Next: agree the physical schema with A, implement and verify durable
persistence, wire an authenticated server job, and enable the ten-minute n8n
schedule. No manual database connection is needed to run the current offline
tests; configuring Supabase will be required for the persistence adapter.
