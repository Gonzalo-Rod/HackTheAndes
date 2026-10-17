# Hack the Andes — Team Plan

**Track:** Clima y Territorio
**Project name:** *PeruRoad Climate*
**One line:** Real-time road incidents and early warnings for the Carretera Central, reported and delivered over WhatsApp, shown on a 3D map that combines official climate, hazard and road data.

---

## 1. Objectives and evaluation criteria

### Objectives

1. **Integrate** official data that today lives on separate platforms (SENAMHI, ENFEN, MTC, CENEPRED, INGEMMET, SUTRAN, ANA) into one 3D view of the corridor and its roads.
2. **Estimate** the exposure of each road segment to huaicos, landslides and floods, and raise **early warnings** from rainfall forecasts.
3. **Collect and verify** reports from people on the road through WhatsApp, and deliver status and alerts through the same channel.
4. **Evaluate** the early-warning model honestly: archived forecasts issued before each event, on periods separate from calibration (section 4).
5. **Test with real users** during the event and document what we learned.

### Rubric

The current rubric has five criteria, as communicated by the participant:

| Criterion | Weight | What is assessed | How we demonstrate it |
|---|---|---|---|
| **Technical complexity** | 30% | Integrations, data, models, and architecture | Report verification pipeline + catchment-based risk model + forecast evaluation on held-out periods |
| **Functionality** | 25% | A complete live workflow from the public URL | Public 3D map + a WhatsApp report + the incident appears + a subscriber receives the alert |
| **Technical quality** | 20% | The judges review our GitHub repository | Clear architecture and setup instructions, documented data sources and configuration, reproducible risk logic, and focused checks for the critical flows |
| **Problem and impact** | 15% | A real user within our track | Live WhatsApp line used by real drivers + in-person interviews at the bus terminal + evidence of what helped and what we changed |
| **Clarity** | 10% | Explanation of decisions and tradeoffs | Rehearsed 3-minute demo, justified technical choices, stated limitations, and precise answers |

**Technical criteria total 75%; product criteria total 25%.** Technical complexity
has the largest individual weight. The updated scoring scale and calculation
have not been confirmed, so we do not reuse the previous 1–5 scale or formula.
Using AI is not evidence by itself; every design decision is explained in the
repository.

### Design principles

- **A channel people already have** (WhatsApp), not a new app.
- **The AI does a narrow job** (extraction and explanations), wrapped in our own deterministic logic with a verification step.
- **One corridor done deeply** (PE-22) rather than all of Peru done shallowly.
- **Observed, forecast and estimated information are always distinguished.** Potential scenarios are never shown as confirmed damage.

---

## 2. The problem and the users

Every rainy season, huaicos and rockfalls cut the **Carretera Central** (Lima–Chosica–Matucana–La Oroya), the main route between Lima and the central highlands. Today, drivers find out from WhatsApp groups asking *"¿cómo está la Central?"*, scattered news, and official warnings written for whole provinces, not for a specific stretch of road.

Official institutions publish meteorological, geological and road data, but on different platforms, which makes joint analysis difficult. Existing tools rarely relate rainfall over time to relief, river basins and road location, so it is hard to know which road segments may be affected and how their exposure changes.

**Primary user: people who drive the corridor.** Interprovincial bus and colectivo drivers, truckers and travelers. They both report and consume information, and they already share road status in WhatsApp groups; we give that habit structure.

**Secondary users:**
- **Residents of quebradas** (Chosica and others), who need early warning.
- **Decision-makers** (municipalities, regional emergency centers / COER, MTC, Provías), who need to know which segments require attention and how many kilometers and population centers are exposed.

**Potential payers:** logistics and bus companies, municipalities and COER, insurers, and AI agents paying per call for a route-risk API (Qatom).

**Track fit:** Clima y Territorio (huaicos, rain, alerts), with a transport impact.

### Geographic scope

| Stage | Area | Reason |
|---|---|---|
| **Hackathon prototype** | **Carretera Central (PE-22)**, Lima–Chosica–Matucana–La Oroya | High exposure to huaicos; reachable from Lima, so we can test with real drivers during the event |
| **Second priority** | North coast: Piura and Tumbes | Highest flood exposure during El Niño |
| **Later** | Rest of the national road network | Same pipeline, more layers |

The opening view shows Peru in 3D; analysis and live features focus on PE-22.

---

## 3. What we build

### MVP (must work at the demo)

1. **Report by WhatsApp.** Text, voice note, photo or location. The pipeline:
   - transcribes it (ElevenLabs),
   - extracts type, location, severity and time (LLM, structured output),
   - places it on a road kilometer,
   - merges duplicates into one incident,
   - scores confidence,
   - stores it.
