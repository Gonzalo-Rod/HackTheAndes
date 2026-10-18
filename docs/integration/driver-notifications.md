# Voice input, subscriptions and driver alerts

The participant's current policy is **notify on newly detected route events and
material changes, retain estimated possible-huaico alerts, and use no quiet hours**.
This supersedes the former 30-minute evaluation/delivery cooldown. Public community
reports now qualify without a confidence threshold, always labeled **SIN CONFIRMAR**;
the score is not evidence of verification. Team/DEMO isolation remains in force.
Photos, video, voice replies and calls are outside this implementation.

## Driver flow

1. Send a text or Spanish voice note. Voice input becomes text before the existing
   query/report router; publication still requires the typed `CONFIRMAR <code>`.
2. Send `RUTA` (or `RUTA PRUEBA` for DEMO) and provide the **origin**, then the
   **destination**. Each endpoint can be a static WhatsApp pin within 500 m of the
   captured PE-22 axis, a uniquely resolved catalog landmark, or `KM 50.5` using
   approximate **map distance**, never an official road marker. Unknown places ask
   for a pin; no fallback silently expands the route. Coordinates are snapped once,
   not tracked continuously, and raw pins are not stored in the route proposal.
   Forward/reverse travel uses the same interval on the single captured road axis;
   this does not calculate alternative roads, departure recommendations or an ETA.
   `SUSCRIBIR` retains the whole-corridor option and named-endpoint compatibility.
3. Review the proposed range and delivery terms, then type `ACTIVAR <code>`.
   The proposal expires in 30 minutes. A natural-language request alone does not
   create a subscription. Existing alerts continue while a replacement is drafted.
   `RUTA CANCELAR` discards either the endpoint draft or final activation proposal;
   bare `CANCELAR` discards an active endpoint draft. Queries work during setup;
   a new `REPORTE` asks the driver to finish/cancel the route to avoid pin ambiguity.
   Route replacement clears the old route's weekly PDF authorization; authorize
   `SEMANAL` separately for the new range.
4. `BAJA` or `STOP` cancels consent, pending requests and queued alerts, and disables
   the encrypted delivery reference. New consent can reactivate it. An already
   accepted in-flight provider message cannot be recalled.

Only consenting subscribers with a current weekly pass receive proactive messages.
The October 18 authorization adds a one-time USD 0.001 Qatom purchase for seven
elapsed days from the original request, using OpenAI Responses and Qatom MCP;
see [payment setup and verification](qatom-alert-passes.md). Existing `SUSCRIBIR`
and `RUTA` flows now request payment after typed consent; `SUSCRIBIR 7 DIAS`
explicitly requests the weekly corridor pass. `PAGAR` provides the checkout link
and `PAGO` checks status. No automatic renewal is created. One active
PE-22 subscription per identity is supported; a newly paid range replaces it.

## Alert eligibility and noise control

Alert evaluation runs after a community publication transaction commits (Next.js
`after`), after a confirmed complete SUTRAN poll, and after an hourly climate job.
The source workflows enqueue the same internal alert sub-workflow without waiting
for it; that worker calls the authenticated `/api/jobs/alerts` endpoint;
background publication invokes the shared server service directly. Source detection
still follows SUTRAN's ten-minute polling and the weather capture's hourly cadence;
this is not an instantaneous upstream feed or the dashboard's browser polling rate.

The former alert timer is now a **five-minute recovery/reconciliation job** for
missed background work, retryable provider delivery and overflow. It sends no
heartbeat or unchanged-condition message. A failed background call logs a visible
recovery reason without undoing the committed report. Successful delivery has no
30-minute cooldown; fingerprints and transactional leases suppress duplicates.
Up to three newly reported events are bundled before climate-only backlog. Changed
climate segments share one short notice (first three ranges plus an explicit count
of additional ranges); their full delivered baseline is checkpointed. Unsent
reported-event overflow stays eligible for the next evaluation. Retries reuse the
same provider key and recheck current source eligibility and consent.

