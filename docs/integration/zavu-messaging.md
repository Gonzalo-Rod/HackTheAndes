# Shared WhatsApp integration

Member B's `feat/zavu-messaging` snapshot `47c8547` is integrated into
`feat/data-model`. Keep reviewing through PR #10; `main` still requires teammate
review and green CI. The branch contains the Zavu transport and acknowledgment
skeleton. It contained no LLM invocation; this integration adds a narrow OpenAI
intent parser and source-grounded query handlers.

## Supported behavior

- `ESTADO`: SUTRAN PE-22 records from the latest complete ingestion poll, with
  source time, stale/unavailable states and the no-clearance notice.
- `EXPOSICION` or `CLIMA`: the estimated 24-hour exposure summary, including
  assessed/unknown coverage, actual weather age and experimental-policy limits.
- `EXPOSICION <place>` or a native WhatsApp pin: resolve C's road context and
  show the matched segment's estimated exposure, rainfall window and terrain
  susceptibility, or request a clearer pin. Town names are not a complete
  gazetteer. Pins over 500 m from the captured road are rejected. Approximate
  matches are labeled and must be confirmed before future report/subscription use.
- Natural-language questions: the OpenAI adapter classifies intent and extracts
  a literal place reference. It never produces a road status, risk probability,
  coordinates or advisory. Deterministic services compose the answer from validated
  data. A missing key, timeout, refusal or invalid output offers explicit commands.
- Text reports now use the [confirmation and publication flow](whatsapp-reports.md):
  validated extraction, proposed/shared pin, explicit confirmation, then an
  unconfirmed community marker. `REPORTE PRUEBA` keeps a demo out of impact counts.
- Voice input, explicit subscriptions and conditional alerts now use the [notification integration](driver-notifications.md). Photos are excluded and SMS fallback remains disabled; operator-triggered incident calls are described below.

This integration does not complete all of Role B. Text-report publication and
community duplicate matching are implemented; full mixed-media grouping,
confidence/reputation/clearing and SUTRAN/community coalescing remain later work. Voice transcription and explicit subscription/alert policy are now implemented separately; no free-form LLM answer alone authorizes publication or consent.
The existing SUTRAN scheduler and independent API deployment remain unchanged.

## Recorded verification

On October 17, 2026, the participant confirmed receiving replies to `ESTADO` and
`EXPOSICION` after the receiving sender was pointed at the shared Preview running
`e429b61`. The runtime-log query returned two `inbound.reply` entries. All nine
CI/deployment checks passed for that runtime commit; 218 application tests and
38 application/data-package database checks passed locally.

This verifies the participant's query-delivery test. It does not establish
external-user traction, forecast accuracy, report publication or automatic alerts.
B's test project is retained. The setup below also documents how to repeat the
cutover when changing environments.

## Configuration and webhook cutover

Use ignored root `.env.local`, the database migrations and sensitive Vercel
variables for the **root `peruroad-climate` project**:

| Variable | Requirement |
| --- | --- |
| `ZAVU_API_KEY` | Server-only Zavu API credential. |
| `ZAVU_WEBHOOK_SECRET` | Signing secret of the **receiving WhatsApp sender**, `kd76yyks36tsq7jvdnfsnazjv58gfrc1`. The default outbound sender's earlier secret is not interchangeable. |
| `ZAVU_SENDER_ID` | Outbound sender, currently `kd7e0vxeb5xj78mwgbyeqwfae58gea42`. |
| `OPENAI_API_KEY` | Optional intent parser; explicit commands work without it. |
| `OPENAI_INTENT_MODEL` | Optional snapshot; defaults to `gpt-4.1-mini-2025-04-14`. |
| `PUBLIC_APP_URL` | HTTPS dashboard origin used in replies. Defaults to the shared feature Preview; set Production's origin before activating a Production webhook. |
| `DATABASE_URL`, `DATABASE_SSL_MODE` | Scoped server-only Postgres configuration. Required; there is no deployed in-memory completion fallback. |

The existing feature Preview already had the four provider variables configured;
this alone does not verify that the signing secret is the latest receiving secret.
The Zavu sender API does not return that secret for comparison.

After deploying and checking the unsigned request, the sender owner can change
**the receiving sender's** webhook URL to:

`https://peruroad-climate-git-feat-data-model-gozlie.vercel.app/api/webhooks/zavu`

Keep `message.inbound` and `message.failed`, signature **v2**, active. Do not delete
B's test deployment until a consenting phone verifies the shared deployment.
Provider webhook cutover and a real-user conversation are separate from mocked
transport tests; record their actual outcome before claiming delivery works.
Never copy secrets into chat or this document.

## Delivery and privacy

The handler bounds the streamed body to 256 KiB, verifies the raw-body v2 HMAC
with constant-time comparison and a five-minute timestamp window, then validates
Zavu JSON. SMS and unknown event types are ignored. `message.failed` is logged as
an error without the provider payload. Text is bounded to 4,096 characters;
unknown types and invalid coordinates are handled explicitly.