2. **Ask by WhatsApp.** *"¿Cómo está la Central hasta Huancayo?"* returns a short summary as text plus a voice note, for drivers.
3. **Subscribe.** *"Avísame de la Central"* sends a message when an incident appears or clears, **or when the predicted risk level rises** (see section 4). Subscribers opt in explicitly and can opt out at any time (e.g. *"BAJA"*).
4. **Early-warning risk level** per catchment, displayed on the road segments it affects, recalculated every hour (section 4).
5. **3D map (web, MapLibre GL JS)** of the corridor. Layers:
   - community incidents, colored by confidence
   - predicted risk per segment
   - rainfall heat map (recent accumulated and forecast)
   - upstream catchments, rivers and quebrada crossings
   - SENAMHI warnings
   - official susceptibility / hazard zones
   - a scrubbable **timeline** with the **Cyclone Yaku (March 2023) reconstruction**, clearly labeled as a reconstruction (section 4)
6. **Indicator panel** for the corridor or a selected stretch: accumulated rainfall, kilometers exposed by risk level, registered incidents, critical points.

**Display rule:** the map and messages always distinguish **observed** events (official or confirmed reports), **forecasts**, and **estimated exposure**. Unverified reports are labeled **"no confirmado"**.

### Second priority (only after the MVP works end to end)

- **The agent asks people nearby to confirm.** When a report has low confidence, it messages or calls (ElevenLabs voice) subscribers on that stretch: *"¿Sigue bloqueada la vía en Matucana?"*
- **Paid route-risk API on Qatom** for logistics companies and agents.
- Estimated delay and alternative routes when a closure is confirmed.
- **El Niño layer:** ENFEN status, sea-surface temperature anomalies, official outlooks.
- **Scenario comparison:** exposure under different rainfall scenarios.
- **Piura and Tumbes:** flood zones and their proximity to roads, population centers and critical infrastructure.

### Out of scope

Other corridors, frost alerts, native mobile app, user accounts, national coverage.

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
- **Ground truth:** recorded huaicos and road closures on PE-22 with date and location (INDECI emergency records, SUTRAN, news archives).
- **Split:** calibrate thresholds on one rainy season (e.g. Jan–Apr 2024); evaluate on a different season (e.g. Jan–Apr 2025, and 2026 if records allow). No threshold changes after looking at the evaluation period.
- **Metrics per lead time (1, 2, 3 days):** events flagged in advance / total events, false alarms per season, and comparison against a simple baseline (e.g. SENAMHI warning alone, or rainfall threshold only).
- **Reporting:** results are published as they come out, including weak ones. If there are too few recorded events to measure skill, the report says so and makes no advance-warning claim.

---

## 5. Architecture

```
WhatsApp user ──► Zavu (WhatsApp / SMS / voice) ──► webhook
                                                     │
                       Next.js app (TypeScript, App Router)
                       ├─ Route handlers: Zavu webhook, incidents, segments,
                       │  risk, indicators, n8n job endpoints (authenticated)
                       ├─ Agent logic (hosted on Maritime if it fits a Node
                       │  service; otherwise runs in the route handlers)
                       │   ├─ ElevenLabs: speech-to-text / text-to-speech
                       │   ├─ LLM: extraction + explanations (structured output)
                       │   ├─ Memory Cloud: reporter history, preferences
                       │   └─ Verification: geocode → dedupe → confidence
                       └─ Web UI: MapLibre GL JS 3D terrain, layers, heat map,
                          timeline, indicator panel
                                     │
                         Postgres + PostGIS (e.g. Supabase)
                         segments · catchments · hazard zones · reports ·
                         incidents · risk_scores · subscriptions
                                     ▲
n8n (scheduled) ── hourly: Open-Meteo, SENAMHI, SUTRAN pulls → risk recalculation endpoint
               └── on change: alert fan-out via Zavu

Offline (one-time, scripts in the repo): catchment delineation (WhiteboxTools CLI),
segmentation and overlays (PostGIS SQL + TypeScript / Turf.js), evaluation scripts
Qatom (Cloudflare Worker template) ── paid "route risk" API endpoint (second priority)
```

### Stack

