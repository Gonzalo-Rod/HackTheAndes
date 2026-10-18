import type { Map as MLMap, MapLayerMouseEvent, Popup } from "maplibre-gl";
export function bindNetworkTooltip(map: MLMap, tooltip: Popup) {
  map.on("mousemove", "network-line", (event: MapLayerMouseEvent) => {
    const properties = event.features?.[0]?.properties as { road?: string; surface?: string; condition?: string } | undefined;
    if (!properties) return;
    map.getCanvas().style.cursor = "help";
    const node = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `Red vial nacional · ${properties.road ?? "—"}`;
    const meta = document.createElement("span");
    meta.textContent = `${properties.surface ?? "Sin dato"} · estado ${String(properties.condition ?? "sin dato").toLowerCase()} (MTC)`;
    node.append(title, meta);
    tooltip.setLngLat(event.lngLat).setDOMContent(node).addTo(map);
  });
  map.on("mouseleave", "network-line", () => {
    map.getCanvas().style.cursor = "";
    tooltip?.remove();
  });
}
