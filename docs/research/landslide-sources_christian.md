# Verified landslide and debris-flow sources — Christian

Verified with **Tavily search and extraction on October 17, 2026** (18:24 Lima / 23:24 UTC). This research identifies official inputs for PeruRoad Climate along PE-22 and the Mantaro extension. It does not establish a current landslide on that corridor. Machine-readable records, exact published download links, extraction request IDs and exclusions are in [landslide-sources_christian.json](landslide-sources_christian.json).

## Best inputs for automation

| Input | What it contributes | Correct interpretation |
| --- | --- | --- |
| [CENEPRED OND 2026 scenario](https://sigrid.cenepred.gob.pe/sigridv3/documento/22910) | Seasonal exposure; published Excel, maps and shapes | Forecast scenario for October–December, requiring district/corridor intersection |
| [INGEMMET hazard metadata](https://catalogo.geoidep.gob.pe/metadatos/srv/api/records/c5580ab5-7277-4858-8d16-a982bd2cc23b) | Official inventory/cartography and exact Shapefile ZIP links | Historical/static susceptibility and documented hazard footprints |
| [INDECI/COEN emergency index](https://portal.indeci.gob.pe/informe/reportes-preliminares-complementarios-emergencias) | Actual official occurrence reports, amendments and PDF links | Evidence only after checking the individual report's event date and location |
| [COEN quebrada bulletin 191](https://portal.indeci.gob.pe/emergencias/boletin-informativo-de-aviso-de-corto-plazo-ante-posible-activacion-de-quebradas-n191-17-10-2026/) | A real short-term warning and its validity | Its extracted exposure is outside the project corridor |

### 1. CENEPRED rain-risk scenario for October–December 2026

The official page identifies a national scenario based on SENAMHI technical report 12-2026 and exposes real [Excel](https://sigrid.cenepred.gob.pe/sigridv3/storage/escenario_trimestral/101_tabla.zip), [map](https://sigrid.cenepred.gob.pe/sigridv3/storage/escenario_trimestral/101_mapas.zip) and [shape](https://sigrid.cenepred.gob.pe/sigridv3/storage/escenario_trimestral/101_shape.zip) archives. Those links were extracted; archive contents were not downloaded. Use a scheduled page check and validate the actual tables/shapes before selecting Huarochirí, Lima or Junín. Publication year is available; an exact publication day is unverified.

### 2. INGEMMET GEOCATMIN hazard and susceptibility metadata

The official record gives WGS 1984, ESRI Shapefile distribution, [January 2025 hazard cartography](https://metadatos.ingemmet.gob.pe:8443/geonetwork/srv/api/records/c5580ab5-7277-4858-8d16-a982bd2cc23b/attachments/CartografiaPeligros_30012025.zip) and [photointerpreted cartography](https://metadatos.ingemmet.gob.pe:8443/geonetwork/srv/api/records/c5580ab5-7277-4858-8d16-a982bd2cc23b/attachments/CartografiaPeligroFotointerpretado.zip). Downloads on port 8443 remain untested. The metadata explains that susceptibility identifies potential locations without predicting timing. Layer updates differ, and copyright is recorded. Cache inspected layers monthly; preserve scale, date and attribution.

### 3. INDECI/COEN official emergency-report index

Tavily extracted the official index with dated preliminary/complementary reports and PDF links. It is a reliable discovery point; a report must still identify the corridor and actual event date before admission. URLs can retain an older report number while the displayed complementary report changes, so retain amendments and content hashes. A page showing recent reports cannot establish completeness or the absence of incidents.

### 4. Today's quebrada bulletin: geographically excluded

Both the [official detail page](https://portal.indeci.gob.pe/emergencias/boletin-informativo-de-aviso-de-corto-plazo-ante-posible-activacion-de-quebradas-n191-17-10-2026/) and its [PDF](https://portal.indeci.gob.pe/wp-content/uploads/2026/10/BOLET%C3%8DN-INFORMATIVO-DE-AVISO-DE-CORTO-PLAZO-ANTE-POSIBLE-ACTIVACI%C3%93N-DE-QUEBRADAS-N%C2%B0191-17-10-2026.pdf) extracted successfully. Validity is **October 17 at 13:00 through October 18 at 13:00 Lima time**. The exposed-province table extracted as **Amazonas / Condorcanqui**. It provides no established PE-22/Lima/Junín coverage and must be excluded from corridor alerts. Inspect image-only map content before making a broader geographic conclusion.

### INDECI daily bulletin and the 18–19 October rain scenario

The [17 October INDECI bulletin 290](https://portal.indeci.gob.pe/wp-content/uploads/2026/10/BOLET%C3%8DN-INFORMATIVO-MONITOREO-DE-PELIGROS-Y-PERSPECTIVAS-N%C2%B0290-del-17-10-2026.pdf) summarizes SENAMHI precipitation notice 422, valid **18–19 October**, for provinces in Lima and Junín. CENEPRED includes a mass-movement risk scenario based on that notice. This is prospective exposure context, not an observed landslide or huaico. The bulletin's department/district-level summary does not establish a PE-22 intersection, and the advertised SENAMHI shape downloads could not be parsed through Tavily; geometry stays unresolved.

## Historical corridor evidence

### 5. Payhua / Matucana technical study

The [INGEMMET study in SIGRID](http://sigrid.cenepred.gob.pe/docs/PARA%20PUBLICAR/INGEMMET/Movimientos%20en%20masa,%20deslizamientos%20y%20huaycos%20Qda.%20Paihua.pdf) connects catchment instability, Rímac blockage, cultivated terraces and exposure of Matucana and the Central road. It supports site context and catchment prioritization. The body discusses work planned in 2006; exact publication date is unresolved. Archive it as historical evidence and manually review any digitized maps. Old populations, modeled volumes and historical events must retain their original context.

### 6. Pucruchacra / San Mateo technical study

The [INGEMMET report in SIGRID](http://sigrid.cenepred.gob.pe/docs/PARA%20PUBLICAR/INGEMMET/Informe%20tecnico%20deslizamiento%20de%20tierras%20Cerro%20Pucruchacra.pdf) identifies a critical area at **Central road km 93+000** and discusses groundwater, irrigation and agriculture. It describes August–September 2011 work. Its text conflicts on the incident day: August 16 in the introduction and August 14 elsewhere. Do not ingest an exact event day until independently resolved. This is distinct from a newly discovered 2026 report.

## Evidence gaps and rejected shortcuts

- Tavily discovered a [2026 Pucruchacra report](https://repositorio.ingemmet.gob.pe/bitstream/20.500.12544/5479/1/2026-OT017-Evaluacion_peligro_cerro_Pucruchacra_San_Mateo-Lima.pdf), but extraction failed. Its findings are unverified and excluded from the six admitted sources.
- A [2017 INGEMMET report record](https://repositorio.ingemmet.gob.pe/handle/20.500.12544/1024) also failed extraction. A search snippet does not establish the report's detailed conclusions.
- A [legacy susceptibility record](https://catalogo.geoidep.gob.pe/metadatos/srv/api/records/5d67c05b-d0cf-4c63-8f4d-719ef3f8b4d3) extracted, but contains inconsistent date/scale metadata and geological WMS links. It does not verify a usable live landslide API.
- The Huancayo-focused search produced broad or out-of-corridor material; no recent Mantaro site report was admitted.
- No confirmed new corridor landslide occurrence was found in this scoped research. This is not proof that no hazard exists.

## Credit ledger

Eight Tavily searches: seven advanced and one basic, estimated **15 credits**. Five advanced-extract calls requested ten URLs; eight succeeded and two failed. Conservatively reserving 2 credits per advanced-extract call gives **10 extract credits**, for an estimated **25 credits total**. Actual billed usage was not exposed by MCP; this is a reservation estimate, not measured billing. All eight query texts are preserved in the JSON.

Only these two new `_christian` research files were written. No visualization files were changed.