| Layer | Technology |
|---|---|
| Web app and API | Next.js (TypeScript, App Router, route handlers) |
| 3D map and visualization | MapLibre GL JS (terrain, heat map, timeline animation) |
| Database | PostgreSQL + PostGIS |
| Geospatial processing | PostGIS SQL, TypeScript scripts (Turf.js), WhiteboxTools CLI for catchments |
| Data formats | GeoJSON (vectors), GeoTIFF (DEM, rasters during preprocessing), vector tiles if layers get large |
| Messaging | Zavu (WhatsApp, SMS fallback, voice) |
| Voice | ElevenLabs |
| Agent memory | Memory Cloud |
| Scheduled jobs and alerts | n8n |
| Agent hosting | Maritime |
| Paid API | Qatom |

### Sponsor tools

| Tool | Our use |
|---|---|
| **Zavu** | The whole WhatsApp channel: inbound reports, queries, outbound alerts; SMS fallback |
| **ElevenLabs** | Transcribe voice notes; voice replies and alerts for drivers; confirmation calls (second priority) |
| **Memory Cloud** | Reporter reputation (feeds the confidence score), per-user context |
| **n8n** | Hourly data ingestion, risk recalculation trigger, alert fan-out |
| **Maritime** | Hosting for the agent |
| **Qatom** | Paid route-risk API that other agents can call (second priority) |

### Core data model

- **segment**: id, road (PE-22), km_start, km_end, geometry, susceptibility_class, catchment_ids[]
- **catchment**: id, pour_point, geometry, area_km2, mean_slope, method (dem / hydrobasins), sample_points, low_confidence
- **report**: id, reporter_key (HMAC), raw_text / audio_url / photo_url, lat/lng (if shared), extracted {type, km, severity, time}, created_at
- **incident**: id, segment_id, type (huaico / derrumbe / inundación / bloqueo / accidente / obra), origin (official / community), status (active / cleared), confidence 0–1, report_ids[], first_seen, last_confirmed
- **risk_score**: catchment_id, computed_at, forecast_issued_at, weather_model, grid_resolution_km, horizon (24h / 72h), level, score, inputs, reasons[]
- **subscription**: id, contact_ref, phone_key (HMAC), road, km range, channel, consent_at, opted_out_at

**Contacts and privacy:**
- A hash cannot be used to send a message, so each subscription stores a **delivery reference** separately from the **matching key**:
  - `contact_ref`: the provider's contact / recipient ID from Zavu if available; otherwise the destination number **encrypted** with an application key (e.g. AES-256-GCM, key in a secret store, never in the repository).
  - `phone_key`: a keyed hash (HMAC-SHA256 with a secret pepper) of the normalized number, used to match reports, subscriptions and reputation without reading the number.
- Raw numbers are never logged or shown; reporters are never shown publicly.
- Decryption happens only in the alert-sending path.
- Opt-out deletes or disables the delivery reference.

**Confidence (v1)** depends on:
- the number of independent reporters
- reporter reputation
- whether there is a photo
- a shared location vs. text only
- agreement with the risk level / SENAMHI warning
- decay over time

Low confidence is shown clearly as **"no confirmado"**.

---

## 6. Integrations and data sources: practical checks

**Nothing in this section is verified yet.** Each item needs a practical check at H0–2 (owner in parentheses). Record each result in `getting-started/PROGRESS.md`. If a check fails, use the fallback and document it in the README.

### Messaging and AI services

| Integration | Practical check | Pass criterion | Fallback |
|---|---|---|---|
| Zavu inbound WhatsApp (Backend) | Send text, voice note, photo and location to the number | Webhook receives all four with media URLs downloadable | SMS / Telegram via Zavu for the demo |
| Zavu outbound alerts (Backend) | Send a message to a user **outside** the 24-hour conversation window | Message delivered. WhatsApp requires an approved template for business-initiated messages; submit it at H0 and record approval time | Alerts by SMS; WhatsApp only inside the 24 h window |
| Zavu contact reference (Backend) | Check whether the API exposes a stable contact / recipient ID usable as a send target | ID can be stored and used to send | Encrypted destination number |
| ElevenLabs speech-to-text (Backend) | Transcribe a real WhatsApp voice note (OGG/Opus, Peruvian Spanish, road noise) | Usable transcript of location and incident type | Ask the user to type, or use another STT |
| LLM structured extraction (Backend) | Run on 10–20 real road messages | Correct type and location on most; failures logged | Ask the reporter a follow-up question |
| Memory Cloud (Backend) | Write and read per-reporter history | Round trip works from the app | Store history in Postgres |
| n8n (Data) | Hourly job calls the authenticated recalculation endpoint | Runs twice successfully | Cron in the hosting platform |
| Maritime (Backend) | Deploy the agent service | Reachable from the webhook | Run inside Next.js route handlers |

### Weather and evaluation data

