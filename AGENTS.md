# Repository instructions

## Language

Use English for all future work: conversations, documentation, progress entries,
code comments, commit messages, and project content. Keep proper names and
required external identifiers unchanged.

## Context

Before working, read `getting-started/README.md`, `docs/team-plan.md`,
and the recent entries in `getting-started/PROGRESS.md`. The Team Plan is the
team's chosen product direction: follow the participant-approved climate-exposure
pivot, retaining driver WhatsApp alerts, live road conditions and the planned
product surfaces, with the updated five-criterion rubric and 30-hour schedule.
See `docs/data/climate-exposure.md` for the assessment and alert boundaries.
**Latest participant decision:** environmental monitoring and preparedness take
priority. Departure planning (F9), its engine, WhatsApp departure questions and
D's planner/chart are deferred beyond hackathon delivery; do not treat them as
remaining completion requirements. Preserve existing honest unavailable API
responses. Prioritize report verification, reliable alerts, exposure/coverage
validation and environmental explanations/indicators in the Team Plan checkpoint.
Weekly reports now use separately authorized driver PDF attachments; see
`docs/integration/weekly-environmental-pdf.md`. Do not enroll existing short-alert
subscribers automatically or replace PDF delivery with a public report link.
**Latest alert update:** source changes trigger route-filtered WhatsApp alerts;
include active public community reports as explicitly unconfirmed, without treating
the placeholder confidence score as verification. `RUTA` selects origin/destination
on the captured PE-22 axis; static pins are not continuous phone tracking. Keep
estimated possible-huaico alerts, duplicate suppression, five-minute recovery,
typed activation and STOP/BAJA cancellation. Do not reintroduce the 30-minute
delivery cooldown; see `docs/integration/driver-notifications.md`.
**Separate purchase and route consent:** SUSCRIBIR purchases seven-day access;
it does not start alerts. RUTA selects origin/destination with an existing valid
pass, confirmed by RUTA ACTIVAR. Route changes and STOP preserve the remaining
pass time and never create another charge or extend expiry. STOP disables route
notifications and PDFs; route replacement still requires fresh weekly consent.
**October 18 payment authorization (price updated by the participant):** implement
a one-time 0.01 USD-TDN Qatom pass for seven elapsed days from the original
WhatsApp request, using OpenAI
Responses with Qatom MCP guest checkout, verified fulfilment and server-enforced
expiry. See `docs/integration/qatom-alert-passes.md`; this supersedes the earlier
payment exclusion only for weekly WhatsApp alerts. Yape remains excluded. Do not treat proposed
integrations, metrics, or predictions as verified results. Before writing code,
read the engineering principles and quality rules below.

The chosen track is **Climate and Territory**
(`environmental`). The current rubric was provided by the participant: 30%
technical complexity, 25% functionality, 20% technical quality, 15% problem and
impact, and 10% clarity. Do not replace it with the older rubric still shown in
the online guide at the time of our initial review.

Climate exposure combines forecast rainfall, mapped susceptibility and valid
official advisories to prioritize attention. Keep estimated exposure, official
advisories, confirmed incidents and unverified community reports distinct in APIs,
the map and messages. Missing/stale data never establishes safety or clearance.
The logistic pipeline remains deferred research; do not make fitting it a delivery
gate or describe exposure scores as calibrated disruption probabilities.

## Engineering principles

All code in this repository must be production-ready: code a teammate can run,
review, test and deploy without asking the author. Technical quality is 20% of
the grade (1: fragile, or secrets in the repo; 3: organized, with shortcuts;
5: handles errors, edge cases and credentials). Follow these principles in every
change, including code written by agents.

### Structure and design

- **Independent Data & Model package.** Member C's implementation lives in
  `packages/road-data/`, with its own package manifest, lockfile, TypeScript,
  ESLint, Vitest, and build configuration. Run its commands with
  `npm --prefix packages/road-data ...`. Keep this tooling inside the package
  while teammates develop the application locally. Coordinate root application
  dependencies and workspace setup with member A during integration.
- **Offline spatial tooling.** Python preparation lives in `packages/road-data/python/`
  with pinned `requirements-data.lock.txt`; `.venv/` and bulk source caches are ignored.
  Server applications consume validated JSON through the compiled TypeScript package.
  See `docs/data/pe22-catchments.md`; Python is not a deployment dependency.
