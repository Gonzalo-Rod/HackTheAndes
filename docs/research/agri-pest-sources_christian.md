# Verified agriculture and pest sources

Verified through Tavily MCP search and extraction on **17 October 2026**, at
**18:25 Lima / 23:25 UTC**. Scope: PeruRoad Climate's PE-22 / Rimac corridor and
the Mantaro / Junin extension. This research changes no visualization files.

**For crop and pest advisories, the usable discovery source is SENAMHI's official
bulletin catalogue and its linked documents. No dated, confirmed plant-pest
outbreak on PE-22 or in the Mantaro Valley was verified.** That search outcome
does not establish absence of pests. A separate COEN report documents a closed
wildfire with crop losses at Ayas, Surco.
The machine-readable provenance, query ledger and failed accesses are in
[agri-pest-sources_christian.json](agri-pest-sources_christian.json).

## Extracted primary sources

| Source | Actual information and correct use |
| --- | --- |
| [SENAMHI bulletin catalogue](https://www.senamhi.gob.pe?p=boletines) | Official HTML discovery of crop risk, insect/disease conditions and crop-impact PDF editions. Inspect each linked document separately. |
| [Potato risk, October–December 2026](https://www.senamhi.gob.pe/load/file/02954SENA-104.pdf) | Sierra Central seasonal moisture and temperature risks. Forecast; regional coverage cannot confirm a local field loss or road incident. |
| [Maize risk, October–December 2026](https://www.senamhi.gob.pe/load/file/02955SENA-106.pdf) | Sierra Central planting and crop-development moisture risks. Advanced extraction succeeded after basic extraction failed. Forecast, updated monthly. |
| [Insect conditions, 12–15 October](https://www.senamhi.gob.pe/load/file/02976SENA-1133.pdf) | Fruit fly and coffee borer environmental suitability. Experimental GFS-based forecast at 27 km; expired, geographically broad, with text-layout date anomalies. |
| [Disease conditions, 12–15 October](https://www.senamhi.gob.pe/load/file/02977SENA-1133.pdf) | Coffee rust and horticultural fungal-disease suitability at selected stations. Experimental, expired forecast; named stations do not verify a PE-22/Mantaro infection. |
| [Sierra crop impacts, 29 September–5 October](https://www.senamhi.gob.pe/load/file/02974SENA-164.pdf) | Dated crop/weather observations outside Junin in extracted content. Conditional disease advice is separate from measured weather and crop condition. |
| [INDECI / COEN report 14162, Surco fire](https://portal.indeci.gob.pe/wp-content/uploads/2026/10/REPORTE-COMPLEMENTARIO-N.%C2%BA-14162-14OCT2026-INCENDIO-FORESTAL-EN-EL-DISTRITO-DE-SURCO-LIMA-5.pdf) | Records a forest fire at Ayas annex, Surco, Huarochirí, beginning 30 September 2026 at 12:49. The damage table (updated 2 October) reports 45 ha of agricultural crops affected and 25 ha of natural cover destroyed, including palta, chirimoya, alfalfa, membrillo and tuna. INDECI says the fire was extinguished and closes the report. It has no exact incident coordinates. |
| [SENASA SIGIA](https://servicios.senasa.gob.pe/SIGIAWeb/sigia_consulta_cultivo.html) | Pesticide registration consultation by crop and pest. It is not an outbreak notification feed; query/API access remains unverified. |
| [SENASA surveillance process](https://www.senasa.gob.pe/senasacontigo/vigilancia-fitosanitaria-permite-detectar-oportunamente-presencia-de-plagas) | Explains occurrence reporting, specialist verification and diagnostic sampling. Undated guidance, with Cusco examples; not a current local event. |

## Automation handoff

1. Retrieve the catalogue and discover PDFs under the exact product headings;
   use the source links, never guessed sequential filenames.
2. Store document identity, retrieval time, source URL, observation period,
   publication evidence, forecast validity and geography as separate fields.
3. Keep the potato/maize products at seasonal regional scale. The insect and
   disease documents are environmental suitability forecasts, not pest detections.
4. Apply expiration before a record can enter current alerts. The latest insect
   and disease editions linked by the extracted catalogue ended **15 October**;
   their successful retrieval on 17 October does not renew them.
5. Require a dated official detection, diagnostic result or official notification
   with locality before producing an observed pest alert. Missing dates, unknown
   geography, conflicting extracted dates and unsupported field-level precision
   go to review.
6. PDF text extraction worked through Tavily; no public JSON API, CSV export,
   shapefile for these crop/pest documents or guaranteed endpoint stability was
   established. Map geography and diagram-only values still require review.

The Sierra impact catalogue label is 29 September, while the document covers
29 September–5 October. Its publication day remains unknown; do not silently
substitute the label for publication or observation time.

The COEN fire is a real, documented agricultural-impact event, not a current
fire alert or a road closure. Keep the damage update date separate from the
occurrence date and do not place a point at the district centre: the report
names the Ayas annex but does not provide an incident coordinate or field
boundary. The [17 October INDECI daily bulletin](https://portal.indeci.gob.pe/wp-content/uploads/2026/10/BOLET%C3%8DN-INFORMATIVO-MONITOREO-DE-PELIGROS-Y-PERSPECTIVAS-N%C2%B0290-del-17-10-2026.pdf)
also records 12.0 mm of station rainfall at Ingenio in Concepción, Junín, from
16 October 07:00 to 17 October 07:00; see the hydromet handoff for the
approximate station geometry.

## Gaps and rejected evidence

An official [Mantaro forest-surveillance article](https://www.senasa.gob.pe/senasacontigo/junin-vigilancia-fitosanitaria-previene-el-establecimiento-de-plagas-forestales-en-bosque-dorado)
was extracted, but it describes prevention and lacks a reliable article date.
It contributes no current outbreak. SENASA's changing site header was ignored.
The [Junin bulletin shell](https://www.senamhi.gob.pe/main.php?dp=junin&p=boletines)
yielded little content, so document discovery used the national catalogue.
Advanced extraction of the [MIDAGRI SIEA portal](https://siea.midagri.gob.pe/portal/)
failed. No SIEA API, export format, production figure or crop damage was asserted.
AgroRural observations were not verified in this pass.

**Usage:** 9 Tavily searches, 3 extraction calls, 12 requested URL extractions
(including one maize retry); **20 estimated credits**. Search estimate: 16;
extraction batch estimate: 4. Tavily did not expose billed credit usage or balance.