`private.messaging_deliveries` stores only provider, SHA-256 message key, lease
identity and timestamps. Browser roles have no access. An atomic 90-second lease
serializes inbound message IDs across instances and envelopes. No database client
is held during a provider call. Failed work releases its lease and returns 503;
a terminated invocation's lease becomes retryable after expiry. A completed row
survives restarts. Outbound replies carry stable Zavu idempotency keys, also
covering a send that succeeded before completion storage failed. Final delivery
still depends on provider retries and idempotency retention; this is not a queue
or a claim of exactly-once delivery across providers.

The HTTP response waits for the bounded query/send pipeline rather than returning
200 before volatile background work. This can exceed the sender's response timeout;
concurrent retries receive a retryable failure while the lease is active. A
future durable inbox/worker can shorten acknowledgment latency. Route duration is
60 seconds; the 90-second lease includes termination margin. Provider calls use
the shared eight-second wrapper. Zavu sends retry at most twice with a stable
idempotency key; OpenAI's billable POST is not retried automatically.

No phone, inbound content, media URL, provider error body or arbitrary exception
message enters logs or operational tables. Text sent to OpenAI has obvious phone
and email details redacted, carries no sender identifier, and uses `store:false`.
Media is not downloaded. Logs contain request IDs, operation, provider, duration
and safe result/error types. Synthetic tests do not count as user traction.

| Failure | Visible behavior |
| --- | --- |
| OpenAI absent, timeout, 429/5xx, refusal or invalid JSON | Spanish command help; no guessed intent or fabricated hazard answer. |
| SUTRAN storage/poll unavailable | Source unavailable; no inference of a clear road. Stale polls are explicitly dated. |
| Exposure database unavailable | Validated dated bundle with the same freshness projection. Missing/stale/unsupported exposure stays unavailable. |
| Zavu send timeout, rate limit, rejected send or closed WhatsApp window | Safe error log and retryable webhook failure; no silent success or unapproved alternate channel. Approved-template fallback is implemented for proactive alerts; pending approval never becomes an unapproved send. |
| Database lease storage unavailable | HTTP 503 and provider redelivery; never a cross-instance memory fallback. |

## Reproduce and verify

```sh
npm --prefix packages/road-data ci
npm --prefix packages/road-data run build
npm ci
npm --prefix packages/road-data run db:migrate -- --dry-run
npm --prefix packages/road-data run db:migrate
npm run lint
npm run format:check
npm run typecheck
npm test
npm run test:db
npm run build -- --webpack
```

Database tests use synthetic keys and clean them afterward. Offline tests cover
signature failures/replay, duplicate envelopes, failed-send redelivery, intent
refusal/invalid output, source outages, unknown coverage and stale exposure.
A live synthetic intent check confirms API connectivity only. Real message
acceptance, replies and source content must be checked on a consenting phone after
cutover. Keep any phone details out of logs, screenshots and committed fixtures.

Protocol references: [Zavu webhook security](https://docs.zavu.dev/guides/receiving-messages/security),
[Zavu sending](https://docs.zavu.dev/api-reference/send-a-message),
[OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

## Dated dashboard estimates

`EXPOSICION` now links to `?vista=pronostico`, where the dashboard displays
possible-huaico estimates in six-hour windows with approximate mapped kilometer
ranges, rainfall, susceptibility and uncertainty. WhatsApp alert eligibility
continues to use the 24-hour summary; the finer dashboard windows are conditions
for attention, not predicted occurrence times. See the
[forecast integration guide](dashboard-forecast.md).

## Incident report calls

`npm run zavu:call-incident -- <E.164> [--dry-run]` reads the latest complete SUTRAN
PE-22 poll, chooses the most relevant current incident (closures, then restrictions,
newest first; expired and not-yet-valid records are skipped), and places a one-way
Spanish text-to-speech call through Zavu (`POST /v1/messages`, `channel: "voice"`,
no SMS fallback), followed by the same facts on WhatsApp. The call states the source
time, marks stale data as possibly outdated, never claims other stretches are clear,
and is not placed when the source is unavailable or no incident is current. A stable
idempotency key per incident and recipient prevents a rerun from dialing twice.
Zavu's conversational Voice Agent (`POST /v1/calls`) is not used because it stayed
silent in earlier checks. Only call a number whose owner consented; unverified
accounts are limited to 5 voice sends a day. This is a manual operator trigger; automatic
calls to transport monitors are described in [route watch](route-watch.md).

On October 17, 2026 at 23:13 (Lima), a call to the participant's consenting phone
reporting the active km 51 SUTRAN incident was accepted by Zavu (status `sent`), and
the WhatsApp follow-up reached `delivered`. Whether the call was heard as intended
is pending the participant's confirmation.
