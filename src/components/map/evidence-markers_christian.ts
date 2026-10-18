import type { Map as MLMap, Marker } from "maplibre-gl";

import { iconMarkup } from "@/components/icons";
import type { EvidencePoint } from "@/domain/research/evidence-state_christian";

import { cullMarkers, type MarkerEntry } from "./map-markers";

export function syncEvidenceMarkers(
  map: MLMap,
  MarkerClass: typeof Marker,
  entries: Map<string, MarkerEntry>,
  input: {
    points: EvidencePoint[];
    selectedId: string | null;
    onSelect: (id: string) => void;
  },
): void {
  const keep = new Set(input.points.map((point) => point.id));
  for (const [id, entry] of entries) {
    if (keep.has(id)) continue;
    entry.marker.remove();
    entries.delete(id);
  }
  for (const point of input.points) {
    let entry = entries.get(point.id);
    if (!entry) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "pr-evidence-marker";
      const glyph = document.createElement("span");
      glyph.className = "pr-evidence-marker__glyph";
      glyph.innerHTML = iconMarkup("environment", 16); // static trusted SVG
      const count = document.createElement("span");
      count.className = "pr-evidence-marker__count";
      const label = document.createElement("span");
      label.className = "pr-evidence-marker__label";
      el.append(glyph, count, label);
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        // The latest ids are read from the element, avoiding stale filter closures.
        const id = el.dataset.recordId;
        if (id) input.onSelect(id);
      });
      entry = { el, marker: new MarkerClass({ element: el, anchor: "center" }).setLngLat(point.coordinates).addTo(map) };
      entries.set(point.id, entry);
    }
    const selected = input.selectedId !== null && point.recordIds.includes(input.selectedId);
    entry.el.dataset.recordId = point.recordIds[0];
    entry.el.setAttribute(
      "aria-label",
      `Referencia ambiental: ${point.label}, ${point.recordIds.length} registro(s). No es una alerta vial.`,
    );
    entry.el.title = `${point.label} · referencia ambiental, no incidente vial`;
    entry.el.setAttribute("aria-pressed", String(selected));
    entry.el.classList.toggle("is-selected", selected);
    const count = entry.el.querySelector(".pr-evidence-marker__count");
    if (count) count.textContent = point.recordIds.length > 1 ? String(point.recordIds.length) : "";
    const label = entry.el.querySelector(".pr-evidence-marker__label");
    if (label) label.textContent = point.label;
    entry.marker.setLngLat(point.coordinates);
    entry.marker.getElement().style.zIndex = selected ? "35" : "12";
  }
  cullMarkers(map, entries);
}