| Integration | Practical check | Pass criterion | Fallback |
|---|---|---|---|
| Open-Meteo forecast (Data) | Fetch hourly precipitation for catchment sample points | Data returned for all points | — |
| Open-Meteo Previous Runs (Data) | Fetch `precipitation_previous_day1..3` for PE-22 points, Jan–Apr 2024 and 2025 | Complete series for the chosen model | Fewer lead times or another model |
| Open-Meteo Historical Weather (Data) | Fetch Feb–Mar 2023 precipitation | Complete series | — |
| Historical event records (Data) | Find dated, located huaicos / closures on PE-22 for 2023, 2024 and 2025 (INDECI, SUTRAN, news) | A list with date, km or place, and source for each | If too few, report it; no skill claim |

### Geospatial data

| Integration | Practical check | Pass criterion | Fallback |
|---|---|---|---|
| Catchments (Data) | Delineate catchments for PE-22 crossings | Polygons that drain to the road at the expected points | HydroBASINS level 12 |
| SENAMHI warnings and stations (Data) | Find a feed, service or downloadable file | Machine-readable warning areas and levels | Manual snapshot, documented |
| INGEMMET / CENEPRED hazard layers (Data) | Load susceptibility layers for the corridor | Layers clip to PE-22 | Static download, documented |
| ANA basins and rivers (Data) | Download hydrographic units for the Rímac / Mantaro area | Loads in PostGIS | OpenStreetMap / HydroSHEDS |
| MTC road network (Data) | Download national road geometry | PE-22 geometry with km reference | OpenStreetMap (`ref=PE-22`) |
| SUTRAN incidents (Data) | Find a current incidents source | Machine-readable or scrapeable | Community reports only |
| Terrain tiles (Frontend) | 3D terrain renders for the corridor | Smooth on the presentation laptop | Lower terrain resolution |

**Rule:** if an official source has no usable automated access, load a static snapshot and document it in the README and the demo.

---

## 7. Roles

Adjust to team size. With 3 people, merge Data and Backend.

| Role | Owns |
|---|---|
| **Pitch & traction lead** | Demo script, interviews, getting the number into WhatsApp groups, terminal visit, metrics, slides, rehearsals, README |
| **Backend / agent** | Next.js route handlers, Zavu webhook and templates, extraction, geocoding, dedupe, confidence, contact encryption, Memory Cloud, ElevenLabs, alerts |
| **Data & model** | Integration checks for data, catchment delineation, segments, risk model, reconstruction and forecast evaluation, n8n jobs |
| **Frontend / map** | Next.js UI, MapLibre 3D map, layers, heat map, timeline, indicator panel, live incident updates |

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
| **H0–2** | Align and set up | Read this doc; section 6 checks started and the WhatsApp alert template submitted; Zavu number live; repo, database and deploy working; demo script written |
| **H2–8** | Thin skeleton, end to end | A WhatsApp message creates a pin on the map (even if extraction is crude); PE-22 segments and catchment crossing points loaded; first Open-Meteo pull |
| **H8–10** | **Launch to real users** | Number shared in WhatsApp groups (drivers, family, friends who travel the Central); start collecting usage and problem/impact evidence |
| **H10–18 (night)** | Core | Extraction + dedupe + confidence; catchments delineated; risk model v1; subscriptions + alerts; Yaku 2023 reconstruction data, 2024–2025 archived forecasts and event records loaded |
| **H18** | **Core integration checkpoint** | The live reporting → map → subscriber alert flow works from start to finish |
| **H18–24** | Evaluation + full demo | Calibration and held-out forecast evaluation done; reconstruction timeline; heat map and indicator panel; voice replies; all section 3 MVP features integrated; second-priority features only if the full MVP already works |
| **H18–22 (in parallel)** | **Terminal visit** | Pitch lead (+1 if available) goes to the Central bus/colectivo terminals (e.g. Yerbateros): ~10 interviews, sign-ups, photos/video |
| **H22–29 (in parallel)** | Pitch preparation | Slides, real usage evidence, 5 or more timed rehearsals, and Q&A preparation completed |
| **H24** | **Feature freeze** | Full MVP works end to end; no new features after this point |
| **H24–27** | Harden | Critical flows checked; pre-loaded demo data and cached responses ready; Wi-Fi fallback and 60-second backup video recorded; GitHub setup instructions verified |
| **H27** | **Code freeze** | Only fixes for demo blockers and submission issues from this point |
| **H27–29** | Final validation | Public app and presentation checked from a fresh session; complete demo rehearsed; deliverables ready |
| **By H29:30** | **Submit** | All four deliverables saved at least 30 minutes before H30, or earlier if the official cutoff requires it |
| **H29:30–30** | Verify and prepare to present | Saved submission and links verified; presentation and backup ready |

