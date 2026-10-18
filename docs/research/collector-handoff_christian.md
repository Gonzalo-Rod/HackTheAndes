# PE-22 collector handoff

This is the scraping and automation layer continued from Claude's work. The original continuation was limited to `_christian` files; the participant subsequently authorized combining it with the visualization. The integration now connects these modules and research files to the shared dashboard, map, API routes and page rendering. New research modules retain the `_christian` naming convention.

## Live dashboard integration — 17 October 2026

Open `http://localhost:3000/`. The default **Clima y territorio** panel now opens at national coverage and presents **323 environmental records with verified official geometry, geometry provenance and dates**: 303 INGEMMET critical-zone points linked to SENAMHI notice 421, 11 daily SENAMHI warning-area records from four notices, and nine dated station/town references. The 13 original records without verified geometry or date, including the undated SENASA trapping reference, remain in original research documents only; they cannot open as main-list/map evidence even through an old link. None of these environmental records becomes a confirmed road incident.

- `src/contracts/research_christian.ts` defines the dashboard API contract. `src/contracts/research-input_christian.ts` validates the captured research, including HTTP(S) links and coordinate bounds.
- `src/domain/research/` normalizes and gates map eligibility, groups station references without inventing coordinates, filters the central navigation window, and evaluates forecast validity using the current time and Lima date boundaries. Official warning polygons retain their original coordinates, and every critical-zone point enters a zoomable MapLibre cluster without moving its source geometry.
- `src/integrations/research-files/research-files_christian.ts` reads the curated environmental snapshot and source registry, plus the weekly files. `src/services/research-catalog-service_christian.ts` assembles the validated catalog and exposes any skipped or failed sources.
- `GET /api/research` returns the 22 records, 39 source references, recent weekly archives and an 18-document manifest. `GET /api/research/documents/[...name]` reads only manifest-listed research files; it cannot read arbitrary paths.
- The page renders the research on the server for the first view. The browser checks for archive changes every five minutes. The existing SUTRAN two-minute polling, Open-Meteo forecast layer, road filters, 3D controls and collapsed history/charts remain available.
- Source documents and the weekly archive are expandable in the environmental panel. News leads remain unverified and unpinned. Archive road statuses describe their capture time and are not counted again as current alerts.

Run `npm run data:collect` to refresh the weekly archive. A successful local run at **21:02 Lima on 17 October** consulted all three providers and saved three SUTRAN observations, no qualifying INDECI report and three news leads; the research API subsequently returned the new archive timestamp. Curated Tavily environmental research remains a dated snapshot, not an automatically refreshed SENAMHI/SENASA feed. Updating those captured JSON files requires review and a new build/deployment; the original documents and validity windows remain visible.

The earlier integration passed 224 tests in 26 files, plus lint, type checking, formatting, build and all 18 document-link checks. The geographic-verification correction adds stricter gating, actual official polygons and clustered critical zones; see [the map verification handoff](map-verification-handoff_christian.md) for current counts, sources, checks and limits. Browser automation was unavailable, so no visual/browser-interaction validation is claimed. No remote schedule, merge or deployment was activated; the existing workflow still needs the default branch and repository permissions described below.

## Run locally

From the `HackTheAndes` repository:

```powershell
npx.cmd tsx scripts/weekly-incident-report_christian.ts
```

On Linux/macOS use `npx` instead of `npx.cmd`. No additional package, key or Tavily account is needed by the scheduled collector. It uses the existing validated `SUTRAN_API_BASE` setting and public INDECI and Google News feeds.

```powershell
# Refresh another week using the data still available from the sources.
npx.cmd tsx scripts/weekly-incident-report_christian.ts --week-of 2026-10-12

# Keep an experimental run separate from the committed report archive.
npx.cmd tsx scripts/weekly-incident-report_christian.ts --out docs/research/preview_christian
```

`--week-of` selects a report window; it cannot recover expired SUTRAN alerts or turn Google News into a historical archive. The reports cover Monday through Sunday in America/Lima. The current week is provisional until its final collection run.

## Weekly data used by the visualization

Read `docs/research/weekly/pe22-incidents-<week>_christian.json`. Its contract is `src/contracts/weekly-incident-report_christian.ts`; `WeeklyStateSchema` validates it. JSON is the persisted evidence; the neighboring Markdown file is a derived review report.

