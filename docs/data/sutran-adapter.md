# SUTRAN adapter

## Implemented boundary

This is the read-and-normalize part of member C's F8 ingestion work. It provides
an adapter for the current national alert list and individual alert history.
It has no dependency on Next.js, n8n, Postgres, or Supabase. It does not write to
the database, calculate risk, classify incident causes, send alerts, or infer
that a missing incident has cleared.

| File                                                         | Responsibility                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `packages/road-data/src/contracts/road-alerts.ts`            | Provider-independent alert and history types with shared Zod schemas, plus batch types. |
| `packages/road-data/src/integrations/sutran/schema.ts`       | Runtime validation of consumed SUTRAN fields using Zod.                                 |
| `packages/road-data/src/domain/road-data/parsing.ts`         | Pure calendar-date and kilometer parsing.                                               |
| `packages/road-data/src/integrations/sutran/normalize.ts`    | Pure conversion from validated source data to internal records.                         |
| `packages/road-data/src/integrations/sutran/adapter.ts`      | Fetch, validate, select records, and report data-quality issues.                        |
| `packages/road-data/src/integrations/http/json-transport.ts` | Shared JSON HTTP wrapper with bounded retries, timeouts, and structured logs.           |

The adapter is part of the independent `packages/road-data/` package, with its
own dependencies, lockfile, TypeScript, ESLint, and Vitest configuration. Its
[README](../../packages/road-data/README.md) contains commands and local-package
integration instructions. Member A owns the application's root setup; this
package does not introduce a root application manifest or workspace.

## Usage

```ts
import {
  createFetchJsonTransport,
  createSutranAdapter,
} from "@peruroad/road-data";

const adapter = createSutranAdapter({
  transport: createFetchJsonTransport(),
});

const alerts = await adapter.fetchCurrentAlerts(); // PE-22 by default
const history = await adapter.fetchAlertHistory(
  "98a4c1d9-b1ad-4069-aa26-33941df1f38b",
);

if (!alerts.complete) {
  // Retain the valid records, surface rejected indices, and mark this poll partial.
  // Neither missing nor rejected records imply that an earlier incident cleared.
}
```

The adapter uses the shared wrapper in `packages/road-data/src/integrations/http/`. Member A can
reuse or replace that implementation through the `JsonTransport` interface:

```ts
const adapter = createSutranAdapter({
  transport: {
    getJson: (url, options) => sharedHttp.getJson(url, options),
  },
});
```

The injected clock makes retrieval timestamps deterministic in tests. Both
methods accept an optional `AbortSignal` and `requestId` for correlated logs. `fetchCurrentAlerts` also accepts an
explicit `roadCode`; it always selects records whose source flags say they are
in force.

## Contract and semantics

- Alerts carry separate `externalId` (SUTRAN UUID) and `externalCode` (display
  code), the source entity, raw cause, location, road status, dates, and source
  update and retrieval timestamps. They do not assign a database ID, segment,
  incident type, lifecycle status, or confidence score.
- Road statuses preserve the plan's vocabulary: `interrumpido`, `restringido`,
  `normal`, and `unknown`. The source value is also retained. New upstream
  statuses are never silently interpreted as a normal road.
- In-force `normal` records are retained: SUTRAN includes reopened incidents in
  its current list. The source status is evidence for the later ingestion layer,
  not an automatic decision about a merged community incident.
- `DD/MM/YYYY` becomes `YYYY-MM-DD`, preserving a calendar date in Peru. No
  event hour or closure duration is inferred from a validity date. Explicit
  timestamp offsets are normalized to UTC.
- `KM 64+800` becomes `64.8` km; the original label remains available. Ambiguous
  labels and ranges produce a null kilometer. Missing coordinate pairs remain
  null; invalid or incomplete pairs are rejected.
- History is returned oldest first. Publication events can have a null road
  status; the adapter never fills that gap with an invented status.

Every result has `records`, `rejected`, `complete`, `receivedCount`,
`filteredCount`, `retrievedAt`, and `sourceUrl`. Rejected records are reported by
index and field issue, without echoing arbitrary source values. Extra upstream
fields are ignored. Missing consumed fields or invalid types are not coerced.

A failed envelope or changed root shape throws `SutranPayloadError`; it is not
returned as an empty result. Individual invalid records produce an explicitly
partial batch, even if no valid rows remain. A complete empty batch only means
the request contained no valid selected records; it does not prove the road is
open or previous incidents are cleared.

## HTTP behavior and integration ownership

The shared wrapper uses GET, JSON negotiation, an 8-second timeout per attempt,
cancellation, and `cache: no-store`. Idempotent GET requests receive at most two
retries for network failures, timeouts, HTTP 429, or HTTP 5xx. Backoff starts at
250 ms and doubles, with up to 250 ms of jitter. A `Retry-After` value is respected
when within the 30-second retry-delay budget; longer delays are surfaced to the
caller rather than ignored. Other HTTP errors and malformed JSON are not retried.

Each attempt emits a structured log with request ID, operation, provider,
duration, result, attempt number, and a safe error type when applicable. Logs
exclude URLs, provider payloads, and arbitrary network error messages. The
standalone CLI writes transport logs to stderr and the normalized result to stdout.

Keep the adapter free of additional retry loops. Poll SUTRAN at the planned
ten-minute interval; n8n should invoke an authenticated application job. Mapping
and persistence logic stay in version-controlled TypeScript.

### Visible fallback

| Provider | Failure                                            | Visible result                                                                                                                                                                                       |
| -------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SUTRAN   | Transport failure or unsupported response envelope | The CLI prints `state: unavailable` and a clear message, and exits with code 1. Future application consumers must show unavailable or explicitly dated cached data; no cache exists in this adapter. |
| SUTRAN   | Individual records fail validation                 | The CLI prints the partial batch with `complete: false` and rejected indices, and exits with code 1. Missing records never imply clearance.                                                          |

## Verified source behavior

Checked on **October 17, 2026** using these official service endpoints:

- [Current alerts](https://api.sigea.sutran.gob.pe/public/alerts): unauthenticated
  JSON envelope `{ success: true, data: [...] }`; the captured response contains
  12 national records, including 3 in-force PE-22 records (1 restricted and 2
  normal).
- [Example alert history](https://api.sigea.sutran.gob.pe/public/alerts/98a4c1d9-b1ad-4069-aa26-33941df1f38b/historial):
  event fields `fecha`, `tipo`, and `estadoNuevo`; the captured response includes
  a publication and a change to `normal`, newest first upstream.

Exact captures and provenance are in `packages/road-data/tests/sutran/fixtures/`. They are static
test data and do not indicate current travel conditions. Access succeeded without
a login, API key, or browser. These undocumented endpoints can change; terms of
reuse and availability guarantees remain unverified.

## Next integration step

The [ingestion service](sutran-ingestion.md) now implements source/external-ID
matching, version decisions, out-of-order protection, run accounting, and
partial-failure handling behind a transactional repository interface. It fetches
history on first observation, a source revision change, or an incomplete-history
retry, with a bounded request budget.

Durable Supabase persistence is now configured and verified; see the
[database handoff](../../supabase/README.md). Next, connect the authenticated
job endpoint and ten-minute n8n workflow. **No scheduled polling is configured.**
