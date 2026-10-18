import type { GeoJSONSource, MapLayerMouseEvent, Map as MLMap, Popup } from "maplibre-gl";
import type { NationalRainResponse } from "@/contracts/weather";
import { classifyRain, rainPeakMm } from "@/domain/weather/rain";

const SOURCE = "national-rain";
const LAYER = "national-rain-fill";

export function addNationalRainLayers(map: MLMap) {
  map.addSource(SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    attribution: "Open-Meteo · lluvia de modelo (CC BY 4.0)",
  });
  map.addLayer({
    id: LAYER,
    type: "fill",
    source: SOURCE,
    paint: { "fill-color": ["get", "color"], "fill-opacity": 0.42 },
  });
}

export function setNationalRainVisibility(map: MLMap, visible: boolean) {
  map.setLayoutProperty(LAYER, "visibility", visible ? "visible" : "none");
}

/** Dry cells are left out so the layer only marks where the model expects or recorded rain. */
export function setNationalRainData(map: MLMap, rain: NationalRainResponse | null) {
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined;
  if (!source) return;
  // A small inset leaves hairline gaps, so the interpolated field reads as fine cells, not blocks.
  const half = ((rain?.display.stepDeg ?? 0) / 2) * 0.94;
  source.setData({
    type: "FeatureCollection",
    features: (rain?.display.cells ?? []).flatMap((cell) => {
      const level = classifyRain(rainPeakMm(cell));
      if (level.level === "seca") return [];
      const [w, e, s, n] = [cell.lng - half, cell.lng + half, cell.lat - half, cell.lat + half];
      return [
        {
          type: "Feature" as const,
          geometry: {
            type: "Polygon" as const,
            coordinates: [
              [
                [w, s],
                [e, s],
                [e, n],
                [w, n],
                [w, s],
              ],
            ],
          },
          properties: { color: level.color, label: level.label, nextMm: cell.nextMm, pastMm: cell.pastMm },
        },
      ];
    }),
  });
}

export function bindNationalRainTooltip(map: MLMap, tooltip: Popup) {
  map.on("mousemove", LAYER, (event: MapLayerMouseEvent) => {
    const properties = event.features?.[0]?.properties as { label?: string; nextMm?: number; pastMm?: number } | undefined;
    if (!properties) return;
    const node = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${properties.label ?? "Lluvia"} · modelo Open-Meteo`;
    const meta = document.createElement("span");
    meta.textContent = `Próximas 24 h: ${Number(properties.nextMm ?? 0).toFixed(1)} mm · últimas 24 h: ${Number(properties.pastMm ?? 0).toFixed(1)} mm (interpolado de celdas de ~80 km; no es pluviómetro)`;
    node.append(title, meta);
    tooltip.setLngLat(event.lngLat).setDOMContent(node).addTo(map);
  });
  map.on("mouseleave", LAYER, () => tooltip.remove());
}
