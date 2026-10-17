# Hack the Andes — Team Plan

**Track:** Clima y Territorio
**Working name:** *Vía Alerta* (placeholder, change it if you have a better one)
**One line:** *Waze for huaicos.* Real-time road incidents and early warnings for the Carretera Central, reported and delivered over WhatsApp, shown on a 3D map.

---

## 1. Why we win (read this first)

The judges score three things (1–5 each):

| Criterion | Weight | What a 5 looks like | Our plan to get it |
|---|---|---|---|
| **Technical effort** | 40% | Solid engineering, justified decisions, hard problems solved | Report verification pipeline + per-road-segment risk model + backtest on a real past disaster |
| **Traction** | 30% | Real usage, retention, evidence | Live WhatsApp line used by real drivers this weekend + in-person interviews at the bus terminal |
| **Pitch** | 30% | Convincing proposal, clear demo, precise answers | 3D replay of Cyclone Yaku 2023 + a judge sends a live report from their own phone |

Score = traction × 6 + technical × 8 + pitch × 6. **Technical effort is the biggest weight.** "We used AI" scores nothing by itself. We have to *explain our decisions*.

What we learned from ~150 past hackathon winners:
- Winners use **a channel people already have** (WhatsApp), not a new app.
- The **AI does a narrow job**, wrapped in our own logic with a verification step. No "chatbot for X".
- They have **one technical contribution you can name**. Ours is the risk model *with a backtest*.
- They show **one rehearsed "wow" moment** live, and they never present slides instead of a demo.
- **A narrow scope done deeply** beats a wide scope done shallowly. We cover **one corridor**, not all of Peru.

---

## 2. The problem and the users

Every rainy season, huaicos and rockfalls cut the **Carretera Central** (Lima–Chosica–Matucana–La Oroya), the main route between Lima and the central highlands. Today, drivers find out from WhatsApp groups asking *"¿cómo está la Central?"*, scattered news, and official warnings written for whole provinces, not for kilometer 52.

**Primary user: people who drive the corridor.** Interprovincial bus and colectivo drivers, truckers and travelers. They are the ones who both report and consume information. They already share road status in WhatsApp groups; we give that habit structure.

**Secondary user: residents of quebradas** (Chosica and others), who need early warning.

**Payers (for the business slide):** logistics and bus companies, municipalities and regional emergency centers (COER), insurers, and AI agents paying per call for a route-risk API (Qatom).

**Track fit:** Clima y Territorio (huaicos, rain, alerts), with a transport impact.

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
3. **Subscribe.** *"Avísame de la Central"* sends a message when an incident appears or clears, **or when the predicted risk level rises** (see section 4).
4. **Early-warning risk score** per 1-km road segment, recalculated every hour (section 4).
5. **3D map (web)** of the corridor. Layers:
   - community incidents, colored by confidence
   - predicted risk per segment
   - SENAMHI warnings
   - official susceptibility / risk zones
   - a scrubbable **timeline** that replays **Cyclone Yaku (March 2023)**

### Second priority (only after the MVP works end to end)

- **The agent asks people nearby to confirm.** When a report has low confidence, it messages or calls (ElevenLabs voice) subscribers on that stretch: *"¿Sigue bloqueada la vía en Matucana?"*
- **Paid route-risk API on Qatom** for logistics companies and agents.
- Estimated delay and alternative routes.

### Out of scope (a "next steps" slide only)

Other corridors, frost alerts, El Niño seasonal forecast layer, native mobile app, user accounts.

---

## 4. Early warning (the technical core)

**What we claim:** a *risk level* per road segment for the next 24–72 h, with a plain-language reason. We do **not** claim to predict a huaico at an exact time and place. Say this honestly in the pitch; judges reward it.

**The key insight to explain to judges:** huaicos on the Carretera Central are triggered by rain **upstream in the Andes**, not by rain in Lima. So for every point where a quebrada crosses the road, we measure rainfall over its **upstream catchment**, not at the road.

### Model v1: transparent and rule-based, then calibrated

For each 1-km segment, every hour:

| Input | Source | Why |
|---|---|---|
| Forecast rain, next 24 h and 72 h, averaged over upstream catchment points | Open-Meteo forecast API | The trigger |
| Rain already fallen, last 3 and 7 days | Open-Meteo historical / recent | Wet soil fails faster |
| Susceptibility class (mass movement / flooding) | INGEMMET / CENEPRED layers | Some slopes always fail first |
| Quebrada crosses the road here? | OpenStreetMap waterways + road geometry | Where huaicos actually hit the road |
| Active SENAMHI warning for the province | SENAMHI warnings | Official signal |
| Recent community reports nearby | Our own database | Live ground truth |

**Output:** a level (verde / amarillo / naranja / rojo) plus the top 2–3 reasons, e.g. *"72 mm forecast upstream of Quebrada X in the next 48 h + soil already wet + high-susceptibility zone"*.

