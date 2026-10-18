# PeruRoad Climate

Climate exposure, preparedness and live PE-22 road conditions for drivers,
dispatchers and response teams. This
integration branch combines Role D's map snapshot (`400bb8d`) with A's application
backend and C's independent data package. Follow [the Team Plan](docs/team-plan.md)
and [repository instructions](AGENTS.md) before changing shared contracts.

## Run locally

Use Node.js 24.3+ and npm. Run from the repository root, in this order:

```sh
npm --prefix packages/road-data ci
npm --prefix packages/road-data run build
npm ci
npm run dev
```

The map can run without credentials: SUTRAN has an explicitly dated snapshot
fallback, and the bundled road layer is labeled as a snapshot when Supabase is
unavailable. Community incidents, statistics, company access and waitlist writes
need the database and server variables in [.env.example](.env.example). Copy that
file to ignored `.env.local`; never use a browser/service-role credential as the
Postgres connection. See [Supabase setup](supabase/README.md) for migrations and
C's repeatable geometry/elevation/gazetteer imports.

Generate each encryption/HMAC/session secret independently from 32 random bytes.
`CONTACT_ENCRYPTION_KEY` uses base64url encoding. Keep these values stable across
redeploys; rotating the phone pepper changes identifiers, and rotating an encryption
key requires retaining a versioned decryption key for existing contacts. All
runtime environment reads live in `src/config/env.ts`, which delegates validated
Postgres configuration to C's compiled entry point.

For an explicit, test-labeled demo organization and map pin, set a random
`DEMO_ACCESS_CODE` locally and run:

```sh
npm run db:seed-demo
node --env-file=.env.local --import tsx scripts/check-realtime.ts
```

The seed renews a **24-hour demo entitlement**, without processing a payment. Read
the code directly from your local `.env.local` and enter it at `/empresa`; keep it
out of commits, logs and organizer updates. The demo pin says **DEMO**, carries no
real report or person, and is excluded from impact statistics. Tests use synthetic
identifiers and clean their own rows; database tests require an explicitly configured
database, while default tests run offline without credentials.

## Structure and checks

- `src/app/`: thin routes and UI pages. `src/services/platform/`: A's use cases.
- `src/domain/`: deterministic access and map logic. `src/db/`: validated SQL adapters.
- `src/integrations/`: HTTP, SUTRAN, weather, Realtime and cryptographic adapters.
- `src/contracts/`: browser-safe schemas shared by the API and frontend.
- `packages/road-data/`: independently built C implementation; import compiled exports.
- `apps/api/`: independently deployed SUTRAN/n8n and B road-context API; its existing URL remains active.
- `supabase/migrations/`: append-only shared database changes.

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build -- --webpack
npm run test:db
```

Run Next.js type generation and builds sequentially. Root tools exclude independent
`apps/` and `packages/` projects; their own CI still checks them. The root build
copies MapLibre's worker from the pinned dependency. Vercel builds C before
installing the root application, using [vercel.json](vercel.json).

## Current integration

See [A's API and B/D handoff](docs/platform-api.md) for endpoints, privacy,
Realtime, metrics and unresolved dependencies. The integrated map consumes
Supabase geometry and community incidents, alongside D's official SUTRAN feed and
rainfall visualization. Measured geometric distance is **not calibrated official
kilometer chainage**; elevation is a terrain estimate.

Catchment rainfall windows, official susceptibility/warnings and historical
candidate data now have validated capture/import scripts, public read APIs and
dated snapshot fallbacks. See the [model-input handoff](docs/data/model-inputs.md)
and [ML checkpoint](docs/data/ml-readiness.md) for coverage, reproduction and the
unresolved labels/forecast-availability decisions before training.

The participant approved a [climate-exposure and preparedness pivot](docs/data/climate-exposure.md)
that retains live road conditions, the map and WhatsApp alerts for drivers. The
assessment service combines forecast rainfall and mapped susceptibility, with
official advisories kept separate pending eligibility. Immutable assessments and
`GET /api/exposure` provide attention categories, reasons and explicit unknown
coverage. The [dashboard forecast view](docs/integration/dashboard-forecast.md) now shows dated six-hour possible-huaico estimates and mapped stretches; departure planning is deferred; [weekly environmental PDFs](docs/integration/weekly-environmental-pdf.md) provide separate driver opt-in, stored attachments and n8n scheduling, with delivery checks recorded separately;
voice input, subscriptions, conditional alerts and hourly climate refresh now have a separate integration; existing unavailable responses do not mean low exposure or a safe
road. The logistic pipeline remains deferred research, blocked by the evidence gaps
in the [training handoff](docs/data/logistic-pipeline.md). No real-data model has
been trained or evaluated in this integration, and no real
WhatsApp report or real user validation is claimed. The October 18 participant
authorization adds a [Qatom weekly alert pass](docs/integration/qatom-alert-passes.md):
`SUSCRIBIR 7 DIAS`, a one-time USD 0.50 checkout through OpenAI Responses and
Qatom MCP, verified payment activation, and expiry 168 hours from the request
without renewal. This implementation requires the migration, seller item and
server-only configuration (including separate MCP-agent and seller-API credentials) before live payments; no paid launch is claimed.

## WhatsApp integration

See the [complete WhatsApp command guide](docs/integration/whatsapp-commands.md)
for queries, reports, route alerts, payment, weekly PDFs and demonstration flows.

B's Zavu snapshot is integrated on `feat/data-model`. The signed webhook answers
road-status and estimated-exposure queries using the existing validated data
services; a narrow OpenAI intent parser supports natural-language questions.
See [setup, supported behavior and cutover checks](docs/integration/zavu-messaging.md).
Text reports now follow an [explicit location/confirmation flow](docs/integration/whatsapp-reports.md)
before appearing as unconfirmed community markers. Voice transcription, explicit origin/destination route subscriptions, source-triggered
alerts with five-minute recovery, and hourly weather refresh are implemented in [driver notifications](docs/integration/driver-notifications.md).
Photos are excluded. Live verification and template approval status remain explicit.
