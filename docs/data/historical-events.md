# Historical PE-22 event discovery

Checked October 17, 2026. These are **candidate labels for review**, not a complete
training set or a verified assessment of forecast performance. No ML model has
been chosen or trained.

## Implemented capture and preparation

The [input pipeline](model-inputs.md) now downloads bounded public workbooks,
checks hashes, parses the Excel epoch, filters exact PE-22 natural-hazard rows,
projects locations and validates sanitized candidates with Zod. The committed
registry includes the seven Provías candidates below plus the single deduplicated
COEN event, retaining conflicting times and unverified chainage. Its source hashes
identify newer captures than the original exploratory downloads recorded below;
current hashes and coverage are in the [manifest](../../packages/road-data/data/model-inputs-manifest.json).
This implements data preparation without resolving missing labels or establishing
forecast skill; see the [ML checkpoint](ml-readiness.md).

## Official public source found

The [Provías Nacional emergency viewer](https://wsgcv.proviasnac.gob.pe/emergenciavial)
has an anonymous date-range Excel export. Its public UI constructs this endpoint:

```text
https://wsgcv.proviasnac.gob.pe/emergenciavial/EmergenciaVial/ReportToPdfDeExcel
  ?fechaInicio=01%2F01%2F2024
  &fechaFin=30%2F04%2F2024
  &idDepartamento=
  &idTipoEmergencia=
  &idTipoAdministracion=1_2_3_4_5_6_7
```

Use the same parameters with 2025 dates for the second export. Both downloads
returned real XLSX workbooks, with titles confirming the requested range. Each
has columns for source code, exact road code, initial/final official chainage,
latitude/longitude, emergency type, start/end date and road status. The 2025
workbook additionally fills natural-origin/hazard columns that are blank in the
selected 2024 rows. The title date filter is not evidence of exhaustive coverage.

| Requested range | Export bytes | SHA-256 | Exact `PE-22` records |
| --- | ---: | --- | ---: |
| January–April 2024 | 155,771 | `3cff3d774c0541ad8ceda5796176f1b0d9cdab63e89dc2434bb2f99526390e67` | 8: six rockfall/landslide-type records and two traffic crashes |
| January–April 2025 | 194,439 | `be681fe4e4e4a4f319a446bdbb8cfb97cd5980b637cfdd1325d79e69d46ed3d4` | 1: pavement deformation, classified as landslide-related |

Hashes identify the inspected captures, not an immutable provider release.
Excel dates use the workbook's 1900 system (serial origin 1899-12-30); date-only
records must remain Lima calendar dates, with unknown event time. No time of day
is invented. Exact road matching excludes PE-22A and PE-22B.

## Candidate records and spatial audit

Distances below are nearest-point distances to the canonical road geometry in
UTM 18S, rounded to 0.1 m. Passing the existing 500 m location rule establishes
compatibility with that map, not field verification or exact catchment membership.

| Source code | Start date | Provider type | Source initial km | Distance from axis |
| --- | --- | --- | --- | ---: |
| 19631 | 2024-01-30 | DERRUMBE | 115+930 | 11.0 m |
| 19753 | 2024-02-21 | DERRUMBE | 56+000 | 14.7 m |
| 19754 | 2024-02-22 | DERRUMBE | 65+000 | 272.5 m |
| 19830 | 2024-03-02 | DERRUMBE | 97+000 | 0.0 m |
| 19833 | 2024-03-02 | DERRUMBE | 48+000 | 2.7 m |
| 19985 | 2024-03-24 | DERRUMBE | 115+930 | 5.9 m |
| 20934 | 2025-02-05 | DEFORMACIÓN PROFUNDA (>15 CM); hazard DESLIZAMIENTO | 19+000 | 2.4 m |

The two crashes (19524, January 19, 2024; 19520, January 18, 2024) are excluded
from these natural-hazard candidates. The 2024 type alone does not prove a rainfall
trigger. Current/end road status and narratives can reflect later updates and
must never become pre-event model features. Duplicate IDs and recurring events
at one site need explicit review.

## Independent official evidence of incomplete coverage

COEN-INDECI documents a February 22, 2025 landslide on PE-22 at Surco,
with the later report specifying km 68+800 and SINPAD identifier 224418:
[initial report 2411](https://portal.indeci.gob.pe/wp-content/uploads/2025/02/REPORTE-COMPLEMENTARIO-N.%C2%BA-2411-22-FEB2025-DESLIZAMIENTO-EN-EL-DISTRITO-DE-SURCO-LIMA-1-1.pdf),
[updated report 5032](https://portal.indeci.gob.pe/wp-content/uploads/2025/02/REPORTE-COMPLEMENTARIO-N.%C2%BA-5032-19ABR2025-DESLIZAMIENTO-EN-EL-DISTRITO-DE-SURCO-LIMA-2.pdf).
That event is absent from the inspected Provías January–April export. This is
positive evidence that the export alone cannot supply complete PE-22 labels.

The initial report lists 04:30 Lima as occurrence time; its update lists 11:52.
Keep that disagreement as an unresolved interval rather than silently choosing
one time. The two reports describe one event, not two training examples. Official
km 68+800 still needs coordinate/chainage validation against the road geometry.

A full-year 2025 Provías export was also checked: it has only two exact PE-22
records (20934 and 22735), so widening this export alone does not solve the
coverage problem. COEN reports are a useful second source, requiring curated,
deduplicated extraction and source/date/location verification before training.

## Remaining evidence requirements

One candidate in the 2025 holdout is insufficient for a credible year-based skill
claim. Verify coverage against other official reports and investigate whether
concession-managed incidents are missing or differently classified. Expand the
period/source audit before selecting a target, algorithm or temporal evaluation.
No published event on a date does **not** establish an observed negative.

Exact-time warning evaluation cannot use date-only records as though their event
hour were known. Coherent archived forecasts must have been issued before the
whole candidate event interval; keep 2023 Yaku reconstruction separate from
forecast verification. Review the agreed ML checkpoint in the Team Plan before
training, including the label target, predictors, handling of unknown negatives,
2024 calibration/2025 holdout and the resulting limits on claims.

## Other sources checked

The MTC national-road emergency dataset on datosabiertos.gob.pe returned 403
from this environment. INDECI's historical 2003–2018 dataset does not cover the
requested years and its metadata warns that jurisdiction coordinates are not
necessarily event locations. Neither is treated as a verified PE-22 training set.
The Provías viewer was accessible via direct HTTPS requests, although the web
reader timed out; no manual login, token or credential was required.
