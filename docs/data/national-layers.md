# National map layers and remaining PE-22 scope

Checked October 18, 2026. These layers extend the dashboard to all of Peru. They are context for
preparedness: none of them is a PeruRoad exposure score, and missing data never means safety.

## Layers

| Layer | Source | How it is served | Interpretation |
| --- | --- | --- | --- |
| Avisos · SENAMHI (all of Peru) | SENAMHI quebrada-activation WFS and bulletin | `GET /api/hazards/warnings`: live, 10-minute server cache | Official levels and validity from the bulletin; the map shows only currently valid warnings. Previously the map showed the copy clipped to PE-22 (0 warnings on October 18 while 10 were valid nationally). |
| Susceptibilidad · INGEMMET (all of Peru) | INGEMMET `SERV_SUSCEPTIBLE_MOV_MASA_REGIONAL` ArcGIS export | Raster tiles requested by the browser (CORS allowed), layer 1 only | Official static classes and colors (dark green very low to red very high). The PE-22 vector polygons still feed the exposure assessment. |
| Lluvia · todo el Perú | Open-Meteo forecast API | `GET /api/weather/national`: 188 model cells of 0.75°, bilinearly interpolated to 1,703 display cells of 0.25° inside Peru (`npm run data:rain-grid` rebuilds both from `public/data/regiones.geojson`), hourly server cache | Model rain, the larger of the last and next 24 h. The finer display cells are interpolated for readability, not extra model output, and are not gauge readings. Dry cells are not drawn; model cells with incomplete hours are omitted and counted. |
| Posibles huaicos (pronóstico, carreteras registradas) | PeruRoad exposure estimate | Forecast layers in `src/components/map/forecast-layers.ts` | Violet blurred band (about 8 km wide at ground scale, 3 km core) draped on the terrain along each priority or high-attention stretch, plus a clickable "POSIBLE HUAICO" label. Deliberately distinct from the solid red rings of reported events; it is an estimate of rain over susceptible terrain, not an event. |
| Huaicos y deslizamientos | SUTRAN and community alert text | Classified in the browser (`src/domain/road-alerts/mass-movement.ts`) | Larger labeled markers and graded rings (5 km for huaicos, 3.5 km for landslides and rockfalls) draped over the 3D terrain; national-network roads inside a ring are drawn bold in the ring color, the alert's own road thickest (codes compared without leading zeros, `PE-02` = `PE-2`). Visual emphasis only, not a modeled impact area. |
| Emergencias pasadas · Provías | Provías Nacional exports | `GET /api/history/road-events` | See [national road events](national-road-events.md). |

Open-Meteo counts each grid location as a call: one refresh per server instance per hour is
about 4,500 calls a day, within the free tier. The elevation endpoint returned HTTP 429 during the
October 18 terrain capture, so terrain slopes for the two new PE-22 catchments are still pending.

## Visible fallback

| Provider | Failure | Visible result |
| --- | --- | --- |
| SENAMHI | WFS or bulletin unavailable | Last live result labeled as cache, or the dated national capture labeled as a snapshot; the dashboard shows the message. Never read as "no warnings". |
| INGEMMET tiles | Tile service unavailable | Tiles fail to load and the base map stays visible; the layer row remains, with no false classes drawn. |
| Open-Meteo (national grid) | Request fails | Last grid flagged stale with its fetch time, or a safe `503` and an unavailable message before any data. |

## Still limited to the PE-22 pilot

Climate exposure is no longer pilot-only: any national road prepared with `road:prepare` and listed
in the registry gets forecasts (see [multi-road forecast](multi-road-forecast.md)). These tools depend on a measured road axis with kilometer segments, a gazetteer and catchments,
and one geometry revision configured per deployment (`ROAD_DATA_GEOMETRY_REVISION`):

| Tool | Why it is PE-22 only | What expansion needs |
| --- | --- | --- |
| WhatsApp subscriptions, `RUTA`, alerts, weekly PDF | Origin/destination are km on the PE-22 axis; pins must be within 500 m of it | Multi-road geometry and gazetteer, plus a road code on subscriptions and alert matching. |
| Route-watch calls | Same km reference; incidents come from the PE-22 database archive | A national variant could use SUTRAN's official road code and chainage from the live feed; not built. |
| SUTRAN database archive | Kept to PE-22 so national history backfill cannot make polls partial and silence PE-22 alerts | A separate national ingestion job and freshness check. |
