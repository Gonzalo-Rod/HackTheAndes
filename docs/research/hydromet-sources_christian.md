# Verified water, rain and frost sources for PeruRoad Climate

Verified with Tavily Search and Tavily Extract on **October 17, 2026**, through **18:27 Lima / 23:27 UTC**. These findings target PE-22 through Huarochiri and Yauli and the Mantaro/Junin area. The machine-readable record is [hydromet-sources_christian.json](hydromet-sources_christian.json).

## Results that can be used now

| Evidence | What was actually verified | Project use |
| --- | --- | --- |
| [SENAMHI notice 422](https://www.senamhi.gob.pe/?p=aviso-meteorologico-vigente&a=2026&b=29287&c=00&d=SENA) | Issued October 16; yellow precipitation forecast valid **October 18 at 14:00 through October 19 at 23:59 Lima**. Huarochiri, Yauli and Huancayo are explicitly listed. Central-Andes rainfall forecast: 8–11 mm/day on October 18; central/southern Andes: 9–13 mm/day on October 19. | Upcoming weather forecast, with original validity. Intersect daily warning polygons with the corridor before segment attribution. |
| [INDECI monitoring bulletin 290, 17 October](https://portal.indeci.gob.pe/wp-content/uploads/2026/10/BOLET%C3%8DN-INFORMATIVO-MONITOREO-DE-PELIGROS-Y-PERSPECTIVAS-N%C2%B0290-del-17-10-2026.pdf) | Records **12.0 mm at Ingenio station** (Concepción, Junín) for **16 October 07:00–17 October 07:00**, classified as a rainy day. It also summarizes SENAMHI notice 422: 18–19 October precipitation in Lima/Junín, hail above 2,800 m, significant snow above 3,800 m and gusts above 55 km/h. | Measured station rainfall is useful local data; it is not rainfall on PE-22. The notice is a forecast and still requires its published geometry to verify route overlap. |
| [SENAMHI notice 398](https://www.senamhi.gob.pe/?p=aviso-meteorologico-detalle&a=2026&b=29187&c=00&d=SENA) | Issued October 3, valid October 5–7. The exact panel includes Junin, Yauli and Huancayo. October 5 forecast central-Andes minimum temperatures of 0 to -6 C above 3,500 m. | **Expired historical frost-related forecast** for research and testing; never a current frost observation. |
| [Hydrometeorological observations guide](https://www.gob.pe/9313-conocer-los-datos-hidrometeorologicos-del-peru) | Official service documents station temperature, rainfall and river levels, with automatic versus conventional transmission frequencies. | Correct discovery entry for station observations. The guide itself has no live values; bulletin 290 supplies a dated station rainfall observation below. |
| [Meteorological download instructions](https://www.gob.pe/9312-conocer-los-datos-hidrometeorologicos-del-peru-descargar-los-datos-meteorologicos) | Officially documented daily comma-separated TXT files; registered account and emailed password required. | Historical temperature/rainfall ingestion after an authorized download. No anonymous CSV endpoint was found. |
| [Accumulated-rainfall guide](https://www.gob.pe/9314-consultar-los-datos-de-lluvia-acumulada-a-nivel-nacional) | Official service describes daily updated annual accumulation curves compared with historical values. | Station context and rainfall deficit/excess research; actual chart series still needed. |
| [CHIRILU monitoring](https://www.senamhi.gob.pe?p=monitoreo-chirilu) | Chosica is identified as a Rimac control station. The page has station/flow/anomaly/threshold headings and a [rainfall bulletin link](https://www.senamhi.gob.pe/load/file/02269SENA-112.pdf). The numeric table remained at its loading placeholder. | Water-source discovery and bulletin collection; **no current Rimac flow value verified**. |
| [ANA's official SNIRH service](https://www.gob.pe/86460-acceder-al-sistema-nacional-de-informacion-de-recursos-hidricos) | ANA links its [SNIRH portal](https://snirh.ana.gob.pe/snirhPortal/) and describes observatory/data-analysis services. The portal itself failed extraction. | Verified authoritative entry, with data availability pending. |
| [ANA monitoring article, July 31, 2026](https://www.gob.pe/institucion/ana/noticias/1424775-ana-herramientas-digitales-permiten-el-monitoreo-permanente-de-los-caudales-en-rios) | ANA describes ONRH, its automatic network/SENAMHI interoperability and ANDREA series-analysis tooling. | Provider provenance only; this article does not contain live local measurements. |

## Actual download links and automation limits

Notice 422 exposes two actual WFS SHAPE-ZIP links, recorded in the JSON under `linkedDownloadEndpoints`. Their day selectors are `422_1_2026` and `422_2_2026`; no unadvertised format was guessed. Tavily extraction of the published ZIP links returned no content, including a failed retry, so geometry and PE-22 overlap remain unverified.

Notice detail responses contain many numbered panels. The 422 and 398 records were parsed from their exact headings; the first dates in a response belong to a different notice. The national warning catalogue's `-prueba` links returned a generic institutional page in this run. Those redirected responses were rejected; the actual `aviso-meteorologico-vigente` / `aviso-meteorologico-detalle` responses supplied the numbered evidence.

The main [hydrological monitoring landing page](https://www.senamhi.gob.pe?p=monitoreo-hidrologico) displayed a maintenance notice. Its news/video dates do not establish a river observation timestamp. CHIRILU likewise exposed no numeric table values. The station portal and download portal exposed only headings/labels through Tavily; the official gob.pe instructions establish their documented behavior, not successful data retrieval.

ANA's CHIRILU hydrography/geographic pages and its actual SNIRH portal could not be extracted. Search snippets for those pages remain discovery leads. No ANA station payload, authenticated download, public API or fresh Mantaro flow value was verified.

The additional sweep also extracted the official INDECI bulletin 290 and verified its Ingenio station total. The other notice numbered 290 is the SENAMHI 24-hour rainfall alert; it is a distinct product and should not be confused with INDECI's daily monitoring bulletin 290. Notice 410's exact affected-area lists omit Lima and Junin, so its broad title cannot justify a local frost alert.

## Safe ingestion rules

- Preserve provider, exact URL, issue date, validity, retrieval time and source kind on every record.
- Treat precipitation/temperature notices as forecasts. Require a dated station measurement to label a value observed.
- Reject an expired notice from the current-alert layer; keep it in the historical archive.
- Distinguish provider coverage from actual road-polygon intersection. Province inclusion is insufficient for kilometre-level precision.
- Keep water observations unavailable until a timestamped numeric station payload exists. Do not fill missing flow with a news date or a model prediction.
- Never transform these forecasts or basin pages into confirmed road incidents.

## Tavily call ledger

The dedicated hydromet pass used seven advanced searches and seven extraction calls. The multi-topic notice sweep added 15 searches and five extraction calls; a final corridor audit added five searches and one extraction. See the [consolidated Tavily ledger](tavily-followup-2026-10-17_christian.json) for request IDs and outcomes. Across the related extracts, 32 URLs were attempted: 22 returned content and 10 failed or returned no parseable content. Two original returned pages were generic redirects and were rejected as notice evidence. The conservative estimate is 76 credits; actual billing was not exposed.

The dedicated hydromet pass was estimated at **26 credits**. The later multi-topic notice sweep adds **38** and the final audit **12**, for **76 estimated credits** across these related findings. Tavily did not expose billed usage; these are estimates, not an account balance.

| Search | Advanced query | Request ID |
| --- | --- | --- |
| 1 | SENAMHI avisos meteorologicos lluvias descenso temperatura nocturna sierra Junin Lima octubre 2026 | `f520e796-ffd9-444e-b05e-b05347ccadec` |
| 2 | SENAMHI datos hidrologicos estaciones descarga Rimac Mantaro Chosica hidrologia avisos | `03f8c2bc-cc8a-43db-af69-b095e4df0ecd` |
| 3 | ANA SNIRH observatorio agua datos hidrologicos Rimac Mantaro informacion recursos hidricos | `089f5d50-8b53-4dca-bdf6-c338fd5815a7` |
| 4 | site.senamhi.gob.pe descarga datos hidrometeorológicos estaciones CHOSICA HUANCAYO datos estaciones | `1f2f237d-003b-4387-9118-1580d1a0e53f` |
| 5 | ANA SNIRH Observatorio Nacional Recursos Hídricos caudales hidrometeorologico descarga datos snirh.ana.gob.pe | `9a5476d8-3296-4616-ad6c-938b0fe44af3` |
| 6 | site.senamhi.gob.pe heladas Junin Huancayo octubre 2026 temperatura minima monitoreo | `75b6e780-68d7-4658-8020-6a2e9b59c3df` |
| 7 | Observatorio Nacional Recursos Hidricos ANA acceder SNIRH agua servicio | `464c10e3-1099-42a3-955e-787a27d2dc13` |

| Extract call | Returned content | Failed URLs | Request ID |
| --- | --- | --- | --- |
| 1 | 3 | 0 | `39a9bd17-cd04-4c90-9c47-d3a15a1ce6dd` |
| 2 | 3 | 2 | `059f23d4-805c-4282-ac21-31b7ee2dda0c` |
| 3 | 2 | 2 | `c3ea46ee-af5f-4604-81af-43a98c69a54b` |
| 4 | 1 | 1 | `6eb4bbfb-4e9c-41ab-9f94-5bdb3eb198e5` |
| 5 | 3 | 0 | `19ea803f-9447-4a22-940a-7553273782b1` |
| 6 | 3 | 0 | `f2610b98-6183-4984-8d67-946972a7cf4b` |
| 7 | 0 | 1 | `08e26d52-0979-408e-ab97-09f106b86441` |

Exact returned/failed URLs and errors are preserved in the JSON extraction ledger. No account was created, no personal registration data or credentials were submitted, and no visualization files were changed.

