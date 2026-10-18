import type { Map as MLMap, GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";
import type { ForecastMapData } from "@/domain/exposure/forecast-map";
export function addForecastLayers(map: MLMap) {
  map.addSource("climate-forecast", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    attribution: "PeruRoad · exposición estimada · Open-Meteo / INGEMMET",
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
}
export function setForecastData(map: MLMap, data: ForecastMapData, visible: boolean, selectedId: string | null) {
  (map.getSource("climate-forecast") as GeoJSONSource | undefined)?.setData(data);
  for (const id of ["forecast-line", "forecast-selected"]) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  map.setFilter("forecast-selected", ["==", ["get", "eventId"], selectedId ?? ""]);
  map.setPaintProperty("forecast-selected", "line-opacity", selectedId ? 1 : 0);
}
export function bindForecastSelection(map: MLMap, select: (id: string) => void) {
  map.on("click", "forecast-line", (event: MapLayerMouseEvent) => {
    const id: unknown = event.features?.[0]?.properties?.eventId;
    if (typeof id === "string" && id.startsWith("forecast:")) select(id);
  });
  map.on("mousemove", "forecast-line", (event: MapLayerMouseEvent) => {
    map.getCanvas().style.cursor = event.features?.[0]?.properties?.eventId ? "pointer" : "help";
  });
  map.on("mouseleave", "forecast-line", () => {
    map.getCanvas().style.cursor = "";
  });
}