- **SUTRAN:** a fresh complete source poll, a mapped location inside the captured
  corridor, and an explicit changed condition. Initial normal status is a baseline;
  a later explicit return to normal is attributed to SUTRAN and does not certify a
  safe road. Disappearing or stale records never establish clearance.
- **Estimated climate exposure:** a fresh database assessment, supported segment,
  complete required inputs and an escalation to `priority` or `high_attention`.
  An unchanged category is silent even when a new forecast batch arrives. The
  driver notice gives approximate kilometer ranges and the forecast end time in Peru time,
  with a short estimated/not-confirmed warning. `EXPOSICION` supplies rainfall, source
  times, susceptibility and experimental association details. It is not a probability.
- **Community:** active public reports are eligible as **unconfirmed reports**,
  even at the initial 0.2 score. The full confidence/clearing model remains pending;
  alerts never upgrade that score to verified evidence. Non-test team incidents
  remain excluded, and explicit DEMO incidents only reach test subscriptions.
  Test/team traffic stays out of impact counters. Dedupe means another report for
  the same unchanged incident does not send a duplicate alert.
- **SENAMHI:** automated advisories remain disabled until the captured products have
  verified temporal eligibility. They remain visible as separate official context.

Unknown data preserves the last known notification baseline; it is not a decrease
or a clearance. Pending messages are cancelled if their source condition changes or
is no longer eligible, and expire at their source validity boundary.

## Short driver notices

Notifications use deterministic plain Spanish, not LLM paraphrasing. One climate
explanation covers the selected updates. Per the participant's preference, climate
notices use approximate kilometer ranges instead of requiring a named landmark;
separate ranges stay separate, so unsupported gaps are never presented as assessed.
These are distances from the mapped route's origin, labeled **km aprox. del mapa
(no oficiales)**. Official road-kilometer calibration remains unavailable.
Road-condition and community notices can still use nearby catalog landmarks from
the same geometry revision, within 2 km along the segment and explicitly approximate.
Never invent a town or translate an uncalibrated distance into a highway marker.
Forecast validity uses `America/Lima`, without raw UTC timestamps or internal
category names. The up-to-three-update bundle stays within 650 characters;
`ESTADO` and `EXPOSICION` provide the detailed evidence and map links. DEMO,
SUTRAN and unconfirmed-community labels, uncertainty and `BAJA` remain visible.

The original three-segment example becomes:

```text
DEMO · PeruRoad · PE-22
Atención por lluvias · km aprox. del mapa: 2–3, 4–5, 10–11 (no oficiales).
Hasta 18/10, 21:00 (hora Perú).
Lluvia prevista en zonas propensas a huaicos o derrumbes. Es una estimación, no un evento confirmado.
Antes de salir, consulta ESTADO. EXPOSICION: detalles. BAJA: cancelar.
```

This is a formatting example using mapped segment ranges, not a new observed event.
Presentation changes do not reset condition checkpoints or trigger new alerts.
Already pending deliveries retain their original body/provider key for safe retry.

## WhatsApp delivery

Inside the local 24-hour service-window estimate, send ordinary text. Zavu's own
window enforcement remains authoritative. Outside the window, or after its closed-
window response, send only the configured **approved utility template**. Approval
is checked with Zavu before sending. The summary can be shortened for the template;
`ESTADO` provides the full dated context.

The `peruroad_route_alert_v1` template was submitted to Meta; approval is asynchronous
and must be checked in Zavu. Pending/rejected approval leaves deliveries pending
until a subsequent eligible attempt or expiry. The confirmation explains this and
keeps `ESTADO`/`EXPOSICION` available. SMS fallback is disabled: there is no separate
SMS consent in this implementation. No subscription creates consent for phone calls.

## Audio boundaries