- **Code computes the score; the LLM only writes the explanation** in plain Spanish. This is a design decision to explain in the pitch: the score must be reproducible and auditable.
- **Calibration:** set the thresholds by backtesting, not by guessing.

### Backtest (our "measured result" slide)

1. Pull historical rainfall for **Feb–Mar 2023 (Yaku)** and, if there is time, **Mar 2017 (Niño Costero)** from Open-Meteo's archive.
2. Collect the dates and places of the recorded huaicos and road closures on the Central (INDECI emergency records, news).
3. Run the model over that period and show: **did the segment turn orange or red before the recorded event, and how many hours before?** Also count false alarms.
4. This produces one honest number for the pitch, e.g. *"X of Y recorded closures flagged with Z hours of warning"*. Whatever the real result is, we show it. An imperfect measured number beats an unmeasured claim.

The backtest is also what we play on the 3D map timeline.

---

## 5. Architecture

```
WhatsApp user ──► Zavu (WhatsApp/SMS/voice) ──► webhook ──► Agent backend (hosted on Maritime)
                                                             │  ├─ ElevenLabs: speech-to-text / text-to-speech
                                                             │  ├─ LLM: extraction + explanations (structured output)
                                                             │  ├─ Memory Cloud: reporter history, subscriptions, preferences
                                                             │  └─ Verification: geocode → dedupe → confidence
                                                             ▼
                                              Postgres + PostGIS (e.g. Supabase)
                                              incidents · reports · segments · risk_scores
                                                             ▲
n8n (scheduled jobs) ── hourly: Open-Meteo, SENAMHI, MTC ──┘ ── on change: alert fan-out via Zavu
                                                             │
Web map (Next.js + MapLibre/deck.gl 3D terrain) ◄────────────┘
Qatom (Cloudflare Worker template) ── paid "route risk" API endpoint (second priority)
```

### Sponsor tools: each one must do real work

| Tool | Our use |
|---|---|
| **Zavu** | The whole WhatsApp channel: inbound reports, queries, outbound alerts; SMS fallback |
| **ElevenLabs** | Transcribe voice notes; voice replies and alerts for drivers; confirmation calls (second priority) |
| **Memory Cloud** | Reporter reputation (feeds the confidence score), subscriptions, per-user context |
| **n8n** | Hourly data ingestion, risk recalculation trigger, alert fan-out |
| **Maritime** | Hosting for the agent backend |
| **Qatom** | Paid route-risk API that other agents can call (second priority, but strong for the business story) |

### Core data model

- **segment**: id, road (PE-22), km_start, km_end, geometry, susceptibility_class, crosses_quebrada, catchment_points
- **report**: id, reporter_phone_hash, raw_text/audio_url/photo_url, lat/lng (if shared), extracted {type, km, severity, time}, created_at
- **incident**: id, segment_id, type (huaico / derrumbe / bloqueo / accidente / obra), status (active / cleared), confidence 0–1, report_ids[], first_seen, last_confirmed
- **risk_score**: segment_id, computed_at, horizon (24h/72h), level, score, reasons[]
- **subscription**: phone_hash, corridor, km range, channel

**Confidence (v1):** depends on the number of independent reporters, reporter reputation, whether there is a photo, a shared location vs. text only, agreement with the risk score / SENAMHI warning, and decay over time. Show **"no confirmado"** clearly for low confidence. This answers the obvious judge question about false reports.

**Privacy:** store phone numbers hashed, never show who reported what.

---

## 6. Data sources (verify TONIGHT; whoever owns data does this first)

| Data | Source | Status |
|---|---|---|
| Rain forecast + historical archive | Open-Meteo (free, no key) | Expected to work |
| Road geometry PE-22 + quebradas | OpenStreetMap (Overpass) | Expected to work |
| Weather warnings | SENAMHI warnings | ☐ check feed / scrape |
| Susceptibility / risk zones | INGEMMET (GEOCATMIN), CENEPRED (SIGRID) | ☐ check map service / download |
| Recorded emergencies (backtest truth) | INDECI emergency reports, news archives | ☐ check |
| Official road status | MTC / Provías Nacional | ☐ check |
| 3D terrain | MapLibre terrain tiles (or Google 3D tiles if billing is set) | ☐ pick one |

**Rule:** if an official source has no usable feed, load a static snapshot and **say so openly** in the README and pitch. Don't burn hours fighting a government website.

---

## 7. Roles

Adjust to our team size. With 3 people, merge Data + Backend.

| Role | Owns |
|---|---|
| **Pitch & traction lead** | Demo script, interviews, getting the number into WhatsApp groups, terminal visit, metrics, slides, rehearsals. Also the README |
| **Backend / agent** | Zavu webhook, extraction, geocoding, dedupe, confidence, Memory Cloud, ElevenLabs, alerts |
| **Data & model** | Data sources, segments, risk model, backtest, n8n jobs |
| **Frontend / map** | 3D map, layers, timeline replay, live incident updates |

