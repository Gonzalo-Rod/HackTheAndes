# Progress log

Local project history for the **Climate and Territory** (`environmental`) track.
Time zone: **America/Lima (UTC−05:00)**. Append entries and distinguish verified
facts from pending work. Automatic logging rules for agent sessions are in
[AGENTS.md](../AGENTS.md).

Record meaningful milestones, decisions, tests, deployments, and blockers. This
file provides evidence of work and a basis for summaries; a local entry does not
mean an update has been published through `andes`. Write all entries in English.

## Entry format

```md
## YYYY-MM-DDTHH:MM:SS-05:00 — Update title

[What changed and what works. A decision, evidence, or blocker only if useful.
The concrete next step.]
```

Each update is one short paragraph of 2 to 4 sentences, without lists or
subsections. Mention publication in `andes` only after verifying it. Never record
keys, tokens, credit codes, or users’ personal data.

## 2026-10-17T11:30:23-05:00 — Repository preparation for the hackathon

We prepared the hackathon context, the `environmental` track reference, and the
agent progress log; we verified internal links and the `andes v0.1.279` CLI.
We use the updated 30/25/20/15/10 rubric provided by the participant because the
guide still showed the older version. Next, define the user, problem, and main
MVP workflow; there is no demo or published `andes` update yet.

## 2026-10-17T11:34:55-05:00 — Short progress updates

We adjusted the instructions and template so each update is a single paragraph
of 2 to 4 sentences, as requested by the participant. We also shortened the
initial entry; future milestones will follow this concise format.

## 2026-10-17T11:38:56-05:00 — English as the project language

We translated all four documents and renamed the documentation folder and
progress files to English, updating every internal reference. Repository
instructions now require English for all future work, while progress entries
remain short paragraphs; local links and rubric weights were verified.

## 2026-10-17T11:48:00-05:00 — Team Plan feasibility review

We reviewed the Team Plan and recommended a smaller WhatsApp reporting, map,
and status-query MVP, identifying the outdated rubric, 36-hour schedule, and
unverified prediction claims. We moved the proposal to `docs/`, preserved its
content with a review note, and required agents to read the plan and review;
internal links and formatting were verified. Next, validate messaging access,
one target user, and the minimum data needed for the core workflow.

## 2026-10-17T11:54:33-05:00 — Original scope retained; rubric and schedule updated

The participant chose the original approach and full MVP scope, superseding
the earlier recommendation to reduce it. We updated the Team Plan to the
30/25/20/15/10 rubric and a 30-hour schedule, deleted the implementation review,
and updated agent instructions and onboarding references. Scope, architecture,
definition of done, rubric totals, and internal links were verified.

## 2026-10-17T12:04:55-05:00 — Team Plan: Next.js stack and model review fixes

We updated the Team Plan to a Next.js (TypeScript) stack with MapLibre and PostGIS, named the project PeruRoad Climate, and added spec items such as the rainfall heat map, catchment layer and indicator panel. Following the review, advance-warning claims now rely only on archived Open-Meteo Previous Runs forecasts evaluated on a season held out from calibration, with the Yaku 2023 replay labeled as a reconstruction. The plan now uses delineated upstream catchments, states that 1-km segments are display units rather than weather precision, and stores subscriptions with a provider contact ID or encrypted destination plus an HMAC matching key. All integrations remain unverified; next, run the section 6 checks and submit the WhatsApp alert template at H0.
