import type { GeoJSONSource, MapLayerMouseEvent, Map as MLMap, Popup } from "maplibre-gl";
import type { NationalRoadEvent } from "@/contracts/road-history";
import {
  HISTORY_CATEGORY_GROUP,
  HISTORY_CATEGORY_LABELS,
  HISTORY_GROUP_COLORS,
  HISTORY_STATUS_LABELS,
} from "@/components/road-history-meta";
import { formatCalendarDate } from "@/lib/format";

const SOURCE = "road-history";
const LAYER = "road-history-circle";

export function addHistoryLayers(map: MLMap) {
  map.addSource(SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    attribution: "Provías Nacional · emergencias ene–abr 2024 y 2025",
  });
  map.addLayer({
    id: LAYER,
    type: "circle",
    source: SOURCE,
    layout: { visibility: "none" },
    paint: {
      "circle-color": [
        "match",
        ["get", "group"],
        "natural",
        HISTORY_GROUP_COLORS.natural,
        "infrastructure",
        HISTORY_GROUP_COLORS.infrastructure,
        HISTORY_GROUP_COLORS.other,
      ],
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2.5, 9, 5, 13, 7],
      "circle-opacity": 0.7,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 0.8,
    },
  });
}

export function setHistoryVisibility(map: MLMap, visible: boolean) {
  map.setLayoutProperty(LAYER, "visibility", visible ? "visible" : "none");
}

export function setHistoryData(map: MLMap, events: readonly NationalRoadEvent[]) {
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined;
  source?.setData({
    type: "FeatureCollection",
    features: events.flatMap((event) =>
      event.position
        ? [
            {
              type: "Feature" as const,
              geometry: { type: "Point" as const, coordinates: event.position },
              properties: {
                group: HISTORY_CATEGORY_GROUP[event.category],
                title: `${HISTORY_CATEGORY_LABELS[event.category]} · ${event.roadCode}`,
                detail: `${formatCalendarDate(event.date)} · ${HISTORY_STATUS_LABELS[event.initialStatus]} · ${event.district}, ${event.department}`,
              },
            },
          ]
        : [],
    ),
  });
}

export function bindHistoryTooltip(map: MLMap, tooltip: Popup) {
  map.on("mousemove", LAYER, (event: MapLayerMouseEvent) => {
    const properties = event.features?.[0]?.properties as { title?: string; detail?: string } | undefined;
    if (!properties) return;
    map.getCanvas().style.cursor = "help";
    const node = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `Antecedente · ${properties.title ?? "—"}`;
    const meta = document.createElement("span");
    meta.textContent = `${properties.detail ?? ""} (Provías; no es alerta vigente)`;
    node.append(title, meta);
    tooltip.setLngLat(event.lngLat).setDOMContent(node).addTo(map);
  });
  map.on("mouseleave", LAYER, () => {
    map.getCanvas().style.cursor = "";
    tooltip.remove();
  });
}
