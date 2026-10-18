# Hack the Andes — Team Plan

**October 18 participant authorization:** implement weekly WhatsApp alert access
for a single 0.01 USD-TDN payment through Qatom (participant-updated price), with
OpenAI Responses calling Qatom MCP. The pass ends 168 elapsed hours after the original request and does
not renew. This supersedes earlier payment exclusions below only for this feature;
Yape and other commercial plans remain excluded. The implementation, rollout,
configuration and launch-verification boundaries are documented in
[Qatom alert passes](integration/qatom-alert-passes.md).

**Separate access and route selection:** `SUSCRIBIR` purchases seven-day access,
without starting alerts. With that pass, `RUTA` selects origin and destination;
`RUTA ACTIVAR <code>` confirms notifications for the selected stretch. Route
changes do not charge again or move expiry. STOP/BAJA stops notifications and
weekly PDFs while preserving remaining pass time; drivers can use RUTA to resume.
This supersedes older combined purchase/route descriptions below. See the
[command guide](integration/whatsapp-commands.md).

**Track:** Clima y Territorio
**Project name:** *PeruRoad Climate*
**One line:** A climate-exposure and preparedness dashboard for the Rímac–Carretera Central corridor that combines forecast rainfall, official terrain susceptibility and advisories with live road conditions and WhatsApp field reports, helping response teams prioritize attention and drivers receive relevant route alerts.

**Participant-approved pivot, October 17, 2026:** retain the 3D map, live road conditions, WhatsApp reporting and driver alerts. The core output becomes transparent **estimated climate exposure and attention priority**; disruption-model training is deferred research. [The implementation brief](data/climate-exposure.md) defines source, freshness, alert and uncertainty boundaries. This is the current direction wherever older risk/prediction terminology remains. Planned behavior is not a claim of implementation. Payments, Qatom and Yape remain outside the participant-authorized implementation scope; commercial sections below are future context.

**Participant-approved focus update, October 17, 2026:** environmental monitoring
and preparedness are the delivery priority: **where forecast rainfall overlaps
susceptible terrain, during which windows, and who needs to be informed**. Departure
planning (F9), its API engine, WhatsApp questions and dashboard planner/chart are
**deferred beyond the hackathon delivery scope**. Existing unavailable responses
remain honest compatibility boundaries; no implementation or removal is required
for those endpoints. This update supersedes older dispatch/departure promises,
including those retained in commercial background sections.

### Implementation checkpoint and remaining priorities