The adapter resolves the inbound audio message by ID through authenticated Zavu
metadata. It does not trust webhook media URLs. HTTPS storage hosts are explicitly
restricted, credentials/ports and redirects are rejected, and streaming stops at
8 MiB. OGG, MPEG, MP4/M4A, WAV and WebM audio are supported; OGG has a header check.
A missing/pending URL, unsupported format or provider failure gives a Spanish text
fallback without publishing a report. New verified storage hosts require review.

`gpt-4o-mini-transcribe` uses the existing OpenAI key, a Spanish language hint and
validated text output; billable transcription POSTs are not automatically retried.
Successful transcripts are encrypted in the database to avoid repeated uploads on
webhook retries. Audio is not retained by this application. Five uncached audio
messages per identity per 15 minutes bound cost. Model transcription can be wrong;
location/publication confirmation remains required. Synthetic fixtures do not
establish real-driver transcription accuracy.

## Modules and operations

- `src/services/audio/`, `src/integrations/zavu/audio.ts` and
  `src/integrations/openai/transcriber.ts`: bounded input and transcription adapters.
- `src/services/subscriptions/` and `src/db/subscriptions.ts`: explicit consent,
  encrypted delivery references, durable replay and opt-out.
- `src/domain/alerts/`: deterministic change/range/bundle rules with injected time.
- `src/services/alerts/` and `src/db/alert-deliveries.ts`: source eligibility,
  consent recheck, delivery leases, retry keys, cooldown and durable checkpoints.
- `POST /api/jobs/climate`: hourly weather refresh on C's reviewed grid/spatial plan;
  stores weather and a new reproducible immutable assessment. Failures retain the
  previous dated data. No static hazard map is silently represented as refreshed.
- `POST /api/jobs/alerts`: collect eligible changes and evaluate active subscriptions.
  Both endpoints require the existing `ROAD_DATA_JOB_SECRET` bearer credential.
- `workflows/n8n/driver-alerts.sdk.js` and `climate-refresh.sdk.js`: independent
  schedules; a weather-provider failure does not disable the separate road-alert job.

Apply the fourteenth additive migration through [the database operator setup](../../supabase/README.md).
Build C before installing the app after C export changes:

```sh
npm --prefix packages/road-data run build
npm ci
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build -- --webpack
```

`OPENAI_TRANSCRIPTION_MODEL` and `ZAVU_ALERT_TEMPLATE_ID` are optional validated
configuration; the job secret is required at webhook/job setup. Variables and
credentials belong in local/hosting secret stores. Never put phones, audio, tokens
or message bodies into n8n node parameters or progress logs. n8n receives only
aggregate job counts and assessment identifiers.

Draft/proposal expiry does not automatically erase encrypted rows. Prune expired
unlocked proposals/transcript and response caches under the documented operator
retention policy (initial cache policy: seven days), while retaining completed
webhook and delivery keys needed to prevent replay. Historical consent and delivery
state is server-only and never returned to browser roles.

## Route storage and operational setup

Apply `20261018044500_route_alert_intake.sql` with the existing database operator.
Route proposals live in `private.route_intake`, with authenticated encryption,
30-minute expiry, server-only RLS and no browser privileges. Commands reuse encrypted
replay results and the per-sender transaction lock. A proposal ID/origin check rejects
stale concurrent endpoint updates. Completed routes reuse the existing subscription
range and delivery outbox, so no new credential or routing provider is required.
Expired encrypted proposals follow the same pruning policy as subscription drafts.

The n8n SUTRAN and climate workflows append a non-blocking sub-workflow invocation;
the original alert workflow accepts those source changes plus recovery every five
minutes. Caller access is limited to those two source workflows. Reuse the existing
Header Auth credential inside the worker. This instance caps workflows at 180
seconds, so ingestion keeps its 150-second budget, climate refresh keeps 130
seconds, and alert delivery gets its own 180-second run; all are below their
schedule intervals. A successfully queued child is not proof that a message sent;
inspect the child execution and delivery outbox separately.
Webhook processing allows up to 180 seconds including background notification work.
Weekly PDF schedules and consent remain separate. Outside-window delivery still
requires a provider-approved alert template; lack of approval leaves work pending.
