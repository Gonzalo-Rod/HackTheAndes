import type { Map as MLMap, GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";
import { forecastEventAnchors, type ForecastMapData } from "@/domain/exposure/forecast-map";

const CATEGORY_COLOR = ["match", ["get", "category"], "high_attention", "#682583", "#9456ad"] as const;
// Pixel widths that double per zoom level approximate a ground width of about 8 km (outer)
// and 3 km (inner) near Peru's latitude, so the glow tints the slopes on both sides of the road.
const groundWidth = (pxAtZoom6: number) =>
  ["interpolate", ["exponential", 2], ["zoom"], 6, pxAtZoom6, 16, pxAtZoom6 * 1024] as unknown as number;
const FORECAST_LAYERS = [
  "forecast-glow-outer",
  "forecast-glow-inner",
  "forecast-line",
  "forecast-road-casing",
  "forecast-road",
  "forecast-selected",
  "forecast-anchor",
  "forecast-label",
];

export function addForecastLayers(map: MLMap) {
  map.addSource("climate-forecast", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    attribution: "PeruRoad · exposición estimada · Open-Meteo / INGEMMET",
  });
  map.addSource("climate-forecast-anchors", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  // Estimated, not reported: violet and blurred, unlike the solid red rings of reported huaicos.
  map.addLayer({
    id: "forecast-glow-outer",
    type: "line",
    source: "climate-forecast",
    filter: ["!=", ["get", "eventId"], ""],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": CATEGORY_COLOR as never, "line-width": groundWidth(3.4), "line-blur": groundWidth(2), "line-opacity": 0.32 },
  });
  map.addLayer({
    id: "forecast-glow-inner",
    type: "line",
    source: "climate-forecast",
    filter: ["!=", ["get", "eventId"], ""],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": CATEGORY_COLOR as never, "line-width": groundWidth(1.3), "line-blur": groundWidth(0.6), "line-opacity": 0.42 },
  });
  map.addLayer({
    id: "forecast-selected",
    type: "line",
    source: "climate-forecast",
    filter: ["==", ["get", "eventId"], ""],
    paint: { "line-color": "#ffffff", "line-width": 12, "line-opacity": 0 },
  });
  map.addLayer({
    id: "forecast-line",
    type: "line",
    source: "climate-forecast",
    filter: ["in", ["get", "category"], ["literal", ["priority", "high_attention", "unknown"]]],
    paint: {
      "line-color": ["match", ["get", "category"], "high_attention", "#682583", "priority", "#9456ad", "#8b8680"],
      "line-width": ["match", ["get", "category"], "unknown", 3, 7],
      "line-opacity": 0.9,
      "line-dasharray": [2, 1.2],
    },
  });
  // The road itself on forecast stretches: solid and cased, so it reads above the glow and terrain.
  map.addLayer({
    id: "forecast-road-casing",
    type: "line",
    source: "climate-forecast",
    filter: ["!=", ["get", "eventId"], ""],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 7, 6, 13, 12] },
  });
  map.addLayer({
    id: "forecast-road",
    type: "line",
    source: "climate-forecast",
    filter: ["!=", ["get", "eventId"], ""],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": CATEGORY_COLOR as never, "line-width": ["interpolate", ["linear"], ["zoom"], 7, 3.5, 13, 7] },
  });
  map.addLayer({
    id: "forecast-anchor",
    type: "circle",
    source: "climate-forecast-anchors",
    // Hotspots can sit 1–2 km apart; dots appear once zoom separates them, labels dedupe by collision.
    minzoom: 9,
    paint: {
      "circle-color": "#ffffff",
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 13, 8],
      "circle-stroke-color": CATEGORY_COLOR as never,
      "circle-stroke-width": 2.5,
    },
  });
  map.addLayer({
    id: "forecast-label",
    type: "symbol",
    source: "climate-forecast-anchors",
    layout: {
      "text-field": ["match", ["get", "category"], "high_attention", "POSIBLE HUAICO · atención alta", "POSIBLE HUAICO · estimación"],
      "text-font": ["Noto Sans Bold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 5, 10.5, 12, 13],
      // Above the stretch, clear of the road's alert markers.
      "text-anchor": "bottom",
      "text-offset": [0, -1.3],
      "text-letter-spacing": 0.03,
    },
    paint: { "text-color": CATEGORY_COLOR as never, "text-halo-color": "#ffffff", "text-halo-width": 2 },
  });
}
export function setForecastData(map: MLMap, data: ForecastMapData, visible: boolean, selectedId: string | null) {
  (map.getSource("climate-forecast") as GeoJSONSource | undefined)?.setData(data);
  (map.getSource("climate-forecast-anchors") as GeoJSONSource | undefined)?.setData({
    type: "FeatureCollection",
    features: forecastEventAnchors(data).map((anchor) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: anchor.position },
      properties: { eventId: anchor.eventId, category: anchor.category },
    })),
  });
  for (const id of FORECAST_LAYERS) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  map.setFilter("forecast-selected", ["==", ["get", "eventId"], selectedId ?? ""]);
  map.setPaintProperty("forecast-selected", "line-opacity", selectedId ? 1 : 0);
}
export function bindForecastSelection(map: MLMap, select: (id: string) => void) {
  const onClick = (event: MapLayerMouseEvent) => {
    const id: unknown = event.features?.[0]?.properties?.eventId;
    if (typeof id === "string" && id.startsWith("forecast:")) select(id);
  };
  for (const layer of ["forecast-line", "forecast-road", "forecast-anchor", "forecast-label"]) map.on("click", layer, onClick);
  for (const layer of ["forecast-anchor", "forecast-label"]) {
    map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
  }
  map.on("mousemove", "forecast-line", (event: MapLayerMouseEvent) => {
    map.getCanvas().style.cursor = event.features?.[0]?.properties?.eventId ? "pointer" : "help";
  });
  map.on("mouseleave", "forecast-line", () => {
    map.getCanvas().style.cursor = "";
  });
}
