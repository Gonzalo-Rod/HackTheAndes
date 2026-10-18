# Voice input, subscriptions and driver alerts

The participant's current policy is **evaluate every 30 minutes, send only material
updates, and use no quiet hours**. This supersedes the earlier 22:00–05:00 rule.
Photos, video, voice replies and calls are outside this implementation.

## Driver flow

1. Send a text or Spanish voice note. Voice input becomes text before the existing
   query/report router; publication still requires the typed `CONFIRMAR <code>`.
2. Send `SUSCRIBIR` for the available PE-22 axis, or
   `SUSCRIBIR Chosica–La Oroya` for two uniquely resolvable catalog endpoints.
   Distances follow the captured geometry; official kilometer calibration remains
   unavailable. An unresolved stretch never becomes the whole corridor silently.
3. Review the proposed range and delivery terms, then type `ACTIVAR <code>`.
   The proposal expires in 30 minutes. A natural-language request alone does not
   create a subscription. `SUSCRIBIR PRUEBA` creates an explicit test subscription.
4. `BAJA` or `STOP` cancels consent, pending requests and queued alerts, and disables
   the encrypted delivery reference. New consent can reactivate it. An already
   accepted in-flight provider message cannot be recalled.

Only consenting subscribers receive proactive messages. Replies and subscriptions
use existing messaging/privacy configuration; payments remain excluded. One active
PE-22 subscription per identity is supported; a newly confirmed range replaces it.

## Alert eligibility and noise control

The authenticated job checks every 30 minutes. There is no "everything is fine"
message and no heartbeat to the driver. Successful deliveries have a rolling
30-minute minimum interval. Up to three material updates are bundled; overflow
remains eligible on a later evaluation. Retries reuse the delivery's provider key.

- **SUTRAN:** a fresh complete source poll, a mapped location inside the captured
  corridor, and an explicit changed condition. Initial normal status is a baseline;
  a later explicit return to normal is attributed to SUTRAN and does not certify a
  safe road. Disappearing or stale records never establish clearance.
- **Estimated climate exposure:** a fresh database assessment, supported segment,
  complete required inputs and an escalation to `priority` or `high_attention`.
  An unchanged category is silent even when a new forecast batch arrives. The
  driver notice gives the approximate location and forecast end time in Peru time,
  with a short estimated/not-confirmed warning. `EXPOSICION` supplies rainfall, source
  times, susceptibility and experimental association details. It is not a probability.
- **Community:** initial unconfirmed reports have confidence 0.2 and do not trigger
  production alerts. The release's conservative notification gate is 0.7; the full
  confidence/clearing model is still pending. Explicit DEMO incidents can exercise
  delivery only to explicitly consenting test subscriptions; team/test traffic stays
  out of impact counters. Community messages retain `NO CONFIRMADO` attribution.
- **SENAMHI:** automated advisories remain disabled until the captured products have
  verified temporal eligibility. They remain visible as separate official context.

Unknown data preserves the last known notification baseline; it is not a decrease
or a clearance. Pending messages are cancelled if their source condition changes or
is no longer eligible, and expire at their source validity boundary.

## Short driver notices

Notifications use deterministic plain Spanish, not LLM paraphrasing. One climate
explanation covers the selected updates; repeated nearby landmark labels appear
once. Names come only from the same geometry revision's imported catalog, within
2 km along the road segment, and are explicitly approximate. Where no landmark
qualifies, retain distance from the map origin with **not official kilometers**;
never invent a town or translate an uncalibrated distance into a highway marker.
Forecast validity uses `America/Lima`, without raw UTC timestamps or internal
category names. The up-to-three-update bundle stays within 650 characters;
`ESTADO` and `EXPOSICION` provide the detailed evidence and map links. DEMO,
SUTRAN and unconfirmed-community labels, uncertainty and `BAJA` remain visible.

The original three-segment example becomes:

```text
DEMO · PeruRoad · PE-22
Atención por lluvias: cerca del puente CARLOS GRAÑA; cerca del puente HUACHIPA.
Hasta 18/10, 21:00 (hora Perú).
Lluvia prevista en zonas propensas a huaicos o derrumbes. Es una estimación, no un evento confirmado.
Antes de salir, consulta ESTADO. EXPOSICION: detalles. BAJA: cancelar.
```

This is a formatting example using catalog landmarks, not a new observed event.
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