- **Path scope.** The `src/` paths below are relative to the application root
  for application code and to `packages/road-data/` for the Data & Model package.
  The package mirrors the same layers and exposes compiled entry points for
  server adapters and shared contracts; consumers use those entry points.
- **API application.** The initial Next.js server integration lives in `apps/api/`
  with independent tooling and a local dependency on `packages/road-data/`.
  See `apps/api/README.md`; build the data package before the API. Keep this
  application separate from teammates' root frontend setup until integration is
  coordinated. Run Next.js type generation and builds sequentially because both
  manage `.next/`. Do not include local environment files in deployable artifacts.
- **Coordinated frontend integration.** The participant approved integrating Role
  D's `400bb8d` snapshot into `feat/data-model`. Root `src/` now owns the integrated
  dashboard and A's application APIs, security helpers, access and waitlist. Root
  tooling excludes the independent projects; build `packages/road-data` before
  installing the root application. The existing `apps/api` deployment and n8n
  URL remain independent. See `docs/platform-api.md` and the root `README.md`.
- **Shared database.** Team-wide SQL migrations live in `supabase/migrations/`.
  Database operator commands and the initial Postgres adapter live in
  `packages/road-data/`; see `supabase/README.md`. Never edit an applied migration:
  add a new migration and run the database integration checks. The
  `peruroad_backend` login and secret API key are server-only; browser roles have
  no operational-table access until explicit application access rules are added.
- **Separation of concerns.** Keep four layers and import only downward:
  - `src/app/` (routes, pages, route handlers): parse input, call a service,
    shape the response. No business rules here.
  - `src/services/`: use cases that coordinate the domain, the database and the
    integrations (for example, "process an incoming report").
  - `src/domain/`: pure business logic with no I/O, network, database or clock
    access. This covers extraction normalization, dedupe, confidence, risk,
    dispatch decision, entitlements and alert rules.
  - `src/integrations/<provider>/` and `src/db/`: adapters for external services
    and data access.
- **Single responsibility.** One module, one reason to change. Split files that
  mix concerns or grow past about 300 lines.
- **Depend on interfaces, not providers.** Each external service is wrapped in
  an adapter behind a typed interface (for example, `MessagingProvider`, or
  `Transcriber` for speech-to-text). The interface allows fakes in tests, a
  fallback provider, and a provider change without touching the domain.
- **Pure core.** Pass time, configuration and randomness into domain functions
  as arguments (`now`, `config`), so the logic is deterministic and testable.
- **DRY for knowledge, not for shape.** Share helpers for security, HTTP,
  validation and time. Do not create abstractions for code that appears only
  once (KISS, YAGNI).
- **Explicit contracts.** The API JSON shapes from phase 0 live as shared
  TypeScript types and zod schemas in `src/contracts/`. Change a contract only in
  a pull request that updates every consumer.

### Code conventions

- **TypeScript strict mode.** No `any`, no `@ts-ignore` and no non-null `!`
  without a comment explaining why it is safe. Use `unknown` and narrow it.
- **Validate at every boundary with zod:** request bodies, query parameters,
  webhooks, provider responses, LLM output, SUTRAN and weather payloads,
  database JSON columns, and environment variables. Data that fails validation
  is rejected or logged and skipped, never used as-is.
- **Configuration.** Read environment variables in one module only
  (`src/config/env.ts`), which validates them at startup and fails fast with a
  clear message naming the missing variable (never its value).
- **Naming.** Use descriptive English names: `camelCase` for variables and
  functions, `PascalCase` for types and components, and `SCREAMING_SNAKE_CASE`
  for constants. Name units in identifiers (`timeoutMs`, `distanceKm`,
  `rainMm24h`). Spanish appears only in user-facing text and provider values.
- **Small functions** with one level of abstraction. Prefer early returns to
  nested conditionals.