---

## 8b. Start checklist

- [ ] Everyone has redeemed the sponsor credits (Qatom, Memory Cloud, Zavu, Maritime, ElevenLabs, n8n)
- [ ] Zavu WhatsApp number active and receiving webhooks
- [ ] WhatsApp alert template submitted for approval
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
- Interviews done + the top 3 things we learned and changed

**How we get users:**
1. Share the number in groups of travelers and drivers on the Central, and in our own networks.
2. Go in person to the terminals. Drivers are there waiting; ask them about the last time a huaico caught them.
3. Ask every interviewee: *"Would you use this?"* and *"Would your company pay for it?"* Write down quotes.

**Interview questions (5 min max):**
- How do you find out today whether the Central is open?
- Last time you got stuck: what happened, how long, what did it cost you?
- Would you send a voice note to report a blockage? Would you want an alert before leaving?

---

## 10. Demo script (3 minutes)

| Time | What happens |
|---|---|
| 0:00–0:20 | **Problem.** One driver's story from our interviews + one figure (e.g. days the Central was closed during Yaku) |
| 0:20–0:40 | **What it is.** PeruRoad Climate in one sentence |
| 0:40–1:20 | **Map and reconstruction.** 3D map flies from Peru into the Central; rainfall heat map, catchments and the Yaku 2023 reconstruction, labeled as such |
| 1:20–2:10 | **Live.** A WhatsApp voice note "huaico en el km 52" → pin appears live → confidence updates → a subscribed phone receives the alert |
| 2:10–2:40 | **How it works.** Catchment-based design, code scores / LLM explains, confidence model, held-out forecast evaluation result and its limits |
| 2:40–3:00 | **Users and next steps.** Real usage numbers, interview quotes, who pays, Piura/Tumbes and Qatom API |

**Anticipated questions:**
- What about false reports? (confidence score, reputation, "no confirmado", confirmation from nearby users)
- How accurate is the early warning? (held-out forecast evaluation per lead time, false alarms, baseline comparison, rainfall grid resolution)
- Why is the Yaku replay not proof of prediction? (it uses rain that actually fell; advance-warning claims come only from archived forecasts on held-out seasons)
- Why not just use the official SENAMHI warnings? (they are by province; we work per catchment, combine live reports, and deliver on WhatsApp)
- How do you store phone numbers? (encrypted delivery reference or provider contact ID, HMAC key for matching, opt-out)
- What does the AI do vs. our code?
- What fails first, and what would we do with 3 more months?

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| No huaicos this weekend (October = dry season) | Accept all road incidents (rockfalls, blockades, accidents, roadworks); show huaicos through the 2023 reconstruction |
| WhatsApp template approval is slow or rejected | Submit at H0; alerts by SMS meanwhile; WhatsApp replies inside the 24 h window still work |
| Too few dated incidents to evaluate forecasts | Report the count and make no advance-warning claim |
| Rainfall grid too coarse for small quebradas | State the resolution; group small catchments and flag them low-confidence |
| Catchment delineation fails or is slow | HydroBASINS level 12 fallback, documented |
| Government data has no usable feed | Static snapshot, documented |
| Locating "pasando el puente" fails | Ask the reporter to share their WhatsApp location as fallback |
| Live demo breaks (Wi-Fi, API slowness) | Pre-loaded data, cached responses, phone hotspot, backup video |
| Phone numbers leak | Encrypted delivery reference, HMAC matching key, no raw numbers in logs, secrets outside the repo |
| Scope creep | Section 3 is the contract. Nothing from "second priority" until the full MVP works end to end; no new features after the H24 freeze |
| Panic from wrong alerts | Observed / forecast / estimated labels, confidence levels, and wording that gives risk, not certainty |

---

## 12. Definition of done

- [ ] A real person, not on our team, reported something by WhatsApp and it appeared on the map
- [ ] A subscriber received an alert outside the 24-hour window (template approved) or by SMS fallback
- [ ] Risk level runs hourly over all PE-22 catchments
- [ ] Held-out forecast evaluation computed and documented (or documented as not possible, with the reason)
- [ ] Yaku 2023 reconstruction on the timeline, labeled as a reconstruction
- [ ] Section 6 checks recorded with results and fallbacks used
- [ ] 3D map with heat map, timeline and indicator panel works from the public URL
- [ ] README with architecture, decisions, data sources, resolution limits, and what AI was used for
- [ ] Backup video recorded
- [ ] Pitch rehearsed 5+ times, under 3:00
- [ ] Submitted 30+ minutes early
