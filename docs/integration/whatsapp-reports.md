# WhatsApp text reports to the map

This step connects a driver's text observation to an unconfirmed community marker.
The signed Zavu webhook, query handlers and existing dashboard remain in place.
Voice notes now enter this same flow through [the audio/subscription integration](driver-notifications.md). Photos are excluded; full confidence and official/community coalescing remain separate work.

## Conversation

1. Send `REPORTE` followed by what you are observing. Natural-language reports also
   use the intent router. Use `REPORTE PRUEBA` for a team demonstration.
2. A structured OpenAI extraction supplies only the reported type, literal place,
   stated kilometer/direction, severity, affected lanes and whether it is active.
   Unknown fields stay null. Missing type/current observation prompts a follow-up.
3. A unique gazetteer match proposes a location; otherwise share a native WhatsApp
   pin. Pins over 500 m from the available PE-22 axis are rejected. Kilometer
   references do not substitute for calibrated coordinates.
4. Review the approximate pin link. Reply `CONFIRMAR <code>` to confirm that location,
   the active observation and publication as an **unconfirmed community report**.
   `CANCELAR` discards the draft. A bare acknowledgment does not publish anything.
5. Receive a map link. The marker says **no confirmado**, has an unknown road
   status and identifies community provenance. The existing Realtime signal updates
   open dashboards; the 60-second polling fallback remains available.

Codes change after a draft edit or replacement pin, preventing an older confirmation
from publishing revised details. Drafts expire at 30 minutes, including at the exact
boundary. An explicit new `REPORTE` starts a fresh draft. Ordinary status/exposure
commands preserve the pending report. A location without a draft remains an exposure
query. A transcribed voice note can continue a draft; photos cannot replace or publish it.

The location is what the reporter confirms, not live GPS tracking or independent
verification. Model output and the user's confirmation never become official road
clearance or an authority-confirmed closure. Historical/cleared reports are not
published as new active incidents by this step.

## Publication and duplicate matching

Within one database transaction, save the encrypted source report, create/link its
incident, append the status event, update the draft and save the encrypted reply.
A retry after a failed acknowledgment returns that same reply without another
publication. The report's original provider message ID is also unique in storage.

Matching currently covers **active community incidents** of the same type, within
2,000 m and three hours, under the same geometry revision and test/team classification.
Those distance/time boundaries come from Team Plan F1. A short per-type database
lock serializes simultaneous first publications from different reporters. A matching
report adds evidence to the existing incident; repeated messages from one identity
do not increase the independent-reporter count.

The initial confidence value is a conservative, fixed **0.2 placeholder for
unverified evidence**, not a probability. More reports do not automatically verify
the incident or change its road status. B's full confidence/reputation/clearing policy
and coalescing community evidence with SUTRAN remain later work. Official SUTRAN
records and their statuses remain separate and unchanged.

`REPORTE PRUEBA` produces a visible DEMO marker and sets `is_test` on reports and
incidents, excluding it from impact counts. Configured team/test phone keys are
also respected. An ordinary report must not be used to manufacture traction.

## Modules and setup

- `src/contracts/reports.ts`: validated extraction, draft and repository contracts.
- `src/domain/reports/`: deterministic normalization, prompts and duplicate rules.
- `src/services/reports/report-flow.ts`: conversational use case.
- `src/integrations/openai/report-extractor.ts`: provider adapter behind `ReportExtractor`.
- `src/db/report-conversations.ts`: encrypted state, leases and replay journal.
- `src/db/report-publication.ts`: transactional report/incident persistence.

No new provider credential is required. The existing root OpenAI, Zavu, scoped
Postgres and platform encryption/HMAC variables are used. The existing optional
`OPENAI_INTENT_MODEL` selects the model for both intent and extraction. All reads
remain in `src/config/env.ts`. Apply the additive migration through the existing
operator setup in [the database guide](../../supabase/README.md):

```sh
npm --prefix packages/road-data run db:migrate -- --dry-run
npm --prefix packages/road-data run db:migrate
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build -- --webpack
```

## Privacy, retries and retention

Only HMAC sender identities are stored. Drafts, accumulated report text and replay
results are AES-256-GCM encrypted with random IVs and authenticated tags. Destination
numbers stay transient in report intake. Only the separately confirmed subscription flow stores an encrypted delivery contact.
Public incident APIs expose fixed type/provenance labels and coordinates, never
raw messages, phone keys or decrypted text. OpenAI receives redacted text without
a sender ID and with response storage disabled. Logs contain safe operation/result
metadata, not message content, provider bodies or phone numbers.

A 90-second per-sender lease prevents concurrent conversational changes across
serverless instances. No connection/transaction remains open during LLM or location
lookups. The transaction checks lease ownership before publishing; an expired owner
cannot commit. Conversation leases and per-message webhook delivery leases have
different purposes. Failed persistence returns a retryable webhook error; a failed
model/location lookup gives a visible Spanish follow-up and publishes nothing.

The report router limits non-command text to 30 messages per sender per 15 minutes;
replayed events do not consume that quota again. It replies with the wait message
rather than provoking a provider retry storm. Confirmation/cancel/pin handling and
deterministic query commands do not invoke extraction. This is a signed provider
webhook, not an anonymous direct report-writing API.

Expiry makes a draft unusable; it is not a claim that encrypted rows are erased by
an active background job. Operators can clear expired draft ciphertext on unlocked
rows using `expires_at`, and prune the encrypted result journal after the chosen
retry-retention period (initial operator policy: seven days). Keep durable completed
webhook keys. No new retention scheduler or alert workflow is activated here.

## Verification

Extraction fixtures are **synthetic**, as selected by the participant; they are not
10–20 real anonymized messages or evidence of measured model accuracy. Offline tests
cover invalid/refused output, literal-place checks, missing fields, failed providers,
confirmation codes, expiry, retries, off-road locations and publication routing.
Database tests use isolated geometry and test identities, verify encryption,
independent counts, concurrent deduplication, replay and denied browser access,
and remove their records afterward.

For the live check, send:

`REPORTE PRUEBA Hay un derrumbe cerca del Puente Río Blanco; sigue activo y bloquea un carril.`

Review the bot's proposed pin (or provide a pin if it cannot resolve the place),
then send the exact confirmation code. Check the returned map link and DEMO /
no-confirmado labels. Record the actual phone/map result in the local progress log;
a synthetic extraction or database test alone does not prove that complete flow.
