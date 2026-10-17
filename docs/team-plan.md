# Hack the Andes — Team Plan

**Track:** Clima y Territorio
**Project name:** *PeruRoad Climate*
**One line:** A 3D road-risk dashboard for the Carretera Central that combines official climate, hazard and road data with incident reports sent by people on the road over WhatsApp, and warns subscribers and drivers by WhatsApp message or phone call.

---

## 1. Objectives and evaluation criteria

### Objectives

1. **Integrate** official data that today lives on separate platforms (SENAMHI, ENFEN, MTC, CENEPRED, INGEMMET, SUTRAN, ANA) and community reports into one 3D dashboard of the corridor.
2. **Estimate** the exposure of each road segment to huaicos, landslides and floods, and show **real-time** status plus a **24–72 h forecast** risk level.
3. **Collect and verify** reports from people near incidents through WhatsApp (text, voice note, photo, location).
4. **Warn** people before they reach a hazard: WhatsApp alerts for subscribers and phone calls for drivers on a registered trip.
5. **Make it sustainable:** a free channel for drivers and residents, paid dashboard access with weekly reports, and a pay-per-call data API on Qatom.
6. **Evaluate** the early-warning model honestly: archived forecasts issued before each event, on periods separate from calibration (section 4).
7. **Test with real users** during the event and document what we learned.

### Rubric

The current rubric has five criteria, as communicated by the participant:

| Criterion | Weight | What is assessed | How we demonstrate it |
|---|---|---|---|
| **Technical complexity** | 30% | Integrations, data, models, and architecture | Report verification pipeline + catchment-based risk model + forecast evaluation on held-out periods + trip-aware call alerts + paid data API |
| **Functionality** | 25% | A complete live workflow from the public URL | Public 3D dashboard + a WhatsApp report + the incident appears + a subscriber receives the alert (and, if delivered, a driver receives a call) + a weekly report generated + a paid API call |
| **Technical quality** | 20% | The judges review our GitHub repository | Clear architecture and setup instructions, documented data sources and configuration, reproducible risk logic, and focused checks for the critical flows |
| **Problem and impact** | 15% | A real user within our track | Live WhatsApp line used by real drivers + in-person interviews at the bus terminal (including willingness to pay) + evidence of what helped and what we changed |
| **Clarity** | 10% | Explanation of decisions and tradeoffs | Rehearsed 3-minute demo, justified technical choices, stated limitations, and precise answers |

**Technical criteria total 75%; product criteria total 25%.** Technical complexity
has the largest individual weight. The updated scoring scale and calculation
have not been confirmed, so we do not reuse the previous 1–5 scale or formula.
Using AI is not evidence by itself; every design decision is explained in the
repository.

### Design principles

- **A channel people already have** (WhatsApp and phone calls), not a new app.
- **The AI does a narrow job** (transcription, extraction and explanations), wrapped in our own deterministic logic with a verification step.
- **One corridor done deeply** (PE-22) rather than all of Peru done shallowly.
- **Observed, forecast and estimated information are always distinguished.** Potential scenarios are never shown as confirmed damage.
- **Every chart answers a decision question** (e.g. "should this truck leave tonight?", "which stretch needs a crew?"). A visualization that does not support a decision is cut.
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

**Track fit:** Clima y Territorio (huaicos, rain, alerts), with a transport impact.

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

| Surface | Free | Pro (organizations) | API (agents and developers) |
|---|---|---|---|
| WhatsApp line: report, ask, subscribe (F1–F3) | ✔ | ✔ | — |
| Public dashboard: live incidents, current risk, SENAMHI warnings, last 24 h (F5a) | ✔ | ✔ | — |
| Full dashboard: 72 h forecast, timeline and history, all layers, indicators, stretch analysis, export (F5b) | — | ✔ | — |
| Weekly report by email or WhatsApp (F6) | — | ✔ | — |
| Trip watch with call alerts for the organization's drivers (F4) | — | ✔ | — |
| Pay-per-call route-risk and incident data on Qatom (F7) | — | — | ✔ |

- **Who pays (hypotheses to test in interviews):** logistics and bus companies, insurers, and municipalities / COER for Pro; AI agents and developers for the API. Prices are not set; interviews ask what they pay today for this information and what they would pay.
- **Access control in the prototype:** an `organization` record with a plan flag (`free` / `pro`) and a hashed access code that unlocks the Pro views through a signed cookie. A seeded demo organization lets anyone with the shared code see the Pro views from the public URL.
- **No real payment processing in the prototype.** Qatom settles API calls (F7). If the Qatom check in section 6 shows it can also sell a monthly subscription, Pro checkout goes through Qatom; otherwise Pro is activated manually and checkout is future work.

### Priority tiers

- **P0, core (must work at the H18 checkpoint):** F1, F3, F5a, F8 and the risk model (section 4).
- **P1, complete MVP (must work at the H24 feature freeze):** F2, F5b, F6, F7 and Pro access.
- **P2, only after P1 works end to end:** F4 call alerts, then the items under "Second priority". The Zavu voice check (section 6) still runs at H0 so the decision on F4 can be made at H18.

