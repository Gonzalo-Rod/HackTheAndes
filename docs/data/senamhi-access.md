# SENAMHI warning access discovery

SENAMHI remains part of the Team Plan's hourly official-warning ingestion and
risk inputs. This work verifies a public spatial data path; it does not yet
implement warning persistence, PE-22 intersections, or automated risk scoring.

## Verified public source

On October 17, 2026, direct requests succeeded to the official
[24-hour map](https://www.senamhi.gob.pe/mapas/mapa-24H/) and
[Observatorio](https://observatorio.senamhi.gob.pe/). This corrects the earlier
session's page-fetch timeouts: those failures did not establish that SENAMHI
data was inaccessible.

The map frontend references the IDESEP workspace `g_prono_pp_24h` and layer
`view_aviso24h`. Its HTTPS
[WFS GetFeature endpoint](https://idesep.senamhi.gob.pe/geoserver/g_prono_pp_24h/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=g_prono_pp_24h%3Aview_aviso24h&outputFormat=application%2Fjson&srsName=EPSG%3A4326&maxFeatures=1000)
returned a complete `FeatureCollection` without authentication:

| Check                                          | Observed result                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Full-layer probe at `2026-10-17T19:34:02.881Z` | Seven features; declared total equals returned count.                                       |
| Geometry                                       | `MultiPolygon`, closed rings; explicit longitude/latitude `EPSG:4326` request and response. |
| Source date                                    | `fecha: "2026-10-17Z"`, preserved as a calendar date after validation.                      |
| Raw levels                                     | `Nivel 1`, `Nivel 2`, `Nivel 3`.                                                            |
| Access                                         | Public WFS; no Supabase, n8n, or SENAMHI credentials used.                                  |

An initial exploratory request limited to five features returned only five of
the declared seven. The implemented probe rejects truncated responses; it
requests up to 1,000 features and requires the declared total to match. If that
limit is exceeded later, implement pagination rather than accepting a partial
national warning layer.

## Product semantics still need verification

The workspace/map name suggests a 24-hour precipitation product, but the
returned descriptions mention possible **quebrada activation**. In the captured
response, the same moderate-activation description appeared alongside different
raw levels. Do not silently map these raw levels to our model's risk categories
or assume that a layer name establishes its exact hazard meaning.

Before production use, verify the correct product/layer, severity legend,
publication cadence, issue time, validity interval, and update/correction
behavior against the official product. The `fecha` field alone does not supply
an exact issue hour or expiry timestamp. Availability/terms and historical
coverage remain unverified. No intersection with PE-22 was calculated, and
fetching seven national polygons does not establish an active local hazard.

Official [meteorological warnings](https://web2.senamhi.gob.pe/?p=avisos),
[meteorological downloads](https://www.senamhi.gob.pe/?p=descarga-datos-hidrometeorologicos),
and the [IDESEP service catalog](https://idesep.senamhi.gob.pe/portalidesep/idesep_componente_catalogo_geoservicios_wfs.jsp)
are further discovery paths; a station feed and suitable corridor coverage have
not been verified. Public WFS access already works, so no REST account or
credentials are needed for the current probe.

## Reproduce the access check

```sh
npm --prefix packages/road-data run senamhi:check
```

The probe uses the shared HTTP timeout/retry/logging wrapper, validates the
complete response with Zod, and prints only access metadata. It excludes full
polygons, upstream staff fields, and provider payloads from logs/output. A
`reachable` result means access and structural validation passed; it does not
mean the data is current or ready to drive alerts. `automatedRiskUse` stays false.
On unavailable/invalid data the CLI exits nonzero and explains that missing
warnings cannot be interpreted as the absence of hazards.

Next, verify product semantics and normalize warning identity, geometry,
severity, provenance, and validity into a dedicated contract. Then intersect
with the corridor/catchments and connect persistence and scheduling with A.
Keep official warnings, station observations, numerical forecasts, and our
derived risk levels distinguishable in the model and dashboard.