The main environmental workflow is implemented on the
[shared Preview](https://peruroad-climate-git-feat-data-model-gozlie.vercel.app/?vista=pronostico)
in `feat/data-model`: SUTRAN ingestion/history, rainfall and terrain inputs,
versioned exposure assessments, dated dashboard windows, WhatsApp text/audio
reports with explicit confirmation, subscriptions, conditional route alerts
without quiet hours, and hourly climate refresh. The participant verified DEMO
report publication, subscription activation, alert receipt and voice reporting.
These are participant demonstrations, not independent user traction or validated
huaico forecasting. `main` is unchanged and still requires teammate review.

The central product flow exists; completion now means strengthening its evidence
and reliability, not adding a transport planner. Remaining work, in order:

1. **B — Trustworthy environmental reports:** reviewed corroboration/confidence,
   community/SUTRAN matching and clearing, two-minute mixed-input grouping, and
   extraction checks on real anonymized messages. Initial community dedupe and a
   conservative unconfirmed score already exist. The participant now permits clearly
   labeled unconfirmed public alerts; the placeholder score must never imply verification.
2. **B — Reliable notifications:** verify approved-template delivery outside the
   24-hour conversation window and record scheduled-run/failure evidence. DEMO
   delivery is verified; out-of-window delivery is not. SMS is not an automatic
   fallback and requires separate consent and implementation.
3. **C — Environmental assessment validation:** review rainfall/terrain and
   catchment associations, source freshness, rule boundaries and alert changes;
   document resolution and coverage. Currently 38 of 174 segments have supported
   catchment links and 136 remain unknown. Improve coverage only with defensible
   spatial evidence; full coverage and predictive accuracy are not assumed.
4. **C with D — Environmental indicators and explanations:** complete missing
   aggregates for exposed kilometers by attention category and forecast window,
   assessed/unknown coverage, rainfall by catchment, and environmental reports by
   type/source. Preserve current road restrictions as separate context. Existing
   rainfall/exposure APIs are reused; no departure matrix is required.
5. **All roles — Delivery readiness:** synchronize handoff documentation, verify
   clean-database reproduction and a fresh-session/phone-width walkthrough,
   gather evidence from a consenting user outside the team, and finish review,
   pitch and submission. Existing tests and participant checks are evidence, not
   substitutes for these remaining checks.

Weekly report generation/delivery (F6) was selected for implementation after the core workflow; the driver-PDF scope and verification boundaries are in section F6. Photos,
payments/Qatom/Yape remain excluded; calls and voice replies remain optional;
disruption-classifier training remains deferred research. The rubric and 30-hour
schedule stay unchanged; their remaining milestones follow these priorities.

---

## 1. Objectives and evaluation criteria

### Objectives

1. **Integrate** official data that today lives on separate platforms (SENAMHI, ENFEN, MTC, CENEPRED, INGEMMET, SUTRAN, ANA) and community reports into one 3D dashboard of the corridor.
2. **Estimate** rainfall-related climate exposure for mapped catchments and linked road segments using forecast rain, INGEMMET susceptibility and valid SENAMHI advisories; show **live source-reported conditions** alongside **24–72 h estimated exposure** and explicit unknown coverage.
3. **Collect and verify** environmental field reports through WhatsApp (text, voice note and location); photos are excluded.
4. **Notify** consenting drivers about confirmed route conditions, applicable official advisories and estimated climate exposure for their subscribed stretch; retain phone calls as the existing optional trip-watch feature.
5. **Support environmental preparedness:** identify supported stretches where forecast rainfall overlaps susceptible terrain, show dated attention windows and unknown coverage, and deliver relevant notices to consenting subscribers.
6. **Explore sustainability:** keep reporting and subscribed environmental notices accessible; collect organizational needs through the waitlist. Commercial plans below are hypotheses, with payments excluded from this delivery.
7. **Evaluate** exposure rules, input coverage/freshness and alert delivery honestly. Keep historical reconstruction and deferred ML experiments separate from operational claims (section 4).
8. **Test with real users** during the event and document what we learned.

### Rubric

Source: the organizers' evaluation sheet ("Cómo se evalúa a los equipos", Hack the Andes 2026).

**Entry requirements (step 0).** Without all four, the team is not scored:
- a deployed **public URL** (localhost does not count);
- a **live demo** (slides or a recorded video do not count);
- the **code on GitHub**, submitted with the URL;
- submitted before the **deadline: Sunday, October 18, 09:00** (America/Lima).

**Scoring.** Each of the 5 judges scores each criterion from 1 to 5. Scores are multiplied by the weight and summed, and the final score is the average across judges.

| Block | Maximum |
|---|---|
| Technical score (75%) | 3.75 |
| Product score (25%) | 1.25 |
| Traction bonus (optional) | 0.5 |
| **Total** | **5.5** |

**Tie-break:** the higher technical complexity score wins; if still tied, the higher functionality score.

| Criterion | Weight | Score 1 → 5 on the sheet | How we aim for a 5 |
|---|---|---|---|
| **Technical complexity** | 30% | 1: an API wrapper or simple CRUD · 3: integrates APIs, data or a model with its own logic · 5: real data, models or orchestrated services, non-trivial architecture | Real official data + geospatial rainfall/susceptibility assessment + dated exposure windows + report verification pipeline + orchestrated ingestion and driver alerts, with tested rules and explicit uncertainty |
| **Functionality** | 25% | 1: fails live · 3: runs with toy data · 5: real data, and it holds up to questions outside the script | Live from the public URL with today's SUTRAN incidents and real reports; a judge can inspect dated exposure windows and sources, send a WhatsApp report, and review explicit unknown coverage |
| **Technical quality** | 20% | 1: fragile, or secrets in the repo · 3: organized, with shortcuts · 5: handles errors, edge cases and credentials | `.env.example` and no secrets in the repo; every external call has a timeout, retry and visible fallback; signed webhooks; encrypted contacts; tests for extraction, dedupe, confidence, exposure rules, freshness and alert eligibility |
| **Problem and impact** | 15% | 1: generic topic · 5: a specific user and evidence of the problem | People exposed to rainfall-related hazards along the corridor and maintenance/emergency teams; real interviews, reports, subscriptions and waitlist sign-ups, excluding team/test activity |
| **Clarity** | 10% | 1: it is unclear what they did · 5: what, why and what was left out | Rehearsed 3-minute demo; decisions, tradeoffs and cut features stated in the README and the pitch |

**Traction bonus (added on top, does not replace technical work):**

| Bonus | Condition on the sheet |
|---|---|
| 0 | No users outside the team, or no evidence |
| +0.25 | People outside the team used it, and it shows in records or data |
| +0.5 | Repeated use, visible volume, a real waitlist, or a payment |

Evidence must be shown **from the product**: screenshots alone, team accounts and automated traffic do not count. This is why the product has a traction page (F10) that reads counts from the database, a company waitlist, and real pass purchases (F7).

Using AI is not evidence by itself; every design decision is explained in the repository.

### Design principles

- **A channel people already have** (WhatsApp and phone calls), not a new app.
- **The AI does a narrow job** (transcription, extraction and explanations), wrapped in our own deterministic logic with a verification step.
- **One corridor done deeply** (PE-22) rather than all of Peru done shallowly.
- **Observed, forecast and estimated information are always distinguished.** Potential scenarios are never shown as confirmed damage.
- **Every chart answers a decision question** (e.g. "where does forecast rain overlap susceptible terrain?", "which supported stretch needs attention during this window?"). A visualization that does not support a decision is cut.
- **People who report never pay.** The WhatsApp channel stays free; organizations that use the aggregated data pay.

---

## 2. The problem and the users

Every rainy season, huaicos and rockfalls cut the **Carretera Central** (Lima–Chosica–Matucana–La Oroya), the main route between Lima and the central highlands. Today, drivers find out from WhatsApp groups asking *"¿cómo está la Central?"*, scattered news, and official warnings written for whole provinces, not for a specific stretch of road.

Official institutions publish meteorological, geological and road data, but on different platforms, which makes joint analysis difficult. SUTRAN's interactive alert map ([alertasviales.sutran.gob.pe](https://alertasviales.sutran.gob.pe/), v2.0) shows **confirmed** incidents with road status, an El Niño mode and a timeline of alerts. It does not forecast which segments may be affected next from rainfall over their upstream catchments, it does not take reports from people on the road, and it does not push warnings to a driver's phone. It is a data source for us, not a replacement.

**Primary user: people who drive the corridor.** Interprovincial bus and colectivo drivers, truckers and travelers. They both report and consume information, and they already share road status in WhatsApp groups; we give that habit structure.

**Secondary users:**
- **Residents of quebradas** (Chosica and others), who need early warning.
- **Operations staff at logistics and bus companies** (dispatchers), who decide when trucks and buses leave and need to warn drivers already on the road.
- **Decision-makers** (municipalities, regional emergency centers / COER, MTC, Provías), who need to know which segments require attention and how many kilometers and population centers are exposed.

**Track fit:** Climate and Territory: rainfall exposure, debris flows, slope failures and preparedness are the core environmental problem. Road conditions and driver alerts connect that problem to concrete impacts and actions; traffic crashes remain separately identified context.

**Additional operational user:** maintenance and municipal emergency teams can inspect areas where forecast rainfall overlaps susceptible terrain. Driver subscriptions and reporting remain in scope; departure/dispatch workflows are deferred.

### Geographic scope

| Stage | Area | Reason |
|---|---|---|
| **Hackathon prototype** | **Carretera Central (PE-22)**, Lima–Chosica–Matucana–La Oroya (and onward to Huancayo for trips) | High exposure to huaicos; reachable from Lima, so we can test with real drivers during the event |
| **Second priority** | North coast: Piura and Tumbes | Highest flood exposure during El Niño |
| **Later** | Rest of the national road network, e.g. Lima–Arequipa trips | Same pipeline, more layers and road geometry |

The opening view shows Peru in 3D; analysis and live features focus on PE-22.

---

## 3. What we build

### Product surfaces and plans

**Commercial background only:** the paid packaging below preserves earlier ideas;
it does not add payment, departure-planning, call or voice-reply requirements to
the approved delivery scope. Current priorities are the environmental workflow
and the implementation checkpoint above.

Access is sold **by time, not by message**: a driver pays for the days they will be on the road, and a company pays for a period of dashboard access or predictions.

| Plan | For whom | What it includes | How it is paid |
|---|---|---|---|
| **Free** | Drivers, travelers, residents | Report by WhatsApp (F1); ask for the current status (F2); alerts when the corridor is closed (*interrumpido*), because safety warnings are never paywalled (F3); public dashboard with live incidents, 24 h risk and SENAMHI warnings (F5a) | — |
| **Route Pass** (*Pase de Ruta*) | Independent drivers, truckers, travelers | For **1, 4 or 7 days**: all route alerts on WhatsApp, including rising risk and unconfirmed incidents (F3); 72 h forecast for their route; a *go / wait* answer for their own departure (F9 by WhatsApp); call alerts once F4 is delivered | One payment per pass; it expires automatically and is renewed by WhatsApp |
| **Company Dashboard** | Transport and logistics companies, insurers, municipalities / COER | Full dashboard (F5b): timeline, 72 h forecast, indicators, stretch analysis, export; weekly report (F6) | Access for a period (e.g. 7 or 30 days) |
| **Company Predictions** | Dispatch teams at bus, cargo and car-fleet companies | Everything in Company Dashboard + **dispatch decisions** (F9) for every planned departure, in the dashboard and on WhatsApp; fleet trip watch with call alerts (F4) | Subscription for a period (e.g. 30 days or the rainy season) |

- **Prices are hypotheses.** The team sets a low **test price** for the Route Pass at H0 so a real driver can buy one during the event. Interviews ask companies what a stranded vehicle costs them and what they would pay for a dispatch decision.
- **Payment rail:** passes and subscriptions are sold through Qatom if the section 6 check confirms it can sell time-based access; Qatom also lists the data API for AI agents, paid per call (second priority). Fallback: Yape with manual activation by the team, recorded in the product with its payment reference.
- **Entitlements:** a `pass` record (phone key or organization, plan, start, expiry, route, payment reference). WhatsApp features check the sender's active pass; dashboard features check the organization's active pass through an access code and a signed cookie. A seeded demo organization lets judges see the paid views from the public URL.
- **No card handling in our code.** We never collect card or bank details; the payment provider does.

### Priority tiers

- **P0, core (must work at the core checkpoint):** F1, F3, F5a, F8 and the climate-exposure assessment (section 4).
- **P1, delivery readiness (must work at the feature freeze):** environmental report confidence/clearing, reliable F3 delivery, exposure/coverage validation, environmental indicators and explanations in F5b, F2, and F10 traction/waitlist. F9 is deferred; F7 commercial payment flows remain excluded.
- **Last optional task before the freeze:** F6 weekly report. It is built only after validation and P1 work are complete, and it is cut if time runs out.
- **P2, only after all of the above:** F4 call alerts, then the items under "Second priority". The Zavu voice check (section 6) still runs at the start so the decision on F4 can be made at the core checkpoint.

### F1. Report by WhatsApp (P0)

**Participant update, October 17:** voice input is connected through the existing
OpenAI credential; photos are excluded from the current implementation. See
[driver notifications](integration/driver-notifications.md) for the implemented scope.

People near an incident send it to our Zavu WhatsApp number.

- **Accepted inputs:** text, voice note (OGG/Opus) and location pin. Two-minute mixed-input grouping remains to be implemented; photos are excluded.
- **Pipeline:**
  1. Zavu webhook → signature verified → raw message stored (media downloaded from `mediaUrl`).
  2. Voice note → speech-to-text (OpenAI, Spanish; implemented using the existing credential).
  3. LLM structured extraction: `type` (huaico / derrumbe / inundación / bloqueo / accidente / obra / otro), `place_text`, `km` if stated, `direction`, `severity` (1–3), `lanes_blocked`, `observed_at`, `still_active`.
  4. **Location:** a shared pin is snapped to PE-22 (accepted within 500 m); otherwise `place_text` is matched against a PE-22 gazetteer (towns, bridges, quebradas, km markers: Chosica, Ricardo Palma, Matucana, San Mateo, Ticlio, Casapalca, Morococha, La Oroya…); otherwise the bot asks *"¿Puedes compartir tu ubicación?"*.
  5. **Dedupe:** same type, within ±2 km and 3 h of an active incident (community or SUTRAN) → merged into it; otherwise a new incident.
  6. **Confidence** recomputed (section 5).
  7. **Reply:** *"Gracias. Registramos un derrumbe cerca del km 74 (San Mateo). Estado: no confirmado, 1 reporte."*
- **Clearing:** *"ya limpiaron"* / *"ya pasa"* marks the incident as clearing; it becomes cleared after 2 independent reports, an official source, or decay.
- **Unclear messages:** if type or location cannot be extracted, the bot asks one follow-up question instead of guessing.
- **Privacy and scope:** reporter identity is never shown; photos are excluded and audio is not retained after transcription.

### F2. Ask by WhatsApp (P1)

- *"¿Cómo está la Central hasta Huancayo?"* → intent and stretch detected → reply with active source-reported incidents, estimated climate exposure for supported parts of the stretch and the next 24 h, reasons, unknown coverage and any applicable valid SENAMHI advisory.
- Text reply of at most ~600 characters with a link to the stretch on the public dashboard.
- Voice questions receive text replies. Synthesized voice replies are optional future work, not a delivery requirement.

### F3. Subscribe and WhatsApp alerts (P0)

- *"Avísame de la Central"* or *"Avísame Chosica–La Oroya"* creates a subscription for a km range; the bot confirms the range. Explicit opt-in; *"BAJA"* opts out at any time.
- **Current delivery scope:** subscriptions and conditional alerts are implemented; a consenting participant verified a DEMO alert. Participant update: include unconfirmed public reports with a clear label; confidence/clearing remains separate unfinished work. Delivery outside the 24-hour conversation window remains unverified. Paid packaging remains future commercial context under the existing payments exclusion.
- **Triggers:**
  - a newly detected SUTRAN notice or active public community report in the selected range; community reports stay explicitly **unconfirmed**, including initial reports;
  - an incident in the range is cleared;
  - a fresh, complete climate-exposure assessment for a linked segment in the subscribed range crosses a documented attention threshold, labeled **estimated climate exposure**;
  - a new, valid and temporally eligible SENAMHI advisory covers the range, attributed to SENAMHI and separate from our assessment.
- **Route and delivery update:** `RUTA` collects origin/destination by static pins, catalog places or approximate map kilometers, follows the available PE-22 axis, and requires typed activation. Only events intersecting that range qualify until `STOP`/`BAJA`; no continuous GPS, alternate-road navigation, ETA or F9 departure engine is implied. Evaluate after committed community publication, complete SUTRAN polling and hourly climate refresh; retain a five-minute recovery job, with no 30-minute delivery cooldown or quiet hours. Fingerprints suppress repeats; reported events take priority over a bounded climate notice, and stale/incomplete inputs suppress new climate escalation.
- **Outside the 24-hour window:** an approved WhatsApp utility template, e.g. *"Alerta PeruRoad: {tipo} en {tramo}, {estado}. Responde ESTADO para más detalles."* Pending/unapproved templates leave delivery pending; SMS requires separate consent and implementation.

### F4. Trip watch and call alerts (P2; Route Pass and Company Predictions)

A driver on the road cannot read WhatsApp; a short call reaches them. This uses Zavu Voice Agents: the same agent configuration answers calls, and we place a call with one API request (`POST /v1/calls`).

- **Registering a trip:**
  - a driver writes *"Salgo a Huancayo mañana a las 4"*, or a company dispatcher adds it in the dashboard (driver phone, origin, destination, departure time);
  - the driver gives explicit consent by replying *"SÍ"* on WhatsApp before any call.
- **Route and timing:** the trip is mapped to the PE-22 segments between origin and destination, with an estimated time window per segment from the departure time and an average speed (default 40 km/h, configurable). The position is an **estimate from the schedule, not GPS**, and is labeled that way.
- **Trigger:** a source-reported incident meeting the reviewed confidence policy on a segment the consenting driver is expected to reach in the next 3 hours. Any official-advisory trigger needs verified temporal eligibility and a reviewed call policy; estimated exposure alone does not authorize an urgent call.
- **Action:**
  - before departure: WhatsApp message; calls require the explicit trip-watch consent and reviewed urgent-condition policy;
  - on the road: an outbound call with a per-call greeting, e.g. *"Hola, te llama PeruRoad. Hay un derrumbe reportado cerca del km 74, en San Mateo, a unos 40 minutos de tu ruta. No necesitas responder si estás manejando; te enviamos el detalle por WhatsApp."*
- **Agent tools during the call:** `get_stretch_status(km range)` reads our API; `confirm_incident(incident_id, answer)` records *"sí, lo estoy viendo"* as a report that feeds confidence.
- **Call limits:** at most 2 minutes, one call per incident per trip, voicemail → short message, and a WhatsApp follow-up after every call. The transcript is stored and linked to the incident.
- **Confirmation calls (same mechanism):** for a low-confidence incident, call one consenting subscriber who is near that stretch: *"¿Sigue bloqueada la vía en Matucana?"*
- **Dispatcher view:** trips on the corridor, estimated positions, alerts sent, call outcome.

### F5. 3D dashboard (MapLibre GL JS)

**F5a. Public view (P0)**

**Participant update:** add `possible_huaico` forecast items labeled *Posible huaico · estimación*, with dated six-hour windows, approximate mapped kilometer ranges and rainfall/susceptibility reasons. Keep them distinct from observed incidents, road status, the historical event timeline and impact counts. See the [dashboard integration](integration/dashboard-forecast.md).
- Opening fly-in from Peru to PE-22 on 3D terrain with hillshade.
- **Layers (toggle):**
  - incidents: icon by type, color by confidence, official (SUTRAN, with its road status interrumpido / restringido / normal) vs community, *"no confirmado"* label;
  - estimated climate exposure on linked 1-km segments (24 h), with unknown/unavailable coverage visible;
  - rainfall heat map (last 24 h accumulated);
  - upstream catchments, rivers and quebrada crossings;
  - SENAMHI warnings;
  - official susceptibility / hazard zones.
- **Incident panel (click):** type, km, first seen, last confirmed, number of independent reporters, confidence and what it is based on, source (WhatsApp / SUTRAN with its reporting entity, e.g. the concessionaire or PNP), photo, status history.
- **Segment panel (click):** estimated exposure, top reasons, forecast window and rainfall, official susceptibility, source times/validity, weather model/grid, geometry confidence and missing coverage. Unknown forecast issue times remain unknown.
- **Live updates:** a new incident appears within seconds of the WhatsApp report (Supabase Realtime or polling).

**F5b. Paid view (P1; Company Dashboard and Company Predictions)**
- **Timeline scrubber:**
  - last 7 days observed + next 72 h forecast for the risk, rainfall and incident layers;
  - **Cyclone Yaku (March 2023) reconstruction** mode, clearly labeled as a reconstruction (section 4).
- **Forecast toggle:** 24 h / 72 h risk and forecast rainfall heat map.
- **Stretch selector:** pick a km range (or click two points); every indicator recomputes for it.
- **Indicator panel:**
  - kilometers exposed per risk level;
  - active incidents by type and source;
  - accumulated rainfall per catchment (small multiples, last 7 days + forecast);
  - top 5 critical segments with reasons;
  - hours of restriction or closure in the last 7 days (from our archive of SUTRAN status changes and community reports).
- **Route profile chart:** elevation from Lima (~150 m) to Ticlio (~4,800 m) and La Oroya, with the line colored by risk level and incidents marked at their km. It answers "where on my route is the danger?".
- **Rainfall vs risk chart** for a selected catchment: observed and forecast rainfall bars, risk level band, and thresholds.
- **Response layer:** police stations, fire stations and health facilities near the selected stretch (SUTRAN public data).
- **Fleet panel** (when F4 is delivered).
- **Export:** incidents and risk as CSV / GeoJSON for the selected stretch and period.
- **Weekly reports archive** (F6).

### F6. Weekly environmental PDF (participant-requested implementation)

**Delivery update:** send PDF attachments to drivers who separately opt in, instead
of organization report links. See [weekly PDF integration](integration/weekly-environmental-pdf.md).

- **Consent:** an active selected stretch is required, followed by `SEMANAL` and
  typed `SEMANAL ACTIVAR <code>`. Existing short-alert consent does not enroll a
  driver. `SEMANAL BAJA` cancels PDFs only; `BAJA` cancels all notifications.
- **Schedule:** Mondays 07:00 Peru; six-hour pending/catch-up processing and a
  manual DEMO-only trigger. `PDF` requests an attachment or retrieves pending work.
- **Content:** actual archive period and start, environmental records by source,
  modeled rainfall where hours are complete, current captured 72-hour estimated
  exposure, assessed/unknown kilometers, sources and limitations. Missing history
  and closure durations remain unavailable; no complete-week coverage is inferred.
- **Summary:** the optional LLM selects/orders existing computed facts only;
  deterministic wording is the visible fallback. Code generates and stores the PDF.
- **Delivery:** within WhatsApp's window, send the PDF directly. Outside it, an
  approved utility notice asks the driver to reply `PDF`, followed by the attachment.
  No report link or SMS fallback is sent. Provider acceptance, phone receipt and
  template approval are separate checks.
- **Owners:** C owns report data, n8n and generation; B owns consent/delivery; A
  supports server-only storage, job authorization and bounded file access. D's
  organization report page is future work, not required for this driver-PDF flow.

### F7. Passes and payment (excluded; commercial background only)

- **Route Pass by WhatsApp:**
  - the driver writes *"PASE 4"* (or picks 1, 4 or 7 days from a WhatsApp list) and states the route, e.g. *"Lima–Huancayo"*;
  - the bot replies with the price and a payment link (Qatom) or Yape instructions (fallback);
  - once payment is confirmed (provider confirmation, or manual confirmation by the team for Yape), the pass is activated and the bot replies with its expiry, e.g. *"Tu Pase de Ruta está activo hasta el martes 20, 23:59."*;
  - a reminder is sent 12 h before expiry, with a renewal option;
  - while active, the pass unlocks route alerts (F3), the 72 h forecast for that route, *go / wait* answers (F9) and, once delivered, call alerts (F4).
- **Company plans from the dashboard:** the company chooses Company Dashboard or Company Predictions and a period → payment → an access code for its organization is issued and the paid views unlock until the expiry date.
- **Team admin page** (protected, not public): pending Yape confirmations, active passes and subscriptions, and payment references.
- **Data API for AI agents (second priority):** the same data exposed as `/api/v1/route-risk`, `/api/v1/incidents`, `/api/v1/stretch-summary` and `/api/v1/dispatch-decision`, listed on Qatom so MCP-compatible agents can discover them and pay per call. Requests through Qatom are verified, and each call is logged with its transaction reference.
- **Data rules:**
  - every answer labels observed / forecast / estimated;
  - we sell access to our **derived** products (merged incidents, risk levels, dispatch decisions), not raw government datasets; official incidents link to their public source; each source's terms are checked and listed in the README.

### F8. Official data ingestion (P0, n8n)

- **Every 10 minutes:** SUTRAN public alerts (`api.sigea.sutran.gob.pe/public/alerts`), filtered to `viaCodigo = PE-22` and to alerts in force (`vencida = false`, `aunNoVigente = false`), upserted as official incidents by their SUTRAN `id` / `codigo`. Changes are detected by `lastActionAt` and archived, because SUTRAN only returns current alerts, so history exists only if we keep it. Each alert's status history is read from `/public/alerts/{id}/historial`. Dates come as `DD/MM/YYYY` (`fechaEvento`, `vigenteDesde`, `vigenteHasta`) and ISO 8601 UTC (`lastActionAt`) and are parsed accordingly.
- **Live official updates (optional):** the SUTRAN map receives updates over a WebSocket. The dashboard can subscribe to it from the browser to show official changes without waiting for the next poll; the server-side poll stays the source of record. The message format is only known from the map's frontend code and must be confirmed with a real event before we rely on it.
- **Hourly:**
  - Open-Meteo forecast and recent precipitation for catchment sample points;
  - SENAMHI warnings;
  - then the climate-exposure recalculation endpoint, then alert evaluation (F3, F4).
- **Static, loaded once and documented:**
  - road segments with km references (MTC national network, as served by SUTRAN's `road-network/segments` endpoint and GeoJSON, or OpenStreetMap);
  - rivers and quebradas (ANA, also served by SUTRAN's hydrography endpoint and GeoJSON);
  - INGEMMET / CENEPRED susceptibility, terrain tiles;
  - police, fire and health facilities (SUTRAN public endpoints).
- **Daily:** El Niño status (SUTRAN's `/public/nino` summary of SENAMHI / ENFEN) for the second-priority El Niño layer.
- Each layer records its source, retrieval time and whether it is a live feed or a snapshot. Requests to public government services are cached and kept infrequent.

### F9. Departure planning and route exposure (deferred; outside hackathon delivery scope)

**Status:** deferred by the participant to keep the product focused on environmental monitoring and preparedness. The design below is retained as future context only; no engine, WhatsApp departure flow, dashboard planner, departure matrix or successful dispatch endpoint is required at the feature freeze. Existing unavailable responses remain unchanged.

A possible future use case is a dispatcher comparing route exposure at assumed arrival times; it requires separate travel assumptions and evaluation.

- **Input** (dashboard form *"Planificar salida"*, or WhatsApp *"¿Sale el bus de las 22:00 a Huancayo?"*):
  - origin and destination on the corridor (preset places: Lima, Chosica, Matucana, San Mateo, La Oroya, Huancayo…);
  - planned departure date and time, within the next 72 h;
  - vehicle type: bus, truck or car;
  - optional: the company's own cost per hour of a stopped vehicle.
- **Travel timing:** the route is split into PE-22 segments, and the expected arrival time at each segment comes from an average speed per vehicle type. The speeds are configurable defaults, stated as assumptions in the answer.
- **Exposure at arrival time:** compare forecast exposure windows on supported catchments/segments against assumed arrival times. Preserve official closures/restrictions as separate current facts and label community evidence by confidence.
- **Decision support:** a source-reported closure identifies a currently blocked route; restrictions require review. Estimated climate exposure can suggest extra attention or a lower-exposure departure window under the documented rule set. It cannot establish that a future closure will occur or that departure is safe. Missing inputs return an unavailable/insufficient-data result.
- **Departure comparison:** show the maximum estimated exposure and unknown coverage for each feasible departure within the captured forecast horizon. Do not recommend an optimum when required route/time inputs are missing, or silently extend the 72-hour forecast.
- **Output:** named stretches, source conditions and observation times, exposure reasons, assumed travel times, forecast validity and uncertainty. A decrease in exposure never reopens an incident.
- **Cost context:** a company may enter its cost per delay hour; do not infer closure duration from alert expiry or validity dates. Total delay-cost estimates require a separately supported duration.
- **Departure chart:** route distance versus departure time, displaying estimated exposure and unknown cells, with current restrictions separately identified.
- **Record and feedback:** store inputs and results; real trip feedback can later support evaluation. The company makes the operational decision.

### F10. Traction page and company waitlist (P1)

- **Public `/impacto` page**, with counts read live from the database since launch:
  - reports received, unique reporters, queries answered, subscribers, returning users, passes sold and companies on the waitlist;
  - a chart over time.
- **What the counts exclude:** team members' phone keys (flagged `is_team`), test numbers and automated traffic. No personal data is shown.
- **Company waitlist form:** company name, contact person and role, fleet size, routes, contact channel, and consent to be contacted. The terminal visit and interviews point dispatchers to it.

### Display rule

The dashboard, messages and calls always distinguish **observed** events (official or confirmed reports), **forecasts**, and **estimated exposure**. Unverified reports are labeled **"no confirmado"**.

### Second priority (only after P1 works end to end)

- F9 departure planning and its B/D interfaces are deferred beyond hackathon delivery, not part of the remaining overnight work.

- F4 trip watch and call alerts, then confirmation calls.
- Data API for AI agents on Qatom, paid per call (F7).
- Estimated delay and alternative routes when a closure is confirmed (SUTRAN publishes official alternative routes).
- **El Niño layer:** ENFEN status, sea-surface temperature anomalies, official outlooks.
- **Scenario comparison:** exposure under different rainfall scenarios.
- **Piura and Tumbes:** flood zones and their proximity to roads, population centers and critical infrastructure.

### Out of scope

Other corridors (including Lima–Arequipa), frost alerts, native mobile app, full user accounts and roles, card handling in our own code, live GPS tracking, national coverage.

---

## 4. Climate exposure and preparedness (the technical core)

**Current approved output:** estimated rainfall-related exposure and attention
priority over supported catchments and linked road segments for the next 24/72
hours, with six-hour windows for environmental attention and preparedness. The [implementation brief](data/climate-exposure.md)
defines the assessment, driver alerts and source boundaries. Live SUTRAN status,
community-report verification and valid official advisories remain distinct.

### Spatial inputs and precision

Intersect mapped INGEMMET susceptibility with road geometry and catchment samples,
then combine it with area-weighted forecast rainfall. Retain official classes and
record unknown coverage. The existing HydroBASINS fallback has 11 coarse unions,
68 mapped crossings and links on 38 of 174 segments; associations are approximate,
and crossing sub-basins include downstream territory. See [catchment limitations](data/pe22-catchments.md).

One-kilometer display segments do not establish one-kilometer prediction accuracy.
Current operational rainfall uses the roughly 25-km IFS 0.25-degree grid; slopes
are sampled estimates and official road chainage remains uncalibrated. Unlinked
segments stay unknown. Preferred future DEM delineation can improve the fallback,
but its existence or accuracy must not be assumed.

### Assessment v1 and driver alerts

| Input | Role |
|---|---|
| Forecast rainfall, next 24/72 h and six-hour windows | Changing weather signal over the mapped catchment |
| Recent model-estimated rainfall, last 72/168 h | Antecedent wet-weather context, explicitly modeled |
| INGEMMET susceptibility | Static terrain predisposition, with regional-map precision |
| Catchment associations and sampled terrain | Spatial context with coverage and confidence |
| Valid SENAMHI activation advisory | Attributed official context, with its own severity and validity |
| Current SUTRAN/community incidents | Source-reported impacts, separately identified and verified |

Code computes deterministic, versioned attention rules and stores the inputs,
reasons, source times, rule version and coverage; an LLM may explain those facts.
The first categories, thresholds and freshness limits are implemented and
documented in the assessment brief. These are attention criteria, not fitted
landslide thresholds or calibrated disruption probabilities. Unknown issuance
metadata stays unknown. Current SENAMHI captures remain ineligible for automated
risk use until temporal checks support it.

F3 retains subscribed-driver WhatsApp alerts: confirmed road-condition changes,
fresh estimated climate-exposure escalation, and applicable official advisories.
Each message identifies its basis, stretch, observation/forecast window and source,
links the map, and respects consent, deduplication and notification policy. Missing
or stale inputs do not generate a new exposure escalation or imply safety.

### Evaluation and research

The delivery checks are rule boundaries, spatial matches, source freshness/validity,
unknown-data behavior and the consenting-user report → map → subscriber flow.
Publish measured coverage and delivery results without presenting them as disaster
prediction skill. Yaku 2023 remains a retrospective reconstruction, explicitly
labeled and separate from live conditions and forecasts.

**Deferred logistic research:** the participant previously approved a regularized
logistic pipeline for rainfall-related road-disruption onset. Its implementation,
reviewed labels and frozen 2024/2025 policy remain in [the training handoff](data/logistic-pipeline.md).
Six reviewed positives, only two mapped in one episode, zero verified non-event
windows and zero historically eligible feature rows leave real fitting blocked.
The approved exposure pivot removes that fitting task from the delivery path;
no uncertain background periods become verified negatives. Further weather-focused
ML needs a separate target and evaluation design. No real-data model or hazard
forecast-accuracy result has been produced.

---

## 5. Architecture

```
People on the road ──► Zavu (WhatsApp / SMS / email / voice) ──► signed webhook
        ▲                    │  ▲                                     │
        │ alerts, calls      │  │ voice agent tools (HTTPS)           ▼
        └────────────────────┘  └──────────── Next.js app (TypeScript, App Router, Vercel)
                                              ├─ Route handlers: Zavu webhook, incidents,
                                              │  segments, exposure, indicators,
                                              │  trips, passes, waitlist, reports, /api/v1 data API,
                                              │  n8n job endpoints (authenticated)
                                              ├─ Report pipeline: OpenAI STT → LLM extraction
                                              │  → snap to PE-22 → dedupe → confidence
                                              ├─ Climate-exposure assessment (forecast + susceptibility)
                                              │  → stored reasons, source times and unknown coverage
                                              ├─ Alert engine: subscriptions (F3) + trips (F4)
                                              │  → Zavu message / template / call
                                              ├─ Source/coverage validation + report verification
                                              └─ Web UI: MapLibre 3D terrain, layers, heat map,
                                                 dated exposure windows, environmental indicators,
                                                 /impacto traction page, paid-access gate
                                                          │
                                         Postgres + PostGIS (Supabase, Realtime)
                          segments · catchments · hazard zones · reports · incidents ·
                          incident_status_log · risk_scores · subscriptions · organizations ·
                          passes · dispatch_decisions · waitlist · trips · calls ·
                          weekly_reports · api_calls
                                                          ▲
n8n ── every 10 min: SUTRAN alerts (PE-22) → upsert + status archive → alert evaluation
    ├─ hourly: Open-Meteo, eligible SENAMHI context → exposure assessment → alert evaluation
    └─ weekly: report generation → delivery (email / WhatsApp template) → delivery log

Qatom ── sells Route Passes and company plans (time-based access); later lists
          /api/v1 endpoints as paid tools for agents (per call)

Offline (one-time, scripts in the repo): catchment delineation (WhiteboxTools CLI),
segmentation and overlays (PostGIS SQL + TypeScript / Turf.js), evaluation scripts
```

### Stack

| Layer | Technology |
|---|---|
| Web app and API | Next.js (TypeScript, App Router, route handlers), deployed on Vercel |
| 3D map and visualization | MapLibre GL JS (terrain, heat map, timeline animation) + a light chart library for the indicator panel |
| Database | PostgreSQL + PostGIS (Supabase, with Realtime for live incidents) |
| Geospatial processing | PostGIS SQL, TypeScript scripts (Turf.js), WhiteboxTools CLI for catchments |
| Data formats | GeoJSON (vectors), GeoTIFF (DEM, rasters during preprocessing), vector tiles if layers get large |
| Messaging and calls | Zavu (WhatsApp, SMS fallback, email, Voice Agents) |
| Voice-note transcription | OpenAI speech-to-text using the existing credential; synthesized replies optional |
| Scheduled jobs, alerts and weekly reports | n8n |
| Payments for passes and subscriptions; agent data API | Qatom (Yape with manual activation as fallback) |

### Stack decisions

- **Calls use Zavu Voice Agents.** Zavu already runs our WhatsApp channel and includes telephony, speech recognition and speech synthesis for calls, so a call is one API request with no extra provider or phone number. We considered ElevenLabs Agents and the Grok Voice Agent API; both need a separate telephony provider (e.g. Twilio or a SIP trunk). ElevenLabs Agents over Twilio remains the fallback if the Zavu voice check fails.
- **Voice-note transcription uses OpenAI.** The implemented adapter transcribes bounded authenticated audio using the existing credential, then enters the confirmed-report flow. ElevenLabs and synthesized voice replies are optional alternatives, not required dependencies.
- **No separate agent host (Maritime) and no external memory service (Memory Cloud).** Agent logic runs in Next.js route handlers and the voice agent runs on Zavu. Reporter history and reputation are Postgres queries, which keeps the confidence score deterministic and auditable.
- **n8n cloud uses HTTP Request nodes** to call Zavu, SUTRAN and our endpoints. The Zavu community node only installs on self-hosted n8n.
- **SUTRAN's public JSON API instead of scraping its map.** The map is backed by an unauthenticated JSON API with CORS enabled; it is not documented as a public API, so we cache it, poll it gently, and keep our own archive in case it changes.

### Sponsor tools

| Tool | Our use |
|---|---|
| **Zavu** | The whole messaging channel: inbound reports, queries, WhatsApp alerts and templates, SMS fallback, weekly report email, and outbound call alerts through Voice Agents |
| **ElevenLabs** | Optional alternative only; current voice transcription uses OpenAI |
| **n8n** | SUTRAN, Open-Meteo and SENAMHI ingestion, risk recalculation and alert evaluation, weekly report generation and delivery |
| **Qatom** | Sells Route Passes and company plans; later, the data API that agents pay per call |

### Core data model

- **segment**: id, road (PE-22), km_start, km_end, geometry, elevation_m, susceptibility_class, catchment_ids[]
- **catchment**: id, pour_point, geometry, area_km2, mean_slope, method (dem / hydrobasins), sample_points, low_confidence
- **report**: id, reporter_key (HMAC), channel (whatsapp / call), raw_text / audio_url / photo_url, transcript, lat/lng (if shared), extracted {type, km, severity, time}, created_at
- **incident**: id, segment_id, type (huaico / derrumbe / inundación / bloqueo / accidente / obra), origin (official / community), external_ref (SUTRAN code), source_entity, road_status (interrumpido / restringido / normal), status (active / clearing / cleared), confidence 0–1, report_ids[], first_seen, last_confirmed
- **incident_status_log**: incident_id, observed_at, road_status, status, source
- **risk_score**: catchment_id, computed_at, forecast_issued_at, weather_model, grid_resolution_km, horizon (24h / 72h), level, score, inputs, reasons[]
- **subscription**: id, contact_ref, phone_key (HMAC), road, km range, channel, consent_at, opted_out_at, is_team
- **organization**: id, name, access_code_hash, report_channel, report_stretches, cost_per_hour (optional, entered by the company)
- **pass**: id, phone_key or organization_id, plan (route_pass / company_dashboard / company_predictions), days, route (from/to), starts_at, expires_at, payment_method (qatom / yape), payment_ref, amount, status
- **dispatch_decision (deferred design only)**: id, organization_id or phone_key, origin, destination, depart_at, vehicle_type, recommendation (salir / esperar / no_salir), reasons[], segment_levels, best_window, cost_at_stake, model_inputs, created_at, outcome (passed / delayed / stopped)
- **waitlist**: id, company, contact_name, role, fleet_size, routes, contact_ref, consent_at, created_at
- **trip**: id, organization_id (optional), contact_ref, phone_key, origin_km, destination_km, depart_at, avg_speed_kmh, status, call_consent_at
- **call**: id, trip_id, incident_id, provider_call_id, purpose (alert / confirmation), status, duration_s, transcript, outcome
- **weekly_report**: id, organization_id, period_start, period_end, data (JSON), page_url, sent_at, channel, delivery_status
- **api_call**: id, endpoint, params, qatom_tx_ref, created_at

**Contacts and privacy:**
- A hash cannot be used to send a message, so each subscription and trip stores a **delivery reference** separately from the **matching key**:
  - `contact_ref`: the provider's contact / recipient ID from Zavu if available; otherwise the destination number **encrypted** with an application key (e.g. AES-256-GCM, key in a secret store, never in the repository).
  - `phone_key`: a keyed hash (HMAC-SHA256 with a secret pepper) of the normalized number, used to match reports, subscriptions, trips and reputation without reading the number.
- Raw numbers are never logged or shown; reporters are never shown publicly.
- Decryption happens only in the alert- and call-sending path.
- Opt-out deletes or disables the delivery reference. Calls are placed only after explicit call consent.
- Call transcripts are stored without the phone number and are visible only to the owning organization.

**Confidence (v1)** depends on:
- the number of independent reporters
- reporter reputation (past reports later confirmed)
- whether there is a photo
- a shared location vs. text only
- confirmation during a call
- a matching official SUTRAN incident
- agreement with the risk level / SENAMHI warning
- decay over time

Low confidence is shown clearly as **"no confirmado"**.

---

## 6. Integrations and data sources: practical checks

**Only the items marked "Checked 2026-10-17" have been verified.** Every other item needs a practical check at H0–2 (owner in parentheses). Record each result in `getting-started/PROGRESS.md`. If a check fails, use the fallback and document it in the README.

### Messaging, voice and payment services

| Integration | Practical check | Pass criterion | Fallback |
|---|---|---|---|
| Zavu inbound WhatsApp (Messaging) | Send text, voice note, photo and location to the number | Webhook receives all four with media URLs downloadable | SMS / Telegram via Zavu for the demo |
| Zavu outbound alerts (Messaging) | Send a message to a user **outside** the 24-hour conversation window | Message delivered. WhatsApp requires an approved template for business-initiated messages; submit alert and weekly-report templates at H0 and record approval time | Alerts by SMS; WhatsApp only inside the 24 h window |
| Zavu contact reference (Messaging) | Check whether the API exposes a stable contact / recipient ID usable as a send target | ID can be stored and used to send | Encrypted destination number |
| Zavu Voice Agents (Messaging) | Place an outbound call (`POST /v1/calls`, live key) to a Peruvian mobile (+51) with a Spanish (`es`) voice and a per-call greeting; call a tool on our API during the call | Call connects, Spanish is understandable, tool result is spoken, transcript retrieved; cost per minute and caller ID recorded | ElevenLabs Agents outbound via Twilio; otherwise WhatsApp-only alerts |
| Zavu agent scope (Messaging) | Enable the voice agent and send a WhatsApp message to the same sender | WhatsApp messages still reach our webhook pipeline and are not auto-answered by the agent | Use a separate sender for voice |
| Zavu inbound audio transcription (Messaging) | Check whether inbound voice notes arrive with a transcript | Transcript present and usable | ElevenLabs Scribe (planned) |
| ElevenLabs speech-to-text (Messaging) | Transcribe a real WhatsApp voice note (OGG/Opus, Peruvian Spanish, road noise) | Usable transcript of location and incident type | Ask the user to type, or use another STT |
| LLM structured extraction (Messaging) | Run on 10–20 real road messages | Correct type and location on most; failures logged | Ask the reporter a follow-up question |
| n8n (Data) | Ingestion job calls SUTRAN and the authenticated recalculation endpoint; weekly job generates and delivers one report | Each runs twice successfully | Cron in the hosting platform |
| Qatom time-based access (Platform) | Create a provider account; check whether Qatom can sell a 1-, 4- and 7-day pass and a 30-day company plan to a person paying in soles or by card, and notify our app (webhook or verifiable receipt) | A test purchase activates a pass in our database | Yape payment with manual activation in the admin page |
| Yape fallback (Platform) | Set up a team Yape number for test-price passes and record each payment reference | A payment can be matched to a pass | Plin or bank transfer, same manual flow |
| Qatom agent API listing (Platform, second priority) | List `/api/v1/route-risk` as a paid tool and call it from an MCP client with a funded agent wallet | Paid call returns our data and the transaction is recorded | API works with an API key; listing documented as pending |

### Weather and evaluation data

| Integration | Practical check | Pass criterion | Fallback |
|---|---|---|---|
| Open-Meteo forecast (Data) | Fetch hourly precipitation for catchment sample points | Data returned for all points | — |
| Open-Meteo Previous Runs (Data) | Fetch `precipitation_previous_day1..3` for PE-22 points, Jan–Apr 2024 and 2025 | Complete series for the chosen model | Fewer lead times or another model |
| Open-Meteo Historical Weather (Data) | Fetch Feb–Mar 2023 precipitation | Complete series | — |
| Historical event records (Data) | Find dated, located huaicos / closures on PE-22 for 2023, 2024 and 2025 (INDECI, news; SUTRAN has no public archive) | A list with date, km or place, and source for each | If too few, report it; no skill claim |

### Geospatial and road data

| Integration | Practical check | Pass criterion | Fallback |
|---|---|---|---|
| SUTRAN live alerts (Data) | **Checked 2026-10-17.** `GET api.sigea.sutran.gob.pe/public/alerts` returns JSON without authentication (CORS open): 12 current alerts nationwide, 3 on PE-22 (km 51, 64+800, 96), each with code, lat/lng, km, road status, cause, description, district, direction, validity dates and reporting entity; `/public/alerts/{id}/historial` returns status changes; a WebSocket used by the map accepted an unauthenticated connection, but no update message was observed. Pending: terms of use, update frequency, WebSocket message format, and an endpoint for expired alerts (none found) | Polled and stored for PE-22 | Community reports only; manual snapshot |
| SUTRAN road network and hydrography (Data) | **Checked 2026-10-17.** `/public/road-network/segments?red=nacional` returns MTC segments with km start/end, surface and condition; GeoJSON files for the national network (~4.9 MB) and rivers / quebradas (~2.9 MB, 1,225 lines) are linked from the map. Pending: extract PE-22 and check km references against SUTRAN alerts | PE-22 geometry with km reference | OpenStreetMap (`ref=PE-22`); ANA downloads |
| Catchments (Data) | Delineate catchments for PE-22 crossings | Polygons that drain to the road at the expected points | HydroBASINS level 12 |
| SENAMHI warnings and stations (Data) | Find a feed, service or downloadable file | Machine-readable warning areas and levels | Manual snapshot, documented |
| INGEMMET / CENEPRED hazard layers (Data) | Load susceptibility layers for the corridor | Layers clip to PE-22 | Static download, documented |
| ANA basins and rivers (Data) | Download hydrographic units for the Rímac / Mantaro area | Loads in PostGIS | SUTRAN hydrography / OpenStreetMap / HydroSHEDS |
| Terrain tiles (Frontend) | 3D terrain renders for the corridor | Smooth on the presentation laptop | Lower terrain resolution |

**Rule:** if an official source has no usable automated access, load a static snapshot and document it in the README and the demo.

---

## 7. Roles

Four technical roles; section 8c lists each member's tasks. Pitch, user outreach and traction tasks (sections 9 and 10) will be assigned separately.

| Role | Owns |
|---|---|
| **A. Platform, payments and API** | Repo, deploy, schema, CI, security helpers, read APIs and Realtime, passes and payment (F7), paid-access gate, admin page, traction and waitlist backend (F10) (payments/Qatom excluded; F9 deferred) |
| **B. Messaging and voice agent** | Zavu webhook, templates and voice agent, OpenAI transcription, extraction, geocoding, dedupe, confidence, alert engine (F1–F3), weekly report delivery (F6), trips and calls (F4) |
| **C. Data and model** | Data integration checks, SUTRAN ingestion and archive, segments, catchments, climate-exposure assessment, environmental indicators and coverage validation, reconstruction and exposure evaluation, n8n jobs (ingestion and weekly report) |
| **D. Frontend and visualization** | Next.js UI, MapLibre 3D map, layers, heat map, timeline, indicators and charts, route profile, stretch selector, dated environmental exposure windows and coverage, `/impacto` and waitlist form (F10), purchase screens, report page (F6), export, live updates |

AI coding tools are used for boilerplate. The risk, confidence and evaluation logic is written and understood by the team.

---

## 8. Timeline (H0 = hacking starts)

All implementation, validation, submission, and pitch preparation fit within
**30 hours**. The backend, data/model, and frontend roles work in parallel;
pitch and user-outreach tasks will be assigned separately. Confirm the
organizers' actual submission cutoff at H0; if it is earlier than H30, move the
submission and final checks forward to finish at least 30 minutes before it.

**The organizers' evaluation sheet sets the deadline at Sunday, October 18, 09:00 (America/Lima).** Section 8c maps this schedule to clock times ending at that deadline; if the two disagree, section 8c governs.

| Hours | Goal | Done when |
|---|---|---|
| **H0–2** | Align and set up | Read this doc; section 6 checks started (including one Zavu test call to a +51 number) and the WhatsApp alert and weekly-report templates submitted; Zavu number live; Qatom provider account created and time-based sale checked; Route Pass test price set; repo, database and deploy working; demo script written |
| **H2–8** | Thin skeleton, end to end | A WhatsApp message creates a pin on the map (even if extraction is crude); SUTRAN PE-22 alerts on the map and archived; PE-22 segments and catchment crossing points loaded; first Open-Meteo pull |
| **H8–10** | **Launch to real users** | Number shared in WhatsApp groups (drivers, family, friends who travel the Central); waitlist form live; usage recorded in the database from the first real user |
| **H10–18 (night)** | Core (P0) | Extraction + dedupe + confidence; catchments delineated; climate-exposure assessment v1; subscriptions + alerts; SENAMHI ingestion; Yaku 2023 reconstruction data, 2024–2025 archived forecasts and event records loaded |
| **H18** | **Core integration checkpoint** | The live reporting → dashboard → subscriber alert flow works from start to finish; go / no-go decision on F4 call alerts based on the Zavu voice check |
| **H18–24** | Environmental delivery readiness (P1), then optional F6 | Confidence/clearing and report grouping; template delivery verification; exposure rules, spatial coverage/freshness and alert transitions; missing environmental indicators and explanations; `/impacto` (F10) and WhatsApp queries; **then, optionally, F6 weekly report**. F9 deferred and payments excluded; no new transport features |
| **H18–22 (in parallel)** | **Terminal visit** | One or two members go to the Central bus/colectivo terminals (e.g. Yerbateros): ~10 interviews, sign-ups, willingness-to-pay answers, photos/video |
| **H22–29 (in parallel)** | Pitch preparation | Slides, real usage evidence, 5 or more timed rehearsals, and Q&A preparation completed |
| **H24** | **Feature freeze** | Full MVP works end to end; no new features after this point |
| **H24–27** | Harden | Critical flows checked; pre-loaded demo data, demo paid organization and cached responses ready; Wi-Fi fallback and 60-second backup video recorded; GitHub setup instructions verified |
| **H27** | **Code freeze** | Only fixes for demo blockers and submission issues from this point |
| **H27–29** | Final validation | Public app, paid access code and presentation checked from a fresh session; complete demo rehearsed; deliverables ready |
| **By H29:30** | **Submit** | All four deliverables saved at least 30 minutes before H30, or earlier if the official cutoff requires it |
| **H29:30–30** | Verify and prepare to present | Saved submission and links verified; presentation and backup ready |

---

## 8b. Start checklist

- [ ] Everyone has redeemed the sponsor credits (Zavu, ElevenLabs, n8n, Qatom; Memory Cloud and Maritime are not used)
- [ ] Zavu WhatsApp number active and receiving webhooks; live API key available for calls
- [ ] WhatsApp alert and weekly-report templates submitted for approval
- [ ] Zavu voice enabled on the agent and one test call placed to a team member's +51 phone
- [ ] Qatom provider account created; time-based pass sale checked; Yape fallback ready; Route Pass test price set
- [ ] Member names written next to A–D in section 8c
- [ ] SUTRAN alerts polling started (so our status archive covers the whole event)
- [ ] Section 6 checks assigned to owners
- [ ] Collect 10–20 real messages from WhatsApp groups about road conditions (test set for extraction)
- [ ] List of WhatsApp/Facebook groups for travelers on the Central where we can share the number
- [ ] Check event rules on pre-existing code

---

## 8c. Team organization: technical task split (4 members)

This section covers technical work only. Pitch, user outreach and traction tasks (sections 9 and 10) will be assigned separately.

### Members and ownership

| Member | Technical area | Owns |
|---|---|---|
| **A** | Platform, payments and API | Repo, deploy, database schema, CI, security helpers, read APIs and Realtime, passes and payment (F7), paid-access gate, admin page, traction and waitlist backend (F10) (payments/Qatom excluded; F9 deferred) |
| **B** | Messaging and voice agent | Zavu (WhatsApp, SMS, email, calls), OpenAI transcription, report pipeline (F1), ask (F2), subscriptions and alert engine (F3), report delivery (F6), call alerts (F4) |
| **C** | Data and model | SUTRAN and weather ingestion (F8), segments, gazetteer, catchments, hazard layers, climate-exposure assessment, environmental indicators and coverage validation, Yaku reconstruction, exposure evaluation, weekly report data (F6), n8n workflows |
| **D** | Frontend and visualization | Public and paid dashboard (F5a, F5b), dated environmental exposure windows and coverage, `/impacto` page and waitlist form (F10), purchase and access-code screens, report page (F6) |

Write each member's name next to their letter at the start of phase 0.

| Feature | Owner | Support |
|---|---|---|
| F1 Report by WhatsApp | B | C (gazetteer, segments) |
| F2 Ask by WhatsApp | B | C (risk), A (read API) |
| F3 Alerts | B | C (alert evaluation trigger), A (pass checks) |
| F4 Call alerts (P2) | B | C (exposure at assumed arrival time) |
| F5a / F5b Dashboard | D | A (read APIs, Realtime), C (layers, indicators) |
| F6 Weekly report (last) | C | B (delivery), D (page), A (job auth) |
| F7 Passes and payment | A | B (WhatsApp flow), D (purchase screens) |
| F8 Official data ingestion | C | A (schema) |
| F9 Departure planning — deferred | No current delivery owner | Future C engine / A API / B WhatsApp / D planner; not a completion gate |
| F10 Traction page and waitlist | A (backend) | D (page and form) |

### Phases (clock times, America/Lima)

The times assume work starts on Saturday at 13:30 and end at the Sunday 09:00 deadline. If work starts later, keep the order and shorten phase 3 first.

| Phase | Time | Technical goal | Checkpoint at the end |
|---|---|---|---|
| **0. Setup and contracts** | Sat 13:30–15:00 | Repo, deploy, database, Zavu number, templates submitted, API contracts agreed, SUTRAN polling started | 15:00: everyone can deploy; contracts in the repo |
| **1. Thin skeleton** | 15:00–19:00 | A WhatsApp message becomes a pin on the public map; SUTRAN incidents visible; waitlist form stores sign-ups | 19:00: the public URL is usable by real people |
| **2. Core (P0)** | 19:00–01:00 | F1, F3, F5a, F8 and the climate-exposure assessment working on real data | Sun 01:00: **core checkpoint**; go / no-go on F4 |
| **3. Environmental readiness (P1)** | 01:00–04:30 | Report confidence/clearing/grouping, template delivery check, spatial/exposure validation, F5b environmental indicators, F2 and F10; F9 deferred and F7 excluded | 04:30: remaining environmental reliability and evidence checks recorded, with limitations explicit |
| **4. Final evidence; optional F6** | 04:30–05:30 | Finish environmental demo/evidence first; generate/deliver F6 only if validation is complete and time remains | 05:30: **feature freeze**; unfinished optional work explicitly cut |
| **5. Harden** | 05:30–07:00 | Error handling, edge cases, tests, demo data, setup instructions | 07:00: **code freeze** |
| **6. Final validation** | 07:00–08:30 | Fresh-session check of every flow on the public URL; only fixes for blockers | 08:30: ready to submit (deadline 09:00) |

**Stand-ups (5 minutes):** at 15:00, 19:00, 22:00, 01:00, 04:30, 05:30 and 07:00. Each member says what is done, what is blocked, and what is next. During the night (01:00–05:00), each member takes one 90-minute rest, staggered so that at least two members are always working, and never during a checkpoint.

**Working rules:**
- Follow `AGENTS.md`: C and its platform integration stay on `feat/data-model` with the consolidated PR; other members retain their branches. Teammate review and passing CI are required before merge to `main`.
- Shared contracts cover incidents, segments, exposure, source metadata and stats. Existing dispatch contracts stay compatible but unavailable; F9 is deferred and requires no engine or consumer work in this delivery.
- Secrets live in the hosting platform and `.env.local`; the repo has only `.env.example`.
- Every external call (Zavu, ElevenLabs, LLM, SUTRAN, Open-Meteo, Qatom) goes through A's shared wrapper with a timeout, a retry and a visible fallback.

### Member A: platform, payments and API

Payment/Qatom/Yape tasks below remain excluded background; F9 is deferred.

| Phase | Task | Done when |
|---|---|---|
| 0 | Next.js repo (TypeScript, App Router), Vercel deploy, Supabase with PostGIS, schema migrations for every table in section 5 (with C), `.env.example`, CI with lint, type check and tests on each pull request | `main` deploys to the public URL; migrations run from scratch |
| 0 | Security helpers: AES-256-GCM contact encryption, HMAC phone key, webhook-signature helper, external-call wrapper (timeout, retry, logging without phone numbers) | Helpers merged with tests |
| 0 | Write the API contracts with B, C and D; create the Qatom provider account and run the time-based access check (section 6) | Contracts merged; check recorded in `PROGRESS.md` |
| 1 | Read APIs for the dashboard (`/api/incidents`, `/api/segments`, `/api/risk`) over C's tables; Supabase Realtime channel for incidents; seed script with demo data | D's map reads real endpoints |
| 1 | Waitlist API and storage (F10); `is_team` flag and the team's phone keys | A sign-up from D's form is stored |
| 2 | Entitlements: `pass` table, `hasActivePass(phone key or organization)`, organization access code with signed cookie, middleware protecting paid routes | Paid routes reject requests without an active pass |
| 2 | `/api/stats` for `/impacto` (F10) with the exclusion rules (team, test numbers, automated traffic) | Counts match a manual SQL check |
| 3 | Passes and payment (F7): Qatom checkout and confirmation, or Yape pending → manual confirmation; pass activation, expiry job, 12 h reminder (sent through B's send helper); company plan purchase backend | A test payment activates a pass that expires on time |
| 3 | Protected admin page: pending Yape confirmations, active passes and subscriptions | The team can confirm a payment from the page |
| Deferred | F9 dispatch API integration | Preserve the honest unavailable response; no successful decision is required for delivery |
| 4 | Authentication for n8n job endpoints; storage and access control for weekly reports (F6) | n8n calls succeed only with the job secret |
| 4 | Qatom agent API listing (second priority, only if P1 is done) | One paid call recorded |
| 5 | Quality pass: secrets scan, error responses, edge cases (expired pass, duplicate payment, bad input), tests for payments and entitlements green; seeded demo organization and access code; README setup instructions | A fresh clone runs with the README steps |

### Member B: messaging and voice agent

Prioritize report trust, grouping and reliable environmental notices. Weekly
reports, calls and voice replies are optional; no departure flow is required.

| Phase | Task | Done when |
|---|---|---|
| 0 | Zavu number and signed webhook; alert utility template submitted; OpenAI transcription and LLM configured; voice calls/replies optional and payment templates excluded | Actual setup and participant audio test results recorded in `PROGRESS.md`; template delivery approval checked separately |
| 1 | Message router: environmental report, status/exposure query, subscriptions, *BAJA* and fallback help; *PASE* excluded and departure questions deferred | Supported commands reach their handler without promising unavailable features |
| 1 | Webhook → store report (download media) → crude extraction → incident → acknowledgment reply | A real WhatsApp message shows on the public map |
| 2 | OpenAI transcription and schema-validated extraction (implemented); complete 2-minute grouping and real-message validation; preserve pin/gazetteer confirmation and missing-input follow-up | Tests pass on 10–20 real anonymized messages; synthetic fixtures remain labeled |
| 2 | Dedupe against community and SUTRAN incidents; confidence v1; clearing logic | Tests for dedupe and confidence pass |
| 2 | Subscriptions and alert engine (F3): free closure alerts vs pass alerts, source-triggered route alerts with duplicate suppression, five-minute recovery and no quiet hours, approved-template fallback outside the 24 h window (SMS requires separate consent); send helper with retry | A subscriber receives an alert for a new incident |
| 3 | Ask by WhatsApp (F2): short text replies with environmental exposure, source dates and map link; voice replies optional | Status/exposure questions receive source-grounded summaries |
| Deferred / excluded | Departure questions (F9) are deferred; *PASE* payments are excluded | Neither flow is a delivery requirement; responses must not fabricate availability |
| 4 | Weekly PDF opt-in, cancellation and document delivery; approved reply-PDF notice outside the conversation window (F6) | One consenting driver receives the PDF attachment; approval and receipt recorded separately |
| 4 | Call alerts (F4) only if the 01:00 decision was *go*: trip registration, call consent, trigger evaluation, `POST /v1/calls` with greeting, agent tool endpoints, transcript storage | One consenting phone received a call |
| 5 | Verify Zavu, OpenAI transcription and LLM failure handling (timeouts, safe retries, Spanish fallbacks); confirm out-of-window utility-template delivery | Failures produce visible recovery states; record actual delivery evidence |

### Member C: data and model

The assessment/refresh pipeline is implemented. Remaining priorities are evidence,
spatial/temporal validation, missing environmental aggregates and reproduction;
F9 is deferred and F6 is last and optional.

| Phase | Task | Done when |
|---|---|---|
| 0 | **SUTRAN poller** in n8n (every 10 min): PE-22 alerts in force, upsert by `id`, changes by `lastActionAt`, status archive | PE-22 alerts stored with history |
| 0–1 | PE-22 geometry and 1-km segments with km references and elevation; place-to-km gazetteer for B | Segments in PostGIS; gazetteer merged |
| 1 | Open-Meteo forecast pull for sample points; downloads of Previous Runs (Jan–Apr 2024 and 2025) and Historical Weather (Feb–Mar 2023) | Data stored |
| 1–2 | Crossing points; catchment delineation (WhiteboxTools) or HydroBASINS fallback; rivers, susceptibility and SENAMHI layers exported as GeoJSON for D | Catchments linked to segments; layers load on the map |
| 2 | Implement versioned climate-exposure rules: 24/72-hour summaries and six-hour windows, stored inputs/reasons, source validity and coverage; hourly refresh → assessment → B alert evaluation | Mapped areas have reproducible assessments; unsupported segments stay unknown; freshness and rule tests pass |
| 2 | Yaku 2023 reconstruction series; list of dated PE-22 events for 2024 and 2025 | Data ready for the timeline and the evaluation |
| 3 | **Environmental assessment validation:** review catchment/terrain associations and rainfall overlap, explicit assessed/unknown coverage, dated windows and uncertainty; improve spatial links only where supported | Reproducible evidence supports every assessed association; unsupported segments remain unknown; no full-coverage or forecasting-skill claim |
| 3 | Validate exposure rules, source freshness/coverage, map associations and alert changes; document reconstruction and deferred ML blockers separately | Evidence and limitations documented; no unsupported forecast-skill claim |
| 3 | Complete missing environmental indicators for D: km by attention category/window, assessed/unknown coverage, rainfall per catchment and environmental reports by type/source; keep observed restriction/closure durations separate | Real, traceable aggregates reuse existing APIs; no departure-chart matrix |
| 4 | **F6 weekly PDF:** environmental aggregates, stored PDF, bounded fact selection and n8n weekly/retry/DEMO workflows | One reproducible PDF generated with actual coverage and no invented figures |
| 5 | Data documentation: sources, terms, retrieval method, resolution limits, evaluation; check that the scripts reproduce the outputs | Scripts run from a clean database |

### Member D: frontend and visualization

Focus remaining work on environmental explanations, indicators and device checks;
purchase screens are excluded, F9 is deferred and F6 is optional.

| Phase | Task | Done when |
|---|---|---|
| 0 | UI shell and routing; MapLibre 3D terrain and fly-in from Peru to PE-22; mocks that follow the API contracts | Map renders on the public URL |
| 1 | Live incidents layer (community and SUTRAN) and incident panel; waitlist form (F10) | A WhatsApp report appears live; the form stores sign-ups |
| 2 | Estimated climate-exposure layer and panel; rainfall, catchments, susceptibility and valid SENAMHI advisories; live conditions, unknown coverage and *"no confirmado"* kept distinct | F5a complete on real data with source/age/uncertainty visible |
| 3 | Environmental exposure windows, reasons, source freshness and assessed/unknown coverage; preserve demo access where required | Users can inspect when/where attention is elevated and why; F9 planner/chart deferred and purchase screens excluded |
| 3 | Paid view: timeline with Yaku reconstruction mode, 24 h / 72 h toggle, stretch selector, indicator panel, route profile, rainfall-vs-risk chart, export | F5b works with the demo access code |
| 3 | `/impacto` page reading `/api/stats` (F10) | Counts render and match the API |
| Future | Organization report page/archive | Driver PDFs are delivered as attachments; a new report page is not required |
| 5 | Loading, empty and error states; performance on the presentation laptop; phone-width check | Fresh-session walkthrough passes |

### If we fall behind

At the 01:00 checkpoint, apply the existing optional-feature cut order: F4 calls → voice-note replies → response layer and export → F6 weekly report → rainfall-vs-exposure chart. Keep F1, F3 driver alerts, F5a, F8 live conditions, climate-exposure assessment/validation and `/impacto`. F9 departure support is already deferred and must not consume the remaining delivery time. Payments/Qatom/Yape remain excluded; classifier training is deferred research.

---

## 9. User evidence and traction plan (problem and impact 15% + traction bonus up to 0.5)

The evaluation sheet scores a real user within our track under **problem and
impact (15%)** and adds a **traction bonus**: +0.25 when people outside the team
used the product and it shows in its records, and +0.5 for repeated use, visible
volume, a real waitlist, or a payment. The evidence must come from the product,
so the metrics below are read from the database on the `/impacto` page (F10),
excluding team members and test numbers.

**Bonus targets:**
- **+0.25:** real reports, queries and subscribers from people outside the team.
- **+0.5:** returning users, company waitlist sign-ups, and at least one real Route Pass payment.

**Metrics tracked live on `/impacto`, shown on a slide at the end:**
- Reports received / unique reporters
- Queries answered
- Subscribers to alerts
- Returning users (used it more than once)
- Route Passes sold and companies on the waitlist
- Environmental exposure views/queries only if instrumented; no inferred preparedness benefit or dispatch completion count
- Calls placed and answered (if F4 is delivered)
- Interviews done + the top 3 things we learned and changed

**How we get users:**
1. Share the number in groups of travelers and drivers on the Central, and in our own networks.
2. Go in person to the terminals. Drivers are there waiting; ask them about the last time a huaico caught them.
3. Ask every interviewee: *"Would you use this?"* and *"Would your company pay for it?"* Write down quotes, and offer the waitlist (companies) or a Route Pass (drivers about to travel).

**Interview questions (5 min max):**
- How do you find out today whether the Central is open? Do you use the SUTRAN map or *Viaje Seguro*?
- Last time you got stuck: what happened, how long, what did it cost you?
- Would you send a voice note to report a blockage? Would you want an alert before leaving?
- Would you take a short call on the road about a hazard ahead, or prefer a WhatsApp message?
- (Dispatchers and company staff) How do you decide today whether a bus or truck leaves when the Central may be blocked? What did the last stranded vehicle cost you in hours, fuel or penalties? How do you warn drivers already on the road? What do you pay for that information now?

---

## 10. Demo script (3 minutes)

| Time | What happens |
|---|---|
| 0:00–0:20 | **Problem.** One driver's story from our interviews + one figure (e.g. days the Central was closed during Yaku) |
| 0:20–0:35 | **What it is.** PeruRoad Climate in one sentence |
| 0:35–1:10 | **Environmental dashboard.** Show forecast rainfall overlapping susceptible terrain, a dated six-hour possible-huaico estimate, source freshness and assessed/unknown stretches. Current SUTRAN impacts remain separate context; historical reconstruction is optional and labeled |
| 1:10–2:00 | **Live.** Send an explicitly labeled DEMO environmental voice report → review location → typed confirmation → unconfirmed DEMO marker. Show the consenting participant's recorded alert check, or run an eligible DEMO notification; keep the participant-approved unverified-report alert explicitly labeled and separate from verified evidence |
| 2:00–2:25 | **How it works.** Forecast rain + official susceptibility + valid advisories; code computes exposure, the LLM explains verified inputs; show source freshness, coverage and evaluation limits |
| 2:25–2:45 | **Preparedness and value.** Explain which supported stretches need attention during the selected forecast window, why, and how subscribed people receive concise notices. Show actual user evidence and limitations; departure planning is deferred and payments excluded |
| 2:45–3:00 | **Users and next steps.** Real usage numbers, interview quotes, Piura/Tumbes and more corridors |

**Anticipated questions:**
- What about false reports? (confidence score, reputation, "no confirmado", matching SUTRAN incidents, confirmation from nearby users and calls)
- What does the assessment establish? (estimated climate exposure and attention priority; tested rules, source coverage and freshness; no fitted disruption probabilities or verified hazard-prediction accuracy)
- Why is the Yaku replay not proof of prediction? (it uses rain that actually fell; advance-warning claims come only from archived forecasts on held-out seasons)
- Why combine these sources? (official advisories, static susceptibility, forecast rainfall and live road impacts answer different questions; we attribute each and connect supported areas to driver subscriptions)
- Isn't calling a driver who is driving dangerous? (consent first, short hands-free message that needs no answer, WhatsApp follow-up, pre-departure alerts preferred)
- Who pays, and why would reporters keep reporting for free? (drivers pay for a Route Pass only for the days they travel; companies pay for dashboard access or dispatch predictions; reporting and closure alerts stay free)
- Why is this an environmental product? (rainfall and terrain determine estimated exposure; the map explains where/when attention is needed, and reports/notifications connect that evidence to preparedness. Departure planning is deferred)
- Can you sell government data? (we sell derived risk scores and merged incidents and link official incidents to their public source; source terms are listed in the README)
- How do you store phone numbers? (encrypted delivery reference or provider contact ID, HMAC key for matching, opt-out)
- What does the AI do vs. our code?
- What fails first, and what would we do with 3 more months?

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| No environmental event during the demo | Show real forecast exposure and current conditions as they are; retain non-climate traffic incidents as separate context and use an explicitly labeled Yaku reconstruction or test fixture for the hazard flow |
| SUTRAN's undocumented API changes, rate-limits or goes down | Cache and poll every 10 minutes at most; keep our own archive; fall back to the last snapshot, labeled with its time |
| WhatsApp template approval is slow or rejected | Record the delivery limitation; keep approved in-window replies working and retry pending deliveries within their validity. No SMS without separate consent and implementation |
| Zavu Voice Agents (beta) cannot call +51 numbers, sound poor in Spanish, or cost too much | Test at H0; fallback ElevenLabs Agents via Twilio; otherwise F4 stays WhatsApp-only and is presented as future work |
| Calls distract drivers | Explicit call consent, ≤2 min hands-free message that needs no reply, one call per incident per trip, pre-departure alerts by WhatsApp |
| Drivers ignore calls from an unknown or foreign number | Save-the-contact message at trip registration; WhatsApp follow-up after each call |
| Qatom cannot sell time-based passes, or payment fails | Yape with manual activation in the admin page; agent API works with an API key and its Qatom listing is documented as pending |
| No real payment during the event | Waitlist sign-ups and returning users still count toward the bonus; offer the test-price pass at the terminal |
| The deadline (Sunday 09:00) leaves less time than 30 hours | Clock schedule in section 8c; cut order applied at the 01:00 checkpoint |
| Monetization work takes time from the core | Payments handled by the provider or Yape; entitlements are a `pass` table and an access code; P1 starts only after the core checkpoint |
| Data terms do not allow resale | Sell derived products only; list each source's terms; drop a source from the API if its terms forbid it |
| Too few dated incidents to train/evaluate a disruption classifier | Deliver transparent climate-exposure assessment; retain the blocked classifier as research and make no calibrated hazard-prediction claim |
| Rainfall grid too coarse for small quebradas | State the resolution; group small catchments and flag them low-confidence |
| Catchment delineation fails or is slow | HydroBASINS level 12 fallback, documented |
| Government data has no usable feed | Static snapshot, documented |
| Locating "pasando el puente" fails | Ask the reporter to share their WhatsApp location as fallback |
| Live demo breaks (Wi-Fi, API slowness) | Pre-loaded data, cached responses, phone hotspot, backup video |
| Phone numbers leak | Encrypted delivery reference, HMAC matching key, no raw numbers in logs, secrets outside the repo |
| Scope creep | Section 3 priority tiers are the contract. Nothing from P2 until P1 works end to end; no new features after the H24 freeze |
| Misleading alerts | Separate estimated climate exposure, valid official advisories and verified incidents; show sources, times and unknowns, and suppress new automated exposure escalation on stale/incomplete data |

---

## 12. Definition of done

- [ ] A real person, not on our team, reported something by WhatsApp and it appeared on the dashboard
- [ ] A consenting subscriber received an alert outside the 24-hour window using an approved WhatsApp template; if blocked, record approval/delivery as unverified rather than claiming completion (SMS requires separate consent and implementation)
- [ ] SUTRAN PE-22 incidents ingested every 10 minutes and archived for the whole event
- [ ] Climate exposure refreshes hourly over supported catchments; unsupported segments and stale/missing inputs stay explicitly unknown/unavailable
- [ ] Exposure rules, source coverage/freshness and alert transitions verified; deferred ML and unavailable forecast-skill evaluation documented with reasons
- [ ] Yaku 2023 reconstruction on the timeline, labeled as a reconstruction
- [ ] Section 6 checks recorded with results and fallbacks used
- [ ] Public 3D dashboard with heat map and live incidents works from the public URL; paid view (timeline, indicators, route profile, export) works with the demo access code
- [ ] Dated environmental exposure windows explain rainfall/susceptibility reasons and assessed/unknown coverage; no departure planner or dispatch decision is required (F9 deferred)
- [ ] Existing demo entitlements work where required; real pass sales, Qatom and Yape remain excluded from this implementation
- [ ] `/impacto` shows real counts from outside the team; the company waitlist form stores sign-ups
- [ ] A separately consenting driver receives a weekly environmental PDF attachment; n8n schedule/retries and any template-approval limitation are recorded
- [ ] If F4 is delivered: a consenting phone on a registered trip received a call about a hazard ahead, and the call transcript is linked to the incident
- [ ] README with architecture, decisions, data sources and their terms, resolution limits, and what AI was used for
- [ ] Backup video recorded
- [ ] Pitch rehearsed 5+ times, under 3:00
- [ ] Submitted by Sunday 08:30, 30+ minutes before the 09:00 deadline, with public URL, live demo and GitHub repo
