# Platform API and integration handoff

A's non-payment application lives in the root Next.js project after the authorized
integration of D's `400bb8d` snapshot. C remains in `packages/road-data`; the older
`apps/api` deployment and active n8n SUTRAN schedule are independent.

The participant-approved [climate-exposure plan](data/climate-exposure.md) retains
live conditions and driver WhatsApp alerts. The assessment and persisted public
read are implemented at `/api/exposure`; driver alerts and the
[dated dashboard forecast view](integration/dashboard-forecast.md) now consume these assessments. Existing risk/dispatch unavailable
responses and source-data contracts below are unchanged. Estimated exposure,
official advisories and confirmed incidents must remain distinct when those
consumers are updated. Disruption-classifier training is deferred research.

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
| `GET /api/weather/catchments` | Public | Capture-anchored catchment rainfall history and forecast windows, with dated fallback. |
| `GET /api/hazards` | Public | Static susceptibility and official warnings; separate from model risk. |
| `GET /api/exposure?horizonHours=24\|72` | Public | Estimated climate attention, provenance, 24/72-hour and six-hour windows. Validated DB/bundle reads; stale/future categories masked to unknown. Fresh usable database assessments can trigger conditional alerts; stale/snapshot inputs are ineligible. |
| `GET /api/history/events` | Public | Sanitized candidate events with incomplete-coverage/training flags. |
| `GET /api/hazards/warnings` | Public | Live SENAMHI quebrada-activation warnings for all of Peru (10-minute cache, then last live result, then the dated capture). Official levels only. See [national layers](data/national-layers.md). |
| `GET /api/weather/national` | Public | Open-Meteo model rain on a 0.75° grid over Peru (hourly cache; stale flag on provider failure; incomplete cells omitted). |
| `GET /api/history/road-events` | Public | Nationwide Provías emergencies (Jan–Apr 2024 and 2025), display-only and labeled incomplete; not training labels or current alerts. See [national road events](data/national-road-events.md). |
| `GET /api/history/weather?dataset=...` | Public | Allowlisted archived forecasts, retrospective references and Yaku reconstruction. See [model inputs](data/model-inputs.md). |
| `GET /api/corridor` | Public | D's corridor contract adapted to C's segments. Town positions remain approximate OSM references; an explicitly dated bundled fallback survives DB outages. |
| `GET /api/realtime` | Public | Supabase URL and **publishable** key only. The subscription reads `incident_updates`, a singleton change signal. |
| `GET /api/stats` | Public | Product counts, exclusions and observation time. `/impacto` renders these and the waitlist. |
| `POST /api/waitlist` | Public, durable quota | Consented company contact; AES-256-GCM phone storage, HMAC matching, transactional request-ID deduplication. |
| `POST /api/access` | Public, durable quota | High-entropy company code → signed, HttpOnly, SameSite=Strict, Secure-on-HTTPS cookie. No code or token in response JSON. |
| `GET /api/company` | Signed cookie + active pass | Organization session and current entitlement. |
| `POST/GET /api/company/trips`, `DELETE /api/company/trips/:id` | Signed cookie + active dashboard pass | Register, list and stop route watches (truck trip or continuous). See [route watch](integration/route-watch.md). |
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

B's `47c8547` snapshot is integrated into the shared application; see the
[WhatsApp integration](integration/zavu-messaging.md). Its independent read-only
road-context contract remains documented in [the data package](../packages/road-data/README.md).
Use these application helpers for the remaining report/subscription work:

- `src/integrations/security/contacts.ts`: normalize/HMAC a phone, encrypt a delivery
  reference with a random 12-byte IV and authenticate it with a 16-byte GCM tag.
  Keep encryption keys, pepper and provider webhook secrets independent.
- `src/integrations/security/webhook.ts`: constant-time raw-byte HMAC verification
  and a bounded timestamp check. Supply the provider's documented canonical bytes
  and signature format. The integrated Zavu adapter requires timestamp-bound v2 signatures.
- `src/db/request-limits.ts`: persistent provider/event-ID claim. Couple the claim
  to the business write in the **same database transaction**; a standalone claim
  before fallible processing can lose a retry. Queue/outbox behavior belongs to B's
  processing flow and has not been implemented here.
- `src/db/webhook-processor.ts`: expiring delivery leases plus durable completion,
  without holding a transaction open during provider calls. Used by the query webhook.
- `src/db/usage.ts` + `src/contracts/usage.ts`: record `query_answered` only after a
  successful response to a user. Provider event ID makes retries idempotent.
  Set team, test and automation flags explicitly; never send message text or phones.
- `src/domain/access/entitlements.ts`: pure pass checks for organization or phone-key
  subjects and a requested feature. Routes must recheck server-side.

Cryptographic choices follow [Node.js crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html).
The signed webhook and source-grounded query handlers are implemented and tested.
Voice transcription, explicit subscriptions and conditional alert delivery are implemented; full confidence remains pending. [Weekly driver PDFs](integration/weekly-environmental-pdf.md) add separate consent and attachment delivery.
Text-report publication uses [explicit reporter confirmation](integration/whatsapp-reports.md). The participant confirmed both source-query replies after shared webhook
cutover; see the [recorded verification](integration/zavu-messaging.md#recorded-verification).

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
catchment weather, spatial overlays and historical candidates now have validated
read APIs and dated outage fallbacks. Hourly weather/exposure automation is implemented; ML training and dispatch are deferred. Weekly driver-PDF generation uses a separate protected outbox; see the [ML checkpoint](data/ml-readiness.md).
The participant requested a checkpoint before ML selection/training. Main remains
unmerged until teammate review and passing CI. Payments, Qatom and payment
administration are explicitly excluded.

`npm audit` currently reports a development-only `braces` advisory through
`eslint-config-next` (`GHSA-vfj7-8cjw-p6xm`), with no patched `braces` release in the
registry when checked. The suggested automatic fix downgrades Next's lint package
across major versions; it is not applied. Do not run lint over untrusted glob
patterns, and revisit the dependency when a compatible upstream patch is available.

## Messaging and LLM credentials

`POST /api/webhooks/zavu` requires a valid v2 raw-body signature and timestamp.
Unsigned requests return 401; invalid/oversized data returns 400/413, duplicate
completed messages return 200, and unavailable processing/delivery returns 503
for provider retry. Only WhatsApp inbound messages run the query handlers.

The root `.env.example` lists `ZAVU_API_KEY`, `ZAVU_WEBHOOK_SECRET`,
`ZAVU_SENDER_ID` and `OPENAI_API_KEY`. Actual values belong in ignored root
`.env.local` and Vercel sensitive environment variables, never browser-prefixed
variables, source code or documentation. They are intended for the root
`peruroad-climate` application; the independent `peruroad-api` ingestion project
does not currently consume these providers. On October 17, 2026, all four were
configured as sensitive variables for the `feat/data-model` Preview only.
The [shared WhatsApp integration](integration/zavu-messaging.md) implements the
signed webhook, durable delivery leases, Zavu replies and a structured OpenAI
intent parser backed by C's source services. Text reports now publish after explicit location/code confirmation. Voice processing, subscriptions and conditional alerts are implemented; photos remain excluded. The participant confirmed receiving both `ESTADO`
and `EXPOSICION` replies from the shared deployment on October 17, 2026; this is a
query-delivery check, not external-user traction or report/alert verification.
