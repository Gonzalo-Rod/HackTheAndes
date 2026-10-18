# Multi-road climate-exposure forecast

The "Posibles huaicos" estimate is no longer limited to the PE-22 pilot. Any national road
prepared with the road pipeline and listed in the reviewed registry
(`packages/road-data/data/roads/registry.json`) gets the same assessment: forecast rain over
its catchments, combined with INGEMMET susceptibility where the road itself crosses class 4–5
terrain (policy `climate-exposure-v2`). Estimated exposure stays distinct from official
advisories, confirmed incidents and community reports, and a road without an estimate is
"not assessed", never "low risk".

## Covered roads

Roads are chosen by importance (Provías 2024–2025 emergencies involving rain, huaicos or
landslides) and admitted only while the whole set fits the free tiers; `road:prepare` enforces the
budget in `packages/road-data/src/domain/road-data/forecast-budget.ts`:

- at most 300 weather cells per hourly refresh across all roads (Open-Meteo allows about 10,000
  calls a day; the national rain layer, now refreshed every 3 h, uses about 1,500);
- at most 800 one-kilometer segments per road, because one road's 72 h forecast response is about
  4.7 KB per segment and Vercel Functions cap responses at 4.5 MB (its stored record must also stay
  under the database's 8 MB payload guard).

| Road | Name | Rain/huaico/landslide emergencies 2024–25 | Length | Segments | Catchments | Weather cells |
| --- | --- | --- | --- | --- | --- | --- |
| PE-22 (pilot) | Carretera Central | pilot | 174 km | 174 | 13 | 24 |
| PE-32 | Chala – Incuyo – Puquio | 35 | 292 km | 292 | 32 | 17 |
| PE-12A | La Pampa – Sihuas – Huacrachuco – Uchiza | 27 | 337 km | 337 | 28 | 30 |
| PE-3ND | Cunya – Cutervo | 26 | 135 km | 135 | 8 | 21 |
| PE-18 | Chancay – Oyón – Ambo | 24 | 282 km | 283 | 23 | 17 |
| PE-5NA | Paucartambo – Oxapampa – San Juan del Codo | 23 | 245 km | 246 | 18 | 21 |
| PE-08B | Cajamarca – Chachapoyas – Moyobamba | 22 | 549 km | 550 | 39 | 25 |
| PE-5NC | El Reposo – Bagua Chica – Saramiriza | 14 | 283 km | 284 | 28 | 40 |
| PE-14C | Huari – San Luis – Pomabamba – Cashapampa | 14 | 223 km | 224 | 13 | 9 |
| PE-30A | Nasca – Puquio – Abancay | 13 | 442 km | 443 | 39 | 30 |
| **Total** | 10 roads | | **2,962 km** | **2,968** | **241** | **234 of 300** |

PE-3N (55 such emergencies, 1,971 segments) and PE-5N (36, 1,542 segments) were prepared but exceed
the per-road limit: their forecast responses are 9.2 MB and 7.2 MB. Serving them needs sub-corridors
of at most ~800 km, each with its own geometry revision; their prepared files are kept in the ignored
`data/.cache/roads-unserved/` folder. PE-16A was prepared first but ranks below the roads above. PE-1N, PE-3S, PE-5S and PE-1S are also too long for one corridor.

WhatsApp routes, route watch, the gazetteer, weekly PDFs and SUTRAN database ingestion remain
pilot-only (see [national layers](national-layers.md)). WhatsApp *queries* are national:
`EXPOSICION <road>`, the all-road `EXPOSICION` overview and pins near any registered road
read these assessments (see [WhatsApp commands](../integration/whatsapp-commands.md)).

## Adding a road

```bash
npm --prefix packages/road-data run road:prepare -- PE-1N PE-1S   # geometry → catchments → hazards → weather → exposure
npm --prefix packages/road-data run road:import -- PE-1N PE-1S    # load into Supabase (needs DATABASE_URL)
npm --prefix packages/road-data run build && npm ci               # ship the registry to the app
```

Then commit `data/roads/<code>/` and `data/roads/registry.json` and deploy. Only registered roads
are served: a test or partial database import never becomes a live forecast road, and the pilot
keeps its configured `ROAD_DATA_GEOMETRY_REVISION`. The hourly `POST /api/jobs/climate` refreshes
every registered road; one road failing never blocks the others.

How each step generalizes:

- **Geometry.** The MTC/SUTRAN national network is downloaded once per run and each road is selected
  by its code (`PE-1N#…` sections never match `PE-1NI`). The corridor build still refuses gaps,
  overlaps and disconnected sections rather than bridging them.
- **Catchments.** HydroBASINS level 12 (South America) and the ANA river layer are national. Crossings
  whose upstream union exceeds 10,000 km² (a major river such as the Huallaga) use only their local
  level-12 basin: huaicos come from local quebradas, and averaging rain over a 50,000 km² basin
  dilutes that signal. River flooding from far upstream is a different hazard and is not represented.
  PE-22 (largest 6,996 km²) and PE-16A (4,427 km²) are unaffected.
- **Hazards.** INGEMMET polygons are queried along the road axis and at catchment sample points, four
  queries at a time, with an on-disk operator cache. The UTM zone used for metric buffers follows the
  road's location (Peru spans zones 17–19).
- **Weather and exposure.** Unchanged methods: Open-Meteo ECMWF IFS 0.25° per catchment, refreshed
  hourly on each road's fixed grid plan.

## Limits to covering all national roads

The national network has 161 road codes and 29,454 km. Measured on 2026-10-18:

| Constraint | Evidence | What full coverage needs |
| --- | --- | --- |
| Geometry | 157 roads (29,037 km) pass the strict corridor build. PE-28F, PE-28H, PE-1SC and PE-20B have disconnected or reversed sections. | Nothing for 157 roads; the other four need section reordering or splitting into connected parts. |
| Weather API budget | The free Open-Meteo tier allows about 10,000 location calls a day and is for non-commercial use; each 0.25° cell costs 24 calls a day when refreshed hourly. The budget admits 300 cells. | A commercial Open-Meteo plan (required anyway once dashboard access is sold), or slower refreshes for lower-priority roads. All roads would touch most of the ~1,700 land cells in Peru (about 40,000 calls a day hourly). |
| First weather capture | Samples are now snapped to the 0.25° model grid and batches paced under ~600 calls a minute (an unsnapped PE-5N capture hit HTTP 429 after 600 of 1,660 points). | Spread first captures for many roads over several days to stay within the daily quota. |
| Database growth | Additional roads store only segments and assessments (`road:import`); raw INGEMMET polygons and catchments stay in git. Each assessment holds its full inputs (~6 KB of JSON per segment) and the climate job keeps 6 h per road plus the latest. | At ~7 KB per km retained, all 29,000 km would use about 200 MB of the 500 MB free tier, so storage is not the first limit; weather calls and response size are. |
| Hourly job duration | Roads are refreshed sequentially inside one Vercel function (300 s limit). | Batches per n8n call or a queue once there are more than ~20 roads. |
| Response size | One road's forecast response is ~4.7 KB per segment; Vercel caps responses at 4.5 MB. | Roads over 800 km need sub-corridors or a compact per-window response. |
| Preparation time | INGEMMET answers in about 10–15 s per query; PE-16A took 5 minutes and PE-5N about 30. | One-time, cached, can run unattended; all roads would take several hours. |
| Method validity | The v2 rules and thresholds were tuned on PE-22. Off the ANA river layer most links are containing-basin links (PE-5N: 139 of 154 basins). | Per-region review of thresholds against historical Provías emergencies before presenting other roads beyond "estimate". |