Everyone uses AI coding tools for boilerplate. **The risk logic, confidence logic and backtest are written and understood by us**; judges will ask.

---

## 8. Timeline (H0 = hacking starts)

| Hours | Goal | Done when |
|---|---|---|
| **H0–2** | Align and set up | Read this doc; data sources checked; Zavu number live; repo, database and deploy working; demo script written |
| **H2–8** | Thin skeleton, end to end | A WhatsApp message creates a pin on the map (even if extraction is crude); segments for PE-22 loaded; first Open-Meteo pull |
| **H8–10** | **Launch to real users** | Number shared in WhatsApp groups (drivers, family, friends who travel the Central). Traction starts counting here |
| **H10–18 (night)** | Core | Extraction + dedupe + confidence; risk model v1 per segment; subscriptions + alerts; Yaku 2023 data loaded |
| **H18** | **Feature freeze** | The full demo flow works once from start to finish |
| **H18–26** | Backtest + polish | Backtest number; timeline replay; voice replies; second-priority features *only if* everything above works |
| **H18–26 (in parallel)** | **Terminal visit** | Pitch lead (+1) goes to the Central bus/colectivo terminals (e.g. Yerbateros): ~10 interviews, sign-ups, photos/video |
| **H26–30** | Harden | Pre-loaded demo data; cached LLM answers for the demo; fallback if Wi-Fi fails; 60-second backup video recorded |
| **H30** | **Code freeze** | No new code. Only bug fixes for the demo flow |
| **H30–36** | Pitch | Slides + 5 or more timed rehearsals; Q&A prep; submit 30+ minutes early |

---

## 8b. The night before / right now: checklist

- [ ] Everyone has redeemed the sponsor credits (Qatom, Memory Cloud, Zavu, Maritime, ElevenLabs, n8n)
- [ ] Zavu WhatsApp number active and receiving webhooks
- [ ] Data sources in section 6 checked
- [ ] Collect 10–20 real messages from family WhatsApp groups about road conditions (test set for extraction)
- [ ] List of WhatsApp/Facebook groups for travelers on the Central where we can share the number
- [ ] Check event rules on pre-existing code

---

## 9. Traction plan (30% of the score)

**Metrics we track live, shown on a slide at the end:**
- Reports received / unique reporters
- Queries answered
- Subscribers to alerts
- Returning users (used it more than once)
- Interviews done + the top 3 things we learned and changed

**How we get users:**
1. Share the number in groups of travelers and drivers on the Central, and in our families' groups.
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
| 0:00–0:20 | **Hook.** One driver's story from our interviews + one number (e.g. hours lost / days the Central was closed during Yaku) |
| 0:20–0:40 | **What it is.** "Waze for huaicos, on WhatsApp, with early warning" |
| 0:40–1:20 | **Replay.** 3D map flies from Peru into the Central; timeline plays March 2023: our risk score turns orange/red *before* the recorded closures |
| 1:20–2:10 | **Live.** A judge sends a WhatsApp voice note "huaico en el km 52" → pin appears live → confidence updates → a subscribed phone on stage gets the alert |
| 2:10–2:40 | **How it works.** Upstream-rain insight, code scores / LLM explains, confidence model, backtest number |
| 2:40–3:00 | **Traction + business.** Real usage numbers, interview quotes, who pays, Qatom API |

**Q&A answers to prepare:**
- What about false reports? (confidence score, reputation, "no confirmado", confirmation from nearby users)
- How accurate is the prediction? (backtest number, false alarms, honest limits)
- Why not just use the official SENAMHI warnings? (they are by province; we go per kilometer, combine live reports, and deliver on WhatsApp)
- What does the AI do vs. your code?
- What fails first, and what would you do with 3 more months?

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| No huaicos this weekend (October = dry season) | Accept all road incidents (rockfalls, blockades, accidents, roadworks); show huaicos through the 2023 replay |
| Government data has no usable feed | Static snapshot, disclosed openly |
| Locating "pasando el puente" fails | Ask the reporter to share their WhatsApp location as fallback |
| Live demo breaks (Wi-Fi, API slowness) | Pre-loaded data, cached responses, phone hotspot, backup video |
| Scope creep | Section 3 is the contract. Nothing from "second priority" until the MVP works end to end at H18 |
| Panic from wrong alerts | Labels, confidence levels, and wording that gives risk, not certainty |

---

## 12. Definition of done

- [ ] A real person, not on our team, reported something by WhatsApp and it appeared on the map
- [ ] A subscriber received an alert
- [ ] Risk score runs hourly over all PE-22 segments
- [ ] Backtest number computed on Yaku 2023
- [ ] 3D map with timeline replay works on the presentation laptop
- [ ] README with architecture, decisions, data sources, and what AI was used for
- [ ] Backup video recorded
- [ ] Pitch rehearsed 5+ times, under 3:00
- [ ] Submitted 30+ minutes early