### F1. Report by WhatsApp (P0)

People near an incident send it to our Zavu WhatsApp number.

- **Accepted inputs:** text, voice note (OGG/Opus), photo, location pin, or a mix. Messages from the same sender within 2 minutes are grouped into one report.
- **Pipeline:**
  1. Zavu webhook → signature verified → raw message stored (media downloaded from `mediaUrl`).
  2. Voice note → speech-to-text (ElevenLabs Scribe, Spanish).
  3. LLM structured extraction: `type` (huaico / derrumbe / inundación / bloqueo / accidente / obra / otro), `place_text`, `km` if stated, `direction`, `severity` (1–3), `lanes_blocked`, `observed_at`, `still_active`.
  4. **Location:** a shared pin is snapped to PE-22 (accepted within 500 m); otherwise `place_text` is matched against a PE-22 gazetteer (towns, bridges, quebradas, km markers: Chosica, Ricardo Palma, Matucana, San Mateo, Ticlio, Casapalca, Morococha, La Oroya…); otherwise the bot asks *"¿Puedes compartir tu ubicación?"*.
  5. **Dedupe:** same type, within ±2 km and 3 h of an active incident (community or SUTRAN) → merged into it; otherwise a new incident.
  6. **Confidence** recomputed (section 5).
  7. **Reply:** *"Gracias. Registramos un derrumbe cerca del km 74 (San Mateo). Estado: no confirmado, 1 reporte."*
- **Clearing:** *"ya limpiaron"* / *"ya pasa"* marks the incident as clearing; it becomes cleared after 2 independent reports, an official source, or decay.
- **Unclear messages:** if type or location cannot be extracted, the bot asks one follow-up question instead of guessing.
- **Photos** are stored and shown in the incident panel; reporter identity is never shown.

### F2. Ask by WhatsApp (P1)

- *"¿Cómo está la Central hasta Huancayo?"* → intent and stretch detected → reply with active incidents ordered by km (with confidence label and source), the highest risk level in the next 24 h for that stretch with its top reason, and any active SENAMHI warning.
- Text reply of at most ~600 characters with a link to the stretch on the public dashboard.
- If the question arrived as a voice note, the answer is also sent as a voice note (ElevenLabs text-to-speech).

### F3. Subscribe and WhatsApp alerts (P0)

- *"Avísame de la Central"* or *"Avísame Chosica–La Oroya"* creates a subscription for a km range; the bot confirms the range. Explicit opt-in; *"BAJA"* opts out at any time.
- **Triggers:**
  - a new incident in the range with confidence ≥ the alert threshold (official SUTRAN incidents qualify directly);
  - an incident in the range is cleared;
  - the 24 h risk level of a segment in the range rises to naranja or rojo;
  - a new SENAMHI warning covers the range.
- **Noise control:** at most one message per subscription every 30 minutes (alerts are bundled); no messages 22:00–05:00 except rojo.
- **Outside the 24-hour window:** an approved WhatsApp utility template, e.g. *"Alerta PeruRoad: {tipo} en {tramo}, {estado}. Responde ESTADO para más detalles."* SMS fallback until it is approved.

### F4. Trip watch and call alerts (P2, Pro)

A driver on the road cannot read WhatsApp; a short call reaches them. This uses Zavu Voice Agents: the same agent configuration answers calls, and we place a call with one API request (`POST /v1/calls`).

- **Registering a trip:**
  - a driver writes *"Salgo a Huancayo mañana a las 4"*, or a Pro dispatcher adds it in the dashboard (driver phone, origin, destination, departure time);
  - the driver gives explicit consent by replying *"SÍ"* on WhatsApp before any call.
- **Route and timing:** the trip is mapped to the PE-22 segments between origin and destination, with an estimated time window per segment from the departure time and an average speed (default 40 km/h, configurable). The position is an **estimate from the schedule, not GPS**, and is labeled that way.
- **Trigger:** an incident with confidence ≥ 0.6 (or any SUTRAN "interrumpido" incident), or a rojo risk level, on a segment the driver is expected to reach in the next 3 hours and has not yet passed.
- **Action:**
  - before departure: WhatsApp message (no call unless rojo or interrumpido);
  - on the road: an outbound call with a per-call greeting, e.g. *"Hola, te llama PeruRoad. Hay un derrumbe reportado cerca del km 74, en San Mateo, a unos 40 minutos de tu ruta. No necesitas responder si estás manejando; te enviamos el detalle por WhatsApp."*
- **Agent tools during the call:** `get_stretch_status(km range)` reads our API; `confirm_incident(incident_id, answer)` records *"sí, lo estoy viendo"* as a report that feeds confidence.
- **Call limits:** at most 2 minutes, one call per incident per trip, voicemail → short message, and a WhatsApp follow-up after every call. The transcript is stored and linked to the incident.
- **Confirmation calls (same mechanism):** for a low-confidence incident, call one consenting subscriber who is near that stretch: *"¿Sigue bloqueada la vía en Matucana?"*
- **Dispatcher view:** trips on the corridor, estimated positions, alerts sent, call outcome.