- **Comments explain why** (a decision, a provider quirk, a threshold's source).
  Do not narrate what the code does.
- **Time.** Store and compare timestamps in UTC. Convert to `America/Lima` only
  for display and quiet hours. Parse provider formats explicitly (SUTRAN
  `fechaEvento` is `DD/MM/YYYY`; `lastActionAt` is ISO 8601 in UTC).
- **Magic numbers** (thresholds, radii, windows, weights) go in named constants
  with units and a one-line note on their source.
- **Formatting and linting** are automatic (Prettier and ESLint). Do not merge
  code with lint errors or disabled rules that lack a reason.

### Error handling and resilience

- **Never swallow errors.** Every `catch` either recovers with an explicit
  fallback or rethrows with context. Empty `catch` blocks are not allowed.
- **Expected failures are values.** Domain and service functions return typed
  results (`{ ok: true, value } | { ok: false, error }`) for failures the caller
  must handle (invalid report, unknown place, expired pass). Exceptions are for
  bugs and unavailable infrastructure.
- **Safe responses.** API errors return a consistent JSON shape
  (`{ error: { code, message } }`) with the right HTTP status. Never return
  stack traces, SQL or provider error bodies to clients.
- **Users always get an answer.** When a step fails, the WhatsApp user receives
  a short message in Spanish, and the dashboard shows a visible state (for
  example, "Datos en caché de hace 12 min" or "Fuente no disponible"). Do not
  fail silently or show a blank screen.
- **Idempotency.** Webhooks and scheduled jobs can run more than once. Dedupe
  webhooks by the provider's event or message ID, and make jobs upsert by
  natural keys (for example, SUTRAN `id` + `lastActionAt`).

### Observability

- Use structured logs (JSON) with a request ID, the operation, the provider,
  the duration and the result.
- Never log phone numbers, message contents linked to a sender, tokens, keys,
  signatures or full provider payloads. Log the `phone_key` instead.
- Record each external-call failure with its provider and error type, so a
  provider outage can be seen in the logs.

### Git workflow

- `main` always deploys and stays green. Code reaches `main` only through a pull
  request from a feature branch (`feat/<area>`, `fix/<area>`), reviewed by one
  other member, with CI passing.
- Keep pull requests small and focused. Commit messages are imperative English
  ("Add Zavu webhook signature check").
- **Participant update:** continue all Role C work and its API/database integration
  on `feat/data-model`, with one consolidated PR to `main`. Do not create a new
  branch for each implementation step. Role D's visualization branch remains untouched after the authorized snapshot integration; `main` still requires review and passing CI.

## Technical quality rules and verifications

Each rule has a verification. A pull request that breaks a rule is not merged.
Run the full list again at the 05:30 feature freeze and the 07:00 code freeze.

| Area | Rule | Verification |
|---|---|---|
| Secrets | No secret, key, token, password, pepper or real phone number is ever committed. Each variable is listed in `.env.example` with an empty value and a comment. `.env*` is in `.gitignore`, except `.env.example`. Secrets live in the hosting platform and in `.env.local` | CI runs a secrets scanner (gitleaks) on every pull request. Before the deadline, run `gitleaks detect --log-opts="--all"` over the full history. Every variable read in `src/config/env.ts` appears in `.env.example` |
| Leaked secret | A secret that reaches any commit is treated as compromised | Rotate it with the provider immediately, then remove it. Deleting the file is not enough |
| External calls | Every call to Zavu, ElevenLabs, the LLM, SUTRAN, Open-Meteo, Qatom and n8n goes through the shared wrapper in `src/integrations/http/`, which has an explicit timeout (default 8 s), at most 2 retries with exponential backoff and jitter (only for network errors, 429 and 5xx, and only for idempotent requests or requests with an idempotency key), and structured logging | No direct `fetch(` or SDK call outside `src/integrations/` (checked by an ESLint rule or `git grep`). Tests simulate a timeout, a 500 and a 429 for each adapter |
| Visible fallback | Every external call has a defined fallback that users can see: cached data with its age, a reduced answer, or a clear "unavailable" state. The fallback for each provider is listed in a table in `docs/` | A test or manual check per provider with the provider disabled shows the fallback, not a crash or a blank screen |
| Signed webhooks | Every incoming webhook (Zavu, Qatom, n8n callbacks) verifies its signature over the raw body with a constant-time comparison (`crypto.timingSafeEqual`), checks a timestamp window against replays when the provider sends one, and dedupes by event ID. Invalid or missing signatures return 401 and are logged without the payload | Tests for a valid signature, a wrong signature, a missing header, a modified body and a replayed event |
| Internal endpoints | n8n job endpoints, the admin page and cron routes require a secret or an authenticated session and reject everything else | A test confirms that a request without credentials is rejected |
| Personal data | Phone numbers are stored only encrypted (`contact_ref`, AES-256-GCM with a random 12-byte IV and the auth tag stored), or as the HMAC-SHA256 `phone_key` with a secret pepper. Never in plain text in the database, logs, URLs, analytics or error messages | Tests for an encryption round trip, a modified ciphertext failing, and a stable `phone_key` for different formats of the same number (`+51 999…`, `999…`). Before code freeze, search the logs for 9-digit Peruvian mobile numbers |
| Input validation | All external input is parsed with zod before use. Unknown WhatsApp message types, empty messages, oversized media and malformed payloads are handled explicitly | Tests with invalid and unexpected payloads for each webhook and public API route |
| Paid access | Every paid route and paid WhatsApp feature checks an active pass on the server. Client-side checks are only cosmetic | Tests for no pass, an expired pass, an active pass and the wrong organization |
| Public endpoints | Public write endpoints (waitlist, report intake) are rate-limited and validate input size | A manual check with repeated requests returns 429 |
| Required tests | Unit tests (Vitest) cover: **extraction** (normalizing LLM output on 10–20 real anonymized road messages, including bad LLM output), **dedupe**, **confidence**, **climate exposure** and **alert eligibility** (one test per rule and boundary; deferred dispatch requires tests only if later implemented), plus webhook signatures, encryption and entitlements | `npm test` passes locally and in CI. Tests run without network access or real credentials, using the fakes behind the interfaces |
| Edge cases | Each domain module tests its edge cases: a place outside PE-22, a pin more than 500 m from the road, a voice note that fails to transcribe, a duplicate webhook, a SUTRAN response that is empty or changed, a query outside the captured forecast range, a pass that expires during a trip, and Lima time zone boundaries | Named test cases exist for each item that applies to the module |
| CI | Every pull request runs lint, type check (`tsc --noEmit`), tests and the secrets scan | A pull request cannot merge with a red check |
| Reproducible setup | A fresh clone runs with the README steps, `.env.example` and the database migrations. The demo uses seeded data, not manual database edits | A member who did not write the feature follows the README on a clean checkout before the code freeze |

### Pull request checklist

Copy this list into every pull request description and check each item:

- [ ] No secrets or real phone numbers in the diff; new variables added to `.env.example`
- [ ] External calls use the shared wrapper and have a visible fallback
- [ ] Input validated with zod; errors handled with a user-facing message
- [ ] Tests added or updated for the logic changed, including edge cases
- [ ] Lint, type check and tests pass locally
- [ ] No business logic in route handlers or React components

## Automatic progress logging during sessions

Update `getting-started/PROGRESS.md` without waiting for the user to ask after
completing a task with meaningful changes, making a scope or architecture
decision, verifying a demo, gathering user evidence, or identifying a blocker.
Record the outcome before ending the session. Group minor changes into a useful
entry and avoid duplicates. Queries without findings and individual file edits
do not each need an entry.

- Append entries and preserve the history. Record corrections explicitly.
- Use the actual date and time in `America/Lima`, with the `-05:00` offset.
- Each update must be one short, focused paragraph of 2 to 4 sentences, preceded
  by a timestamp and a short title. State what changed and the next step; include
  a decision, evidence, or blocker only when relevant. Avoid field lists,
  subsections, and lengthy explanations.
- Distinguish verified results, hypotheses, and pending work. Never invent user
  tests, metrics, deployments, or completed features.
- Link files, commits, or demos when available. Do not create commits just to
  populate the log.
- Never store secrets, benefit codes, credentials, or personal data.

This mechanism works when an agent following this file works in the repository.
There is no background process: changes made outside those sessions need their
own entry.

## Updates for the organizers

Local logging is automatic; publishing through `andes` requires a user
instruction authorizing publication, including standing authorization for the
session. Updating the Markdown file alone does not authorize publication.

When authorized, review the remote history, prepare a factual summary using
`getting-started/PROGRESS_TEMPLATE.md`, and publish only the new update. Verify
the content returned by the CLI before recording it as published. If a write has
an uncertain outcome, check the history before retrying.
