# Platform API and integration handoff

A's non-payment application lives in the root Next.js project after the authorized
integration of D's `400bb8d` snapshot. C remains in `packages/road-data`; the older
`apps/api` deployment and active n8n SUTRAN schedule are independent.

## Routes and consumers

All responses use `Cache-Control: no-store`, a request identifier, bounded validated
input and safe `{ error: { code, message } }` failures. See the actual shared schemas
in `src/contracts/platform.ts` and `src/contracts/road-alerts.ts`.

| Endpoint | Access | Behavior |
|---|---|---|
| `GET /api/incidents` | Public | Sanitized PE-22 operational incidents. D's map combines them with its official SUTRAN feed. Community reports are explicitly unconfirmed. |
| `GET /api/incidents/:uuid` | Public | Structured status history only; no report text, sender identity, or encrypted content. |
| `GET /api/segments` | Public | C's pinned geometry revision, terrain elevations, and explicit geometric-distance reference. |
| `GET /api/catchments` | Public | Coarse upstream HydroBASINS polygons with weights, dates and low-confidence notice; dated bundled fallback on DB failure. See [catchment handoff](data/pe22-catchments.md). |
| `GET /api/corridor` | Public | D's corridor contract adapted to C's segments. Town positions remain approximate OSM references; an explicitly dated bundled fallback survives DB outages. |
| `GET /api/realtime` | Public | Supabase URL and **publishable** key only. The subscription reads `incident_updates`, a singleton change signal. |
| `GET /api/stats` | Public | Product counts, exclusions and observation time. `/impacto` renders these and the waitlist. |
| `POST /api/waitlist` | Public, durable quota | Consented company contact; AES-256-GCM phone storage, HMAC matching, transactional request-ID deduplication. |
| `POST /api/access` | Public, durable quota | High-entropy company code → signed, HttpOnly, SameSite=Strict, Secure-on-HTTPS cookie. No code or token in response JSON. |
| `GET /api/company` | Signed cookie + active pass | Organization session and current entitlement. |
| `GET /api/company/reports` | Signed cookie + active dashboard pass | Only that organization's schema-validated reports. Empty until C generates them. |
| `GET /api/risk?horizonHours=24\|72` | Public | 400 for invalid inputs; currently 503 `model_unavailable`. |
| `POST /api/dispatch-decision` | Signed cookie + predictions pass | Currently 503 until C's engine is integrated. No fabricated decision is returned. |

The company page is a public UI shell. Every request for company data rechecks the
signed cookie and the live database entitlement; HTML visibility is not an access
control. A dashboard pass does not authorize predictions. Expiry is exclusive and
checked in UTC, including a pass expiring during a trip. Session lifetime is capped
at four hours and at pass expiry. A seeded demo pass is test data, never a sale.

Public writes accept at most 4 KiB and reject cross-origin browser requests. Both
waitlist and access have five attempts per 15-minute window, stored atomically in
Postgres so limits survive process restarts. Keys contain HMAC digests, never IPs.
Only the Vercel runtime trusts `x-vercel-forwarded-for`, which its edge overwrites;
other hosts use one conservative shared bucket. See [Vercel's request headers](https://vercel.com/docs/headers/request-headers).

## B's integration points

B's branch is not available yet. Its existing deployed, read-only road-context
contract is documented separately in [the road-data package](../packages/road-data/README.md).
After B's code is integrated, use these application helpers:

- `src/integrations/security/contacts.ts`: normalize/HMAC a phone, encrypt a delivery
  reference with a random 12-byte IV and authenticate it with a 16-byte GCM tag.
  Keep encryption keys, pepper and provider webhook secrets independent.
- `src/integrations/security/webhook.ts`: constant-time raw-byte HMAC verification
  and a bounded timestamp check. Supply the provider's documented canonical bytes
  and signature format; no Zavu-specific signature behavior has been assumed.
- `src/db/request-limits.ts`: persistent provider/event-ID claim. Couple the claim
  to the business write in the **same database transaction**; a standalone claim
  before fallible processing can lose a retry. Queue/outbox behavior belongs to B's
  processing flow and has not been implemented here.
- `src/db/usage.ts` + `src/contracts/usage.ts`: record `query_answered` only after a
  successful response to a user. Provider event ID makes retries idempotent.
  Set team, test and automation flags explicitly; never send message text or phones.
- `src/domain/access/entitlements.ts`: pure pass checks for organization or phone-key
  subjects and a requested feature. Routes must recheck server-side.

Cryptographic choices follow [Node.js crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html).
No incoming B webhook, transcription, confidence calculation or alert delivery is
claimed until B's code is connected and exercised.

## Realtime and metrics

The migration publishes only `public.incident_updates` to Supabase Realtime. A
statement trigger on operational incidents increments its revision. Browser roles
can select that signal under RLS but retain no access to operational tables or
private data. Subscribers invalidate and reload the sanitized API; disconnected
clients visibly fall back to a one-minute poll. See [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).

Impact counts exclude team/test report flags, opted-out subscriptions, team/test
company flags, team/test trips and dispatches, automated usage events, and configured
`TEAM_PHONE_KEYS`/`TEST_PHONE_KEYS`. Retention counts distinct phone keys with more
than one report/query activity; retries do not count as another query. Waitlist
companies are grouped by trimmed case-insensitive company name. Calls answered use
the stored exact status `answered`; B must map provider statuses to that value.
Ingestion jobs and raw page/API requests are never product usage events. Interview
counts and predictive efficacy are not inferred from traffic. Before real outreach,
configure the team's HMAC identifiers so their waitlist and subscriptions are excluded.

## Verification and remaining dependencies

Default tests use fakes and no network. The opt-in database suite checks SQL reads,
concurrent quotas, waitlist idempotency and encryption, webhook claims, RLS privileges,
and metric exclusions. CI applies all migrations to a fresh PostGIS database and
imports the committed PE-22 geometry before those checks.

A's risk/dispatch boundaries and report access control are ready for C's outputs;
catchment fallback preparation is implemented; catchment weather, model, dispatch and report generation remain pending.
The participant requested a checkpoint before ML selection/training. Main remains
unmerged until teammate review and passing CI. Payments, Qatom and payment
administration are explicitly excluded.

`npm audit` currently reports a development-only `braces` advisory through
`eslint-config-next` (`GHSA-vfj7-8cjw-p6xm`), with no patched `braces` release in the
registry when checked. The suggested automatic fix downgrades Next's lint package
across major versions; it is not applied. Do not run lint over untrusted glob
patterns, and revisit the dependency when a compatible upstream patch is available.
