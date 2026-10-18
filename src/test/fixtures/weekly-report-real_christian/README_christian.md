# Real-data fixtures for the weekly incident report

Every file here is a real response from a public source, captured on 17 October 2026 (times in UTC). Nothing is invented.
Some files are subsets or excerpts of a response; the table says which, and the kept parts are verbatim.

| File | Source | Captured | Content |
| --- | --- | --- | --- |
| `sutran-alerts-2026-10-17T20-56Z_christian.json` | `GET https://api.sigea.sutran.gob.pe/public/alerts` | 20:56:27 | Verbatim body: 13 alerts nationwide, 5 on the corridor |
| `sutran-historial-2026-10-17T20-57Z_christian.json` | `GET https://api.sigea.sutran.gob.pe/public/alerts/{id}/historial` for the 5 corridor alerts | 20:57 | The 5 bodies keyed by alert id; content unchanged, re-serialized as one JSON file |
| `google-news-q1…q6-2026-10-17T22-12Z_christian.xml` | Google News RSS search for each of the six `NEWS_QUERIES`, Peru edition (`hl=es-419&gl=PE&ceid=PE:es-419`) | 22:12:53–55 | Verbatim bodies, in query order |
| `indeci-feed-page1…3-2026-10-17T22-13Z_christian.xml` | `https://portal.indeci.gob.pe/emergencias/feed/` (page 1) and `?paged=2`, `?paged=3` | 22:13:53–58 | Verbatim channel header and footer with a verbatim subset of items; each page keeps its newest and oldest items |
| `indeci-feed-corridor-items-2026-10-17T21-32Z_christian.xml` | Same feed, pages 1–33 read at 21:32–21:34 | 21:32 | Verbatim header and footer with the one corridor-district item (Surco, Huarochirí) |
| `indeci-report-sartimbamba-2026-10-17T22-12Z_christian.html` | `https://portal.indeci.gob.pe/emergencias/reporte-complementario-n-3325-10-3-2026-coen-indeci-0210-horas-reporte-n-1-deslizamiento-en-el-distrito-de-sartimbamba-la-libertad/` | 22:12:57 | Verbatim excerpt: the `og:description` meta tag and the report section from `<h1>` to the download link |
| `indeci-report-san-juan-de-miraflores-2026-10-17T22-12Z_christian.html` | `https://portal.indeci.gob.pe/emergencias/reporte-complementario-n-3015-4-3-2026-coen-indeci-2205-horas-reporte-n-o-1-lluvias-intensas-en-el-distrito-de-san-juan-de-miraflores-lima/` | 22:12 | Verbatim excerpt, as above |
| `indeci-bulletin-quebradas-191-2026-10-17T22-21Z_christian.html` | `https://portal.indeci.gob.pe/emergencias/boletin-informativo-de-aviso-de-corto-plazo-ante-posible-activacion-de-quebradas-n191-17-10-2026/` | 22:21:14 | Verbatim excerpt, as above; a page without an occurrence table |
| `google-news-chosica-2026-10-17T21-28Z_christian.xml` | Google News RSS search for `Chosica when:7d`, Peru edition | 21:28:40 | Verbatim channel header and footer with the one item (of 43) whose title contains a `\|` |
| `indeci-feed-search-huaico-chosica-2026-10-17T22-34Z_christian.xml` | `https://portal.indeci.gob.pe/emergencias/feed/?s=huaico+chosica` | 22:34 | Verbatim body: one 2020 huaico report for Lurigancho-Chosica, without an occurrence table |
| `andina-rss-not-found-2026-10-17_christian.html` | `https://andina.pe/rss/rss.aspx` (HTTP 404) | 21:25:19 | Verbatim body: a real answer that is not a feed |
| `weekly-report-state-2026-10-17T21-58Z_christian.json` | `docs/research/weekly/pe22-incidents-2026-10-12_18_christian.json` as the job wrote it | 21:58:00 | Verbatim state after the job's first two runs, written before the rule that leaves out titles naming only "Carretera Central" |

Left out on purpose: INDECI items whose descriptions give street-level addresses of homes, for example the
Carabayllo, La Perla, Ate and San Juan de Lurigancho reports. Tests that need the Ate and San Juan de Lurigancho
reports use only their titles and dates.

Tests use these files through provider stand-ins, because the repository's tests run without network access
(AGENTS.md). Simulated HTTP failures (500, 429, 503, 404 past the last feed page, timeouts) and empty answers carry no data.
Cases that no capture shows are left untested rather than invented.