### F5. 3D dashboard (MapLibre GL JS)

**F5a. Public view (P0)**
- Opening fly-in from Peru to PE-22 on 3D terrain with hillshade.
- **Layers (toggle):**
  - incidents: icon by type, color by confidence, official (SUTRAN, with its road status interrumpido / restringido / normal) vs community, *"no confirmado"* label;
  - risk per 1-km segment (24 h);
  - rainfall heat map (last 24 h accumulated);
  - upstream catchments, rivers and quebrada crossings;
  - SENAMHI warnings;
  - official susceptibility / hazard zones.
- **Incident panel (click):** type, km, first seen, last confirmed, number of independent reporters, confidence and what it is based on, source (WhatsApp / SUTRAN with its reporting entity, e.g. the concessionaire or PNP), photo, status history.
- **Segment panel (click):** risk level, top 2–3 reasons, inputs, forecast issue time, weather model and grid resolution.
- **Live updates:** a new incident appears within seconds of the WhatsApp report (Supabase Realtime or polling).

**F5b. Pro view (P1)**
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

### F6. Weekly report (P1, Pro, n8n)

- **Schedule:** n8n cron every Monday 07:00 (America/Lima), plus a manual trigger for the demo.
- **Flow:** n8n calls an authenticated endpoint (`/api/reports/weekly?org=…`) → the app computes the numbers → the LLM writes a 5-bullet summary **from those numbers only** → stored as a Pro-only HTML page (`/reports/{id}`) → n8n delivers it by email (Zavu email channel) or by a WhatsApp utility template with the link → n8n logs delivery and retries on failure.
- **Content per subscribed stretch:**
  - incidents of the last 7 days by type, source and km, restriction / closure hours, and comparison with the previous week;
  - SENAMHI warnings issued;
  - the 72 h risk outlook per segment, plus a 7-day rainfall outlook labeled as lower confidence beyond 72 h;
  - top critical points.

### F7. Data API on Qatom (P1)

- **Endpoints** (Next.js route handlers, versioned):
  - `GET /api/v1/route-risk?from_km=&to_km=&horizon=24h|72h` → per-segment level, score, reasons, forecast issue time, model, grid resolution;
  - `GET /api/v1/incidents?from_km=&to_km=&since=` → active incidents with type, km, confidence, status, source type;
  - `GET /api/v1/stretch-summary?from_km=&to_km=` → a short plain-Spanish summary for agents.
- **Listing:** each endpoint is listed on Qatom as a paid tool, so MCP-compatible agents can discover it and pay per call. Requests through Qatom are verified before we answer; each call is logged with its transaction reference.
- **Free tier:** a rate-limited sample (one stretch, 24 h only) for evaluation.
- **Data rules:**
  - every response labels observed / forecast / estimated;
  - we sell our **derived** products (merged incidents, risk scores), not raw government datasets; official incidents are linked to their public source; each source's terms are checked and listed in the README.
- **Demo:** an agent asks *"¿Conviene mandar un camión de Lima a La Oroya esta noche?"*, pays through Qatom, and answers from our data.

### F8. Official data ingestion (P0, n8n)

- **Every 10 minutes:** SUTRAN public alerts (`api.sigea.sutran.gob.pe/public/alerts`), filtered to `viaCodigo = PE-22` and to alerts in force (`vencida = false`, `aunNoVigente = false`), upserted as official incidents by their SUTRAN `id` / `codigo`. Changes are detected by `lastActionAt` and archived, because SUTRAN only returns current alerts, so history exists only if we keep it. Each alert's status history is read from `/public/alerts/{id}/historial`. Dates come as `DD/MM/YYYY` (`fechaEvento`, `vigenteDesde`, `vigenteHasta`) and ISO 8601 UTC (`lastActionAt`) and are parsed accordingly.
- **Live official updates (optional):** the SUTRAN map receives updates over a WebSocket. The dashboard can subscribe to it from the browser to show official changes without waiting for the next poll; the server-side poll stays the source of record. The message format is only known from the map's frontend code and must be confirmed with a real event before we rely on it.
- **Hourly:**
  - Open-Meteo forecast and recent precipitation for catchment sample points;
  - SENAMHI warnings;
  - then the risk recalculation endpoint, then alert evaluation (F3, F4).
