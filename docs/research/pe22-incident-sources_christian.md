# Carretera Central (PE-22) incident sources and the weekly report

Sources for road incidents on the Carretera Central, and how the automated weekly report uses them. Checked on 17 October 2026.
The corridor is PE-22 from Lima to La Oroya and PE-3S from La Oroya to Huancayo.

## Sources

| Source | Kind | Access | What it gives | Used by the weekly job |
| --- | --- | --- | --- | --- |
| SUTRAN alerts API: [`/public/alerts`](https://api.sigea.sutran.gob.pe/public/alerts), `/public/alerts/{id}`, `/public/alerts/{id}/historial` | Official (road transport regulator) | JSON, no key | Current alerts only, each with a validity date. Event date (`fechaEvento`) without a time; `/historial` gives the publication and status-change times | Yes, as reported |
| INDECI COEN reports: [`/emergencias/feed/`](https://portal.indeci.gob.pe/emergencias/feed/) | Official (civil defence) | WordPress RSS, no key, paged with `?paged=N` | 14 reports per page; 33 pages reached back 7.5 days on 17 Oct 2026, and the feed answers HTTP 404 past its last page. Item descriptions carry the "Fecha y hora de la ocurrencia" table. Many reports follow older events, and follow-up reports reuse the first report's post (new title, same URL) | Yes, as reported |
| [Google News RSS search](https://news.google.com/rss/search?q=%22Carretera%20Central%22%20when%3A7d&hl=es-419&gl=PE&ceid=PE:es-419), Peru edition | News aggregator | RSS, no key, no documented terms | 1–22 items per query on 17 Oct 2026, from many outlets. Dates are listing dates: an article of 14 Sep 2026 was listed on 16 Oct | Yes, for human review only |
| Outlet feeds: [Andina](https://andina.pe/agencia/rss.aspx), [RPP](https://rpp.pe/rss), [Correo](https://diariocorreo.pe/arcio/rss/), [El Comercio](https://elcomercio.pe/arcio/rss/), [Infobae](https://www.infobae.com/arc/outboundfeeds/rss/category/peru/) | News | RSS, no key | Every topic, covering only the last 1–2 days | Not yet; daily reads would be needed |
| Provías Nacional emergency layer (ArcGIS `SERV_PVN_AGE108_EMERGENCIA_DIARIA`) | Official (MTC) | ArcGIS REST | The non-concessioned national network; the layer was out of date when checked | No |
| Deviandes (PE-22 concessionaire) | Concessionaire | Facebook posts | Its alerts; most of them also appear in SUTRAN, reported by "CONCESIONARIA DEVIANDES" | Through SUTRAN only |
| X, Facebook, Instagram, TikTok | Social media | Login needed | Local reports, often without a visible date | No |

Tavily was used for the manual research note ([`pe22-incidents-2026-10-10_17_christian.md`](pe22-incidents-2026-10-10_17_christian.md)).
The weekly job does not use Tavily or any API key. The continuation's run instructions, JSON handoff, verification results and source-review limits are in [`collector-handoff_christian.md`](collector-handoff_christian.md).

## How the weekly job works

1. `.github/workflows/weekly-incident-report_christian.yml` runs every day at 07:00 Lima time (12:00 UTC). Daily runs are
   needed because SUTRAN lists only current alerts. Daily polling can still miss short-lived alerts. Monday through Wednesday runs
   also refresh the previous week to catch reports published within two calendar days after Sunday.
2. `scripts/weekly-incident-report_christian.ts` reads the three sources. Each source can fail without stopping the others; the run
   log records each source's result, and nothing is written if all three fail.
3. It keeps:
   - SUTRAN alerts on PE-22 in the Lima, Huarochirí and Yauli provinces, or on PE-3S in Yauli, Jauja, Concepción and Huancayo,
     whose event date is in the week.
   - INDECI reports for corridor districts (or the Huarochirí, Yauli, Jauja, Concepción and Huancayo provinces) about a hazard that
     can affect the road (huaico, landslide, rain, snow, road accident), whose event date is in the week. Reports without an
     occurrence table are retained by publication date only as unconfirmed evidence in a separate review section.
   - Google News titles that name a corridor place and an incident word. Titles about the Nueva Carretera Central project, crime,
     or places outside the corridor are left out. So are titles that name only "Carretera Central", since roads in Huánuco, Pasco
     and Tarma share that name; the run log counts them.
4. Each run merges its results into `docs/research/weekly/pe22-incidents-<week>_christian.json` and rewrites the report next to it
   (`.md`). Missing fields say "no indicado". Alerts that SUTRAN stops listing stay in the report, marked "No longer listed".
5. The workflow commits to `bot/weekly-incident-report-christian` and keeps one pull request open into the branch it ran from.
   Tests and type checking run before collection; merge conflicts stop the job for review. Local collection uses a directory lock
   and atomic file replacement. Schema-invalid SUTRAN reads preserve previous evidence instead of marking alerts absent.

Run it locally with `npx tsx scripts/weekly-incident-report_christian.ts`. Add `--week-of 2026-10-12` to update another week, or
`--out <dir>` to write elsewhere.

### GitHub setup

- Settings → Actions → General → Workflow permissions: choose "Read and write permissions" and tick "Allow GitHub Actions to
  create and approve pull requests".
- The schedule starts only once the workflow file is on the default branch. No secrets are needed.

## Tests and limits

- The tests (`npx vitest run`) use only real captures from 17 October 2026, kept in
  `src/test/fixtures/weekly-report-real_christian/` with their provenance. They run offline.
- Of the 364 INDECI reports published on 12–17 October 2026, the 3 in corridor districts were about fire or wind, so the job's
  path for a kept INDECI report is tested with a real 2020 huaico report for Lurigancho-Chosica.
- SUTRAN gives no event time, and social media is not covered. News items are leads: check the article before using one.
