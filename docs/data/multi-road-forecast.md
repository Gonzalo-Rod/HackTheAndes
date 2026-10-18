# Multi-road climate-exposure forecast

The "Posibles huaicos" estimate is no longer limited to the PE-22 pilot. Any national road
prepared with the road pipeline and listed in the reviewed registry
(`packages/road-data/data/roads/registry.json`) gets the same assessment: forecast rain over
its catchments, combined with INGEMMET susceptibility where the road itself crosses class 4–5
terrain (policy `climate-exposure-v2`). Estimated exposure stays distinct from official
advisories, confirmed incidents and community reports, and a road without an estimate is
"not assessed", never "low risk".

## Covered roads

| Road | Name (dominant MTC section name) | Length | Segments | Catchments | Weather cells |
| --- | --- | --- | --- | --- | --- |
| PE-22 (pilot) | Carretera Central | 174 km | 174 | 13 | 24 |
| PE-16A | Pativilca – Cajatambo – Oyón | 204 km | 205 | 14 | 16 |
| PE-5N | Longitudinal de la Selva Norte | 1,541 km | 1,542 | 154 (35 large-river crossings local only) | 166 |

PE-3N (Longitudinal de la Sierra Norte, 1,971 segments, 157 catchments) passed geometry and
catchments but its INGEMMET hazard capture failed; it is not registered and is not served.

WhatsApp routes, route watch, the gazetteer, weekly PDFs and SUTRAN database ingestion remain
pilot-only (see [national layers](national-layers.md)).

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
| Weather API budget | The free Open-Meteo tier allows about 10,000 location calls a day, and each 0.25° grid cell counts once per refresh. The three roads above need 206 cells per refresh (about 4,900 calls a day hourly), plus 188 for the national rain layer. | A commercial Open-Meteo plan, a slower refresh (every 3–6 h), or deduplicating cells shared between roads. All roads would touch most of the ~1,700 land cells in Peru (about 40,000 calls a day hourly). |
| First weather capture | Samples are now snapped to the 0.25° model grid and batches paced under ~600 calls a minute (an unsnapped PE-5N capture hit HTTP 429 after 600 of 1,660 points). | Spread first captures for many roads over several days to stay within the daily quota. |
| Database growth | Each assessment stores its full inputs: about 1.2 MB of JSON per 200 km road, about 160 KB per record after Postgres compression. The climate job now keeps 24 h per road and always the latest. | Even with 24 h retention, all roads would hold about 24 × 29,000 km × 0.9 KB ≈ 600 MB, above the Supabase free tier; store compact per-segment results instead of whole input bundles. |
| Hourly job duration | Roads are refreshed sequentially inside one Vercel function (300 s limit). | Batches per n8n call or a queue once there are more than ~20 roads. |
| Dashboard load | The browser fetches each road's assessment and segments every 5 minutes. | A server-side national summary endpoint before going beyond ~10 roads. |
| Preparation time | INGEMMET answers in about 10–15 s per query; PE-16A took 5 minutes and PE-5N about 30. | One-time, cached, can run unattended; all roads would take several hours. |
| Method validity | The v2 rules and thresholds were tuned on PE-22. Off the ANA river layer most links are containing-basin links (PE-5N: 139 of 154 basins). | Per-region review of thresholds against historical Provías emergencies before presenting other roads beyond "estimate". |
