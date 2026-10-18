import type { GeoJSONSource, MapLayerMouseEvent, Map as MLMap, Popup } from "maplibre-gl";
import type { NationalRainResponse } from "@/contracts/weather";
import { nearestRainCell, rainBands } from "@/domain/weather/rain-bands";

import { HILLSHADE_LAYER } from "./basemap-style";

const SOURCE = "national-rain";
const LAYER = "national-rain-fill";

/** Display cells behind the bands, per map, so the tooltip can report the nearest values. */
const displayCells = new WeakMap<MLMap, NationalRainResponse["display"]["cells"]>();

export function addNationalRainLayers(map: MLMap) {
  map.addSource(SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    attribution: "Open-Meteo · lluvia de modelo (CC BY 4.0)",
  });
  // Under the hillshade, so ridges and valleys shade the rain and it takes the form of the mountains.
  map.addLayer(
    {
      id: LAYER,
      type: "fill",
      source: SOURCE,
      // Bands are tiled from many convex pieces; antialiased edges would show their seams.
      paint: { "fill-color": ["get", "color"], "fill-opacity": 0.5, "fill-antialias": false },
    },
    HILLSHADE_LAYER,
  );
}

export function setNationalRainVisibility(map: MLMap, visible: boolean) {
  map.setLayoutProperty(LAYER, "visibility", visible ? "visible" : "none");
}

/** Dry areas are left out so the layer only marks where the model expects or recorded rain. */
export function setNationalRainData(map: MLMap, rain: NationalRainResponse | null) {
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined;
  if (!source) return;
  const cells = rain?.display.cells ?? [];
  displayCells.set(map, cells);
  source.setData({
    type: "FeatureCollection",
    features: rain
      ? rainBands(cells, rain.display.stepDeg).map((band) => ({
          type: "Feature" as const,
          geometry: { type: "MultiPolygon" as const, coordinates: band.polygons },
          properties: { color: band.level.color, label: band.level.label },
        }))
      : [],
  });
}

export function bindNationalRainTooltip(map: MLMap, tooltip: Popup) {
  map.on("mousemove", LAYER, (event: MapLayerMouseEvent) => {
    const properties = event.features?.[0]?.properties as { label?: string } | undefined;
    if (!properties) return;
    const cell = nearestRainCell(displayCells.get(map) ?? [], [event.lngLat.lng, event.lngLat.lat]);
    const node = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${properties.label ?? "Lluvia"} · modelo Open-Meteo`;
    const meta = document.createElement("span");
    // Without a nearby cell the amounts are unknown; never print them as 0 mm.
    meta.textContent = cell
      ? `Próximas 24 h: ${cell.nextMm.toFixed(1)} mm · últimas 24 h: ${cell.pastMm.toFixed(1)} mm (interpolado de celdas de ~80 km; no es pluviómetro)`
      : "Valores no disponibles en este punto (modelo interpolado; no es pluviómetro)";
    node.append(title, meta);
    tooltip.setLngLat(event.lngLat).setDOMContent(node).addTo(map);
  });
  map.on("mouseleave", LAYER, () => tooltip.remove());
}