- **Static, loaded once and documented:**
  - road segments with km references (MTC national network, as served by SUTRAN's `road-network/segments` endpoint and GeoJSON, or OpenStreetMap);
  - rivers and quebradas (ANA, also served by SUTRAN's hydrography endpoint and GeoJSON);
  - INGEMMET / CENEPRED susceptibility, terrain tiles;
  - police, fire and health facilities (SUTRAN public endpoints).
- **Daily:** El Niño status (SUTRAN's `/public/nino` summary of SENAMHI / ENFEN) for the second-priority El Niño layer.
- Each layer records its source, retrieval time and whether it is a live feed or a snapshot. Requests to public government services are cached and kept infrequent.

### Display rule

The dashboard, messages and calls always distinguish **observed** events (official or confirmed reports), **forecasts**, and **estimated exposure**. Unverified reports are labeled **"no confirmado"**.

### Second priority (only after P1 works end to end)

- F4 trip watch and call alerts, then confirmation calls.
- Estimated delay and alternative routes when a closure is confirmed (SUTRAN publishes official alternative routes).
- **El Niño layer:** ENFEN status, sea-surface temperature anomalies, official outlooks.
- **Scenario comparison:** exposure under different rainfall scenarios.
- **Piura and Tumbes:** flood zones and their proximity to roads, population centers and critical infrastructure.

### Out of scope

Other corridors (including Lima–Arequipa), frost alerts, native mobile app, full user accounts and roles, real payment processing beyond Qatom, live GPS tracking, national coverage.

---

## 4. Early warning (the technical core)

**What we claim:** a *risk level* per catchment for the next 24–72 h, shown on the road segments it affects, with a plain-language reason. We do **not** claim to predict a huaico at an exact time and place, and we only claim advance-warning ability to the extent the forecast evaluation below supports it.

**Key design point:** huaicos on the Carretera Central are triggered by rain **upstream in the Andes**, not by rain in Lima. For every point where a quebrada crosses the road, the model uses rainfall over its **actual upstream catchment**, not at the road.

### Spatial resolution: display precision is not prediction precision

- The road is split into **1-km segments** for display, aggregation and location of reports. This does **not** make the weather inputs accurate to 1 km.
- Rainfall comes from numerical weather models with grid cells of roughly 9–25 km depending on the model (e.g. ECMWF IFS at about 9 km). In steep Andean terrain, local convective rain is poorly resolved at that scale.
- The **unit of prediction is the catchment**, and the effective precision is limited by the rainfall grid. Each risk level stores the model and grid used; the map and documentation state this resolution.

### Upstream catchments

Road and stream geometry alone do not define where water comes from. We delineate catchments explicitly:

1. **Crossing points:** intersect PE-22 with mapped streams and quebradas (OpenStreetMap, ANA) to get pour points.
2. **Delineation (preferred):** one-time offline delineation from a hydrologically conditioned DEM / flow-direction grid (e.g. HydroSHEDS or MERIT Hydro) using the WhiteboxTools CLI. Output: one polygon per crossing, committed to the repository as GeoJSON with the script that produced it.
3. **Fallback:** HydroSHEDS HydroBASINS level 12 polygons plus their upstream topology (`NEXT_DOWN`), cross-checked against ANA hydrographic units. Coarser; documented as such.
4. **Sampling:** rainfall is averaged over grid points inside each catchment, weighted by area.

Small quebradas below the resolution of the delineation are grouped and flagged as lower-confidence.

### Model v1: transparent and rule-based, then calibrated

For each catchment, every hour:

| Input | Source | Why |
|---|---|---|
| Forecast rain, next 24 h and 72 h, over the catchment | Open-Meteo forecast API | Trigger |
| Rain already fallen, last 3 and 7 days, over the catchment | Open-Meteo recent / historical | Wet soil fails faster |
| Susceptibility class (mass movement / flooding) | INGEMMET / CENEPRED layers | Some slopes fail first |
| Catchment area and slope | Delineation output, DEM | Size and steepness affect response |
| Active SENAMHI warning for the province | SENAMHI | Official signal |
| Recent incidents nearby | SUTRAN, MTC, our WhatsApp reports | Ground truth |

**Output:** a level (verde / amarillo / naranja / rojo) plus the top 2–3 reasons, e.g. *"72 mm forecast over the Quebrada X catchment in the next 48 h + soil already wet + high-susceptibility zone"*.

- **Code computes the score; the LLM only writes the explanation** in plain Spanish. The score must be reproducible and auditable: each stored score records its inputs, model, grid and forecast issue time.
- **Thresholds are calibrated on data, not guessed**, and frozen before evaluation.

### Evaluation

Reconstructing an event from rainfall that actually fell does not prove it could have been predicted. We separate the two:

**A. Reconstruction of Cyclone Yaku (Feb–Mar 2023)** — for the timeline replay only.
- Uses observed / reanalysis rainfall (Open-Meteo Historical Weather API).
- Shows how risk levels would have evolved given the rain that fell. Labeled **"reconstrucción"** on the map; never presented as evidence of advance warning.
- Open-Meteo's archived lead-time forecasts for most models start in **January 2024**, so true forecast-based evaluation of 2023 is not possible with them. (JMA models are archived from 2018 in the Previous Runs API; if their resolution is usable, a 2023 forecast check is an optional extra.)

**B. Forecast evaluation (2024–2026 rainy seasons)** — the only basis for advance-warning claims.
- **Inputs:** forecasts as they were issued **before** each day, from Open-Meteo's **Previous Runs API** (fixed lead times of 1–7 days, e.g. `precipitation_previous_day1`, `_previous_day2`, `_previous_day3`). Not the Historical Forecast API, which stitches the first hours of each run and so approximates observed conditions.
- **Ground truth:** recorded huaicos and road closures on PE-22 with date and location (INDECI emergency records, SUTRAN, news archives). SUTRAN's public API only returns current alerts, so past seasons come from INDECI and news.
- **Split:** calibrate thresholds on one rainy season (e.g. Jan–Apr 2024); evaluate on a different season (e.g. Jan–Apr 2025, and 2026 if records allow). No threshold changes after looking at the evaluation period.
- **Metrics per lead time (1, 2, 3 days):** events flagged in advance / total events, false alarms per season, and comparison against a simple baseline (e.g. SENAMHI warning alone, or rainfall threshold only).
- **Reporting:** results are published as they come out, including weak ones. If there are too few recorded events to measure skill, the report says so and makes no advance-warning claim.

---

## 5. Architecture

```
People on the road ──► Zavu (WhatsApp / SMS / email / voice) ──► signed webhook
        ▲                    │  ▲                                     │
        │ alerts, calls      │  │ voice agent tools (HTTPS)           ▼
        └────────────────────┘  └──────────── Next.js app (TypeScript, App Router, Vercel)
                                              ├─ Route handlers: Zavu webhook, incidents,
                                              │  segments, risk, indicators, trips, reports,
                                              │  /api/v1 data API, n8n job endpoints (authenticated)
                                              ├─ Report pipeline: ElevenLabs STT → LLM extraction
                                              │  → snap to PE-22 → dedupe → confidence
                                              ├─ Alert engine: subscriptions (F3) + trips (F4)
                                              │  → Zavu message / template / call
                                              └─ Web UI: MapLibre 3D terrain, layers, heat map,
                                                 timeline, indicators, Pro gate
                                                          │
                                         Postgres + PostGIS (Supabase, Realtime)
                          segments · catchments · hazard zones · reports · incidents ·
                          incident_status_log · risk_scores · subscriptions · organizations ·
                          trips · calls · weekly_reports · api_calls
                                                          ▲
n8n ── every 10 min: SUTRAN alerts (PE-22) → upsert + status archive → alert evaluation
    ├─ hourly: Open-Meteo, SENAMHI pulls → risk recalculation → alert evaluation
    └─ weekly: report generation → delivery (email / WhatsApp template) → delivery log

Qatom ── lists /api/v1 endpoints as paid tools; agents discover and pay per call

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
| Voice-note transcription | ElevenLabs (Scribe speech-to-text; text-to-speech for voice-note replies) |
| Scheduled jobs, alerts and weekly reports | n8n |
| Paid data API | Qatom |

### Stack decisions

- **Calls use Zavu Voice Agents.** Zavu already runs our WhatsApp channel and includes telephony, speech recognition and speech synthesis for calls, so a call is one API request with no extra provider or phone number. We considered ElevenLabs Agents and the Grok Voice Agent API; both need a separate telephony provider (e.g. Twilio or a SIP trunk). ElevenLabs Agents over Twilio remains the fallback if the Zavu voice check fails.
- **ElevenLabs only for voice notes.** Zavu receives and sends WhatsApp audio, but its documentation does not describe transcription of inbound voice notes, so ElevenLabs transcribes them. If the H0 check shows Zavu transcribes inbound audio, we drop ElevenLabs.
- **No separate agent host (Maritime) and no external memory service (Memory Cloud).** Agent logic runs in Next.js route handlers and the voice agent runs on Zavu. Reporter history and reputation are Postgres queries, which keeps the confidence score deterministic and auditable.
- **n8n cloud uses HTTP Request nodes** to call Zavu, SUTRAN and our endpoints. The Zavu community node only installs on self-hosted n8n.
- **SUTRAN's public JSON API instead of scraping its map.** The map is backed by an unauthenticated JSON API with CORS enabled; it is not documented as a public API, so we cache it, poll it gently, and keep our own archive in case it changes.

### Sponsor tools

| Tool | Our use |
|---|---|
| **Zavu** | The whole messaging channel: inbound reports, queries, WhatsApp alerts and templates, SMS fallback, weekly report email, and outbound call alerts through Voice Agents |
| **ElevenLabs** | Transcribe WhatsApp voice notes; voice-note replies to drivers |
| **n8n** | SUTRAN, Open-Meteo and SENAMHI ingestion, risk recalculation and alert evaluation, weekly report generation and delivery |
| **Qatom** | Paid route-risk and incident API that agents discover and pay per call |

### Core data model

- **segment**: id, road (PE-22), km_start, km_end, geometry, elevation_m, susceptibility_class, catchment_ids[]
- **catchment**: id, pour_point, geometry, area_km2, mean_slope, method (dem / hydrobasins), sample_points, low_confidence
- **report**: id, reporter_key (HMAC), channel (whatsapp / call), raw_text / audio_url / photo_url, transcript, lat/lng (if shared), extracted {type, km, severity, time}, created_at
- **incident**: id, segment_id, type (huaico / derrumbe / inundación / bloqueo / accidente / obra), origin (official / community), external_ref (SUTRAN code), source_entity, road_status (interrumpido / restringido / normal), status (active / clearing / cleared), confidence 0–1, report_ids[], first_seen, last_confirmed
- **incident_status_log**: incident_id, observed_at, road_status, status, source
- **risk_score**: catchment_id, computed_at, forecast_issued_at, weather_model, grid_resolution_km, horizon (24h / 72h), level, score, inputs, reasons[]
- **subscription**: id, contact_ref, phone_key (HMAC), road, km range, channel, consent_at, opted_out_at
- **organization**: id, name, plan (free / pro), access_code_hash, report_channel, report_stretches
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
| Zavu inbound WhatsApp (Backend) | Send text, voice note, photo and location to the number | Webhook receives all four with media URLs downloadable | SMS / Telegram via Zavu for the demo |
| Zavu outbound alerts (Backend) | Send a message to a user **outside** the 24-hour conversation window | Message delivered. WhatsApp requires an approved template for business-initiated messages; submit alert and weekly-report templates at H0 and record approval time | Alerts by SMS; WhatsApp only inside the 24 h window |
| Zavu contact reference (Backend) | Check whether the API exposes a stable contact / recipient ID usable as a send target | ID can be stored and used to send | Encrypted destination number |
| Zavu Voice Agents (Backend) | Place an outbound call (`POST /v1/calls`, live key) to a Peruvian mobile (+51) with a Spanish (`es`) voice and a per-call greeting; call a tool on our API during the call | Call connects, Spanish is understandable, tool result is spoken, transcript retrieved; cost per minute and caller ID recorded | ElevenLabs Agents outbound via Twilio; otherwise WhatsApp-only alerts |
| Zavu agent scope (Backend) | Enable the voice agent and send a WhatsApp message to the same sender | WhatsApp messages still reach our webhook pipeline and are not auto-answered by the agent | Use a separate sender for voice |
| Zavu inbound audio transcription (Backend) | Check whether inbound voice notes arrive with a transcript | Transcript present and usable | ElevenLabs Scribe (planned) |
| ElevenLabs speech-to-text (Backend) | Transcribe a real WhatsApp voice note (OGG/Opus, Peruvian Spanish, road noise) | Usable transcript of location and incident type | Ask the user to type, or use another STT |
| LLM structured extraction (Backend) | Run on 10–20 real road messages | Correct type and location on most; failures logged | Ask the reporter a follow-up question |
| n8n (Data) | Ingestion job calls SUTRAN and the authenticated recalculation endpoint; weekly job generates and delivers one report | Each runs twice successfully | Cron in the hosting platform |
| Qatom provider listing (Backend) | Register as provider, list `/api/v1/route-risk` as a paid tool, call it from an MCP client with a funded agent wallet | Paid call returns our data and the transaction is recorded | Document the listing; demo the API with an API key |
| Qatom subscription (Pitch lead) | Check whether Qatom can sell a monthly Pro subscription | Subscription purchasable | Manual Pro activation |

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

Adjust to team size. With 3 people, merge Data and Backend.

| Role | Owns |
|---|---|
| **Pitch & traction lead** | Demo script, interviews (including willingness to pay), getting the number into WhatsApp groups, terminal visit, metrics, Qatom subscription check, slides, rehearsals, README |
| **Backend / agent** | Next.js route handlers, Zavu webhook, templates and voice agent, extraction, geocoding, dedupe, confidence, contact encryption, ElevenLabs, alert engine, trips and calls, `/api/v1` and Qatom listing, Pro access |
| **Data & model** | Integration checks for data, SUTRAN ingestion and archive, catchment delineation, segments, risk model, reconstruction and forecast evaluation, n8n jobs (ingestion and weekly report) |
| **Frontend / map** | Next.js UI, MapLibre 3D map, layers, heat map, timeline, indicator panel and charts, route profile, stretch selector, export, live incident updates |

AI coding tools are used for boilerplate. The risk, confidence and evaluation logic is written and understood by the team.

---

## 8. Timeline (H0 = hacking starts)

All implementation, validation, submission, and pitch preparation fit within
**30 hours**. The backend, data/model, and frontend roles work in parallel;
the pitch lead owns user outreach and presentation preparation. Confirm the
organizers' actual submission cutoff at H0; if it is earlier than H30, move the
submission and final checks forward to finish at least 30 minutes before it.

| Hours | Goal | Done when |
|---|---|---|
| **H0–2** | Align and set up | Read this doc; section 6 checks started (including one Zavu test call to a +51 number) and the WhatsApp alert and weekly-report templates submitted; Zavu number live; Qatom provider account created; repo, database and deploy working; demo script written |
| **H2–8** | Thin skeleton, end to end | A WhatsApp message creates a pin on the map (even if extraction is crude); SUTRAN PE-22 alerts on the map and archived; PE-22 segments and catchment crossing points loaded; first Open-Meteo pull |
| **H8–10** | **Launch to real users** | Number shared in WhatsApp groups (drivers, family, friends who travel the Central); start collecting usage and problem/impact evidence |
| **H10–18 (night)** | Core (P0) | Extraction + dedupe + confidence; catchments delineated; risk model v1; subscriptions + alerts; SENAMHI ingestion; Yaku 2023 reconstruction data, 2024–2025 archived forecasts and event records loaded |
| **H18** | **Core integration checkpoint** | The live reporting → dashboard → subscriber alert flow works from start to finish; go / no-go decision on F4 call alerts based on the Zavu voice check |
| **H18–24** | Complete MVP (P1) + evaluation | Ask by WhatsApp; Pro view (timeline, 72 h forecast, indicators, route profile, stretch selector, export) and Pro access; weekly report generated and delivered by n8n; `/api/v1` live and listed on Qatom; calibration and held-out forecast evaluation done; F4 only if all of this already works |
| **H18–22 (in parallel)** | **Terminal visit** | Pitch lead (+1 if available) goes to the Central bus/colectivo terminals (e.g. Yerbateros): ~10 interviews, sign-ups, willingness-to-pay answers, photos/video |
| **H22–29 (in parallel)** | Pitch preparation | Slides, real usage evidence, 5 or more timed rehearsals, and Q&A preparation completed |
| **H24** | **Feature freeze** | Full MVP works end to end; no new features after this point |
| **H24–27** | Harden | Critical flows checked; pre-loaded demo data, demo Pro organization and cached responses ready; Wi-Fi fallback and 60-second backup video recorded; GitHub setup instructions verified |
| **H27** | **Code freeze** | Only fixes for demo blockers and submission issues from this point |
| **H27–29** | Final validation | Public app, Pro access code and presentation checked from a fresh session; complete demo rehearsed; deliverables ready |
| **By H29:30** | **Submit** | All four deliverables saved at least 30 minutes before H30, or earlier if the official cutoff requires it |
| **H29:30–30** | Verify and prepare to present | Saved submission and links verified; presentation and backup ready |

---

## 8b. Start checklist

- [ ] Everyone has redeemed the sponsor credits (Zavu, ElevenLabs, n8n, Qatom; Memory Cloud and Maritime are not used)
- [ ] Zavu WhatsApp number active and receiving webhooks; live API key available for calls
- [ ] WhatsApp alert and weekly-report templates submitted for approval
- [ ] Zavu voice enabled on the agent and one test call placed to a team member's +51 phone
- [ ] Qatom provider account created
- [ ] SUTRAN alerts polling started (so our status archive covers the whole event)
- [ ] Section 6 checks assigned to owners
- [ ] Collect 10–20 real messages from WhatsApp groups about road conditions (test set for extraction)
- [ ] List of WhatsApp/Facebook groups for travelers on the Central where we can share the number
- [ ] Check event rules on pre-existing code

---

## 9. User evidence and traction plan (supports problem and impact: 15%)

The current rubric evaluates a real user within our track under **problem and
impact (15%)**. The metrics below support that evidence; traction is not a
separate 30% criterion in the updated rubric.

**Metrics tracked live, shown on a slide at the end:**
- Reports received / unique reporters
- Queries answered
- Subscribers to alerts
- Returning users (used it more than once)
- Calls placed and answered (if F4 is delivered)
- Interviews done + the top 3 things we learned and changed

**How we get users:**
1. Share the number in groups of travelers and drivers on the Central, and in our own networks.
2. Go in person to the terminals. Drivers are there waiting; ask them about the last time a huaico caught them.
3. Ask every interviewee: *"Would you use this?"* and *"Would your company pay for it?"* Write down quotes.

**Interview questions (5 min max):**
- How do you find out today whether the Central is open? Do you use the SUTRAN map or *Viaje Seguro*?
- Last time you got stuck: what happened, how long, what did it cost you?
- Would you send a voice note to report a blockage? Would you want an alert before leaving?
- Would you take a short call on the road about a hazard ahead, or prefer a WhatsApp message?
- (Dispatchers and company staff) How do you warn drivers who are already on the road today? What do you pay for that information now?

---

## 10. Demo script (3 minutes)

| Time | What happens |
|---|---|
| 0:00–0:20 | **Problem.** One driver's story from our interviews + one figure (e.g. days the Central was closed during Yaku) |
| 0:20–0:35 | **What it is.** PeruRoad Climate in one sentence |
| 0:35–1:10 | **Dashboard.** 3D map flies from Peru into the Central; today's SUTRAN incidents, rainfall heat map, catchments, 72 h risk on the route profile, and the Yaku 2023 reconstruction on the timeline, labeled as such |
| 1:10–2:00 | **Live.** A WhatsApp voice note "huaico en el km 52" → pin appears live → confidence updates → a subscribed phone receives the alert → (if F4 is delivered) a phone on a registered trip rings and the agent explains the hazard ahead |
| 2:00–2:25 | **How it works.** Catchment-based design, code scores / LLM explains, confidence model, held-out forecast evaluation result and its limits |
| 2:25–2:45 | **Who pays.** Pro view and the weekly report; an agent pays per call on Qatom for route risk |
| 2:45–3:00 | **Users and next steps.** Real usage numbers, interview quotes, Piura/Tumbes and more corridors |

**Anticipated questions:**
- What about false reports? (confidence score, reputation, "no confirmado", matching SUTRAN incidents, confirmation from nearby users and calls)
- How accurate is the early warning? (held-out forecast evaluation per lead time, false alarms, baseline comparison, rainfall grid resolution)
- Why is the Yaku replay not proof of prediction? (it uses rain that actually fell; advance-warning claims come only from archived forecasts on held-out seasons)
- Why not just use SENAMHI warnings or the SUTRAN map? (warnings are by province and SUTRAN shows confirmed incidents; we use SUTRAN as an input and add per-catchment forecasts, live reports from the road, and delivery on WhatsApp and by call)
- Isn't calling a driver who is driving dangerous? (consent first, short hands-free message that needs no answer, WhatsApp follow-up, pre-departure alerts preferred)
- Who pays, and why would reporters keep reporting for free? (organizations pay for aggregated data; reporters get alerts and status in return)
- Can you sell government data? (we sell derived risk scores and merged incidents and link official incidents to their public source; source terms are listed in the README)
- How do you store phone numbers? (encrypted delivery reference or provider contact ID, HMAC key for matching, opt-out)
- What does the AI do vs. our code?
- What fails first, and what would we do with 3 more months?

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| No huaicos this weekend (October = dry season) | Accept all road incidents (rockfalls, blockades, accidents, roadworks; SUTRAN already lists such incidents on PE-22); show huaicos through the 2023 reconstruction |
| SUTRAN's undocumented API changes, rate-limits or goes down | Cache and poll every 10 minutes at most; keep our own archive; fall back to the last snapshot, labeled with its time |
| WhatsApp template approval is slow or rejected | Submit at H0; alerts by SMS meanwhile; WhatsApp replies inside the 24 h window still work |
| Zavu Voice Agents (beta) cannot call +51 numbers, sound poor in Spanish, or cost too much | Test at H0; fallback ElevenLabs Agents via Twilio; otherwise F4 stays WhatsApp-only and is presented as future work |
| Calls distract drivers | Explicit call consent, ≤2 min hands-free message that needs no reply, one call per incident per trip, pre-departure alerts by WhatsApp |
| Drivers ignore calls from an unknown or foreign number | Save-the-contact message at trip registration; WhatsApp follow-up after each call |
| Qatom listing or payment fails | API works with an API key; Qatom listing documented as pending |
| Monetization work takes time from the core | No real payment processing; Pro is a plan flag + access code; P1 starts only after the H18 checkpoint |
| Data terms do not allow resale | Sell derived products only; list each source's terms; drop a source from the API if its terms forbid it |
| Too few dated incidents to evaluate forecasts | Report the count and make no advance-warning claim |
| Rainfall grid too coarse for small quebradas | State the resolution; group small catchments and flag them low-confidence |
| Catchment delineation fails or is slow | HydroBASINS level 12 fallback, documented |
| Government data has no usable feed | Static snapshot, documented |
| Locating "pasando el puente" fails | Ask the reporter to share their WhatsApp location as fallback |
| Live demo breaks (Wi-Fi, API slowness) | Pre-loaded data, cached responses, phone hotspot, backup video |
| Phone numbers leak | Encrypted delivery reference, HMAC matching key, no raw numbers in logs, secrets outside the repo |
| Scope creep | Section 3 priority tiers are the contract. Nothing from P2 until P1 works end to end; no new features after the H24 freeze |
| Panic from wrong alerts | Observed / forecast / estimated labels, confidence levels, and wording that gives risk, not certainty |

---

## 12. Definition of done

- [ ] A real person, not on our team, reported something by WhatsApp and it appeared on the dashboard
- [ ] A subscriber received an alert outside the 24-hour window (template approved) or by SMS fallback
- [ ] SUTRAN PE-22 incidents ingested every 10 minutes and archived for the whole event
- [ ] Risk level runs hourly over all PE-22 catchments
- [ ] Held-out forecast evaluation computed and documented (or documented as not possible, with the reason)
- [ ] Yaku 2023 reconstruction on the timeline, labeled as a reconstruction
- [ ] Section 6 checks recorded with results and fallbacks used
- [ ] Public 3D dashboard with heat map and live incidents works from the public URL; Pro view (timeline, indicators, route profile, export) works with the demo access code
- [ ] One weekly report generated and delivered by n8n
- [ ] One paid call to `/api/v1/route-risk` completed through Qatom (or documented as pending, with the reason)
- [ ] If F4 is delivered: a consenting phone on a registered trip received a call about a hazard ahead, and the call transcript is linked to the incident
- [ ] README with architecture, decisions, data sources and their terms, resolution limits, and what AI was used for
- [ ] Backup video recorded
- [ ] Pitch rehearsed 5+ times, under 3:00
- [ ] Submitted 30+ minutes early