| Field | Meaning and handling |
| --- | --- |
| `window` | Inclusive event-date window in Lima time. |
| `updatedAt`, `runs` | Collection times in UTC and per-source health. A successful run does not imply every source succeeded. |
| `sutran[].alert` | Official road alert, including `lat`, `lng`, road code, km, event date and reported status. |
| `sutran[].history` | Publication/status-change timestamps. They are not the event time. |
| `sutran[].listedInLatestRun` | Whether the last successful complete SUTRAN read listed this alert. If the latest run failed, show its age and source failure. |
| `indeci[]` | Official area reports; district/province matching does not establish that PE-22 was affected. `occurredDate: null` means the event date remains unconfirmed. |
| `news[]` | Discovery leads requiring article review. `listedAt` is the aggregator listing time, not an independently verified event date. |

Do not combine these arrays into a count of confirmed road incidents. Do not invent coordinates, km markers, dates, road status or a SUTRAN match for INDECI/news entries. The collector does not send messages, make risk predictions, compute closure durations, or implement the paid n8n report-delivery feature.

## Automated collection

`.github/workflows/weekly-incident-report_christian.yml` runs daily at 07:00 Lima (12:00 UTC) and supports a manual trigger. Monday through Wednesday also refresh the previous week, including reports published within two calendar days after that week. Scheduled GitHub workflows must be on the default branch, and Actions needs contents/PR write permissions plus permission to create pull requests.

The job validates collector tests and types before collecting. It keeps a review PR from `bot/weekly-incident-report-christian`; it never merges that PR. Only `_christian.json` and `_christian.md` report files are staged. A merge conflict fails the workflow for review instead of silently favoring old bot code over teammates' changes. This local continuation does not activate the schedule or change repository settings.

Daily polling can miss short-lived alerts. Use the team's separate continuous ingestion for live road monitoring; this archive must not be presented as complete incident coverage.

## Verified continuation run

On 17 October 2026 at 18:17 Lima, the live collector completed successfully and updated the 12–18 October JSON and Markdown report. All three sources answered: three SUTRAN alerts, zero qualifying INDECI reports and three Google News leads. The dated SUTRAN entries are PE-3S km 6 at La Oroya (14 October, reported open), PE-22 km 51 at Santa Cruz de Cocachacra (17 October, reported open), and PE-22 km 88 at San Mateo (17 October, reported restricted). These statuses describe that collection time.

The final local checks passed: 205 tests in 23 files, TypeScript without emit, ESLint, Prettier for the affected code/workflow/manual documentation, and the changed-file secret and scope checks. The live Node command needed execution outside the sandbox because the sandbox blocked `os.userInfo`; source requests then succeeded. GitHub Actions execution and repository permissions have not been verified remotely. Nothing was committed or pushed by this continuation.

## Failure and recovery behavior

- HTML or truncated RSS responses are source failures, including when HTTP status is 200. INDECI keeps earlier pages and marks the listing partial if a later page fails.
- SUTRAN schema rejections preserve prior observations and listing flags; they cannot establish that an alert disappeared. History failures keep previous history and appear in the run notes.
- INDECI entries without an occurrence date remain in the JSON evidence and appear in a separate unconfirmed section in Markdown.
- One source failing does not stop the others. If every source fails, the existing report files stay unchanged and the command exits unsuccessfully.
- A directory lock prevents concurrent local writes. After a killed process, first verify that no collector is running, then remove only `.weekly-report_christian.lock` from that output directory and retry.
- Each output is replaced by a same-directory atomic rename. JSON is saved first; if Markdown fails afterward, JSON remains authoritative and rerunning rebuilds the report. The two files are not a single filesystem transaction.
- Invalid saved JSON or a mismatched report window stops the run rather than replacing existing evidence. Fix the file using a backup or version control before retrying.

## Tavily source review, 17 October 2026

Four additional searches (two advanced, two basic) and one basic extraction batch used approximately seven credits, in addition to the handoff's estimate of 81. The collector itself makes no Tavily calls. No additional incident has been promoted to confirmed status from this review.

- The official [Provías press release](https://www.gob.pe/institucion/pvn/noticias/1452807-provias-nacional-restablece-el-transito-en-mas-del-90-de-carreteras-nacionales-no-concesionadas-afectadas-por-emergencias-viales), published 5 October 2026, links to [its emergency viewer](https://wsgcv.proviasnac.gob.pe/visores/emergencias). It describes the non-concessioned national network. This is source discovery outside the requested incident window, not an incident added to this week's report. The legacy `/emergenciavial` extraction timed out, so a fresh machine-readable API contract was not established.
- Search returned older RPP articles with current sidebar material and INDECI reports for other roads. Those results do not prove an in-window corridor incident and were excluded.
- A Yanacoto Instagram result reproduced a lead already present in the original research. The dates of other posts in its page are not independent evidence for this event's date, so the review adds no confirmation.

See `pe22-incident-sources_christian.md` for the original source survey and `pe22-incidents-2026-10-10_17_christian.md` for the historical manual research note. That note is preserved as Claude's earlier research; this continuation does not re-certify its social-media dates.
