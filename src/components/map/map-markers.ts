import type { Map as MLMap, Marker } from "maplibre-gl";

import { STATUS_META, STATUS_PRIORITY } from "@/components/alert-meta";
import { iconMarkup } from "@/components/icons";
import type { RoadAlert } from "@/contracts/road-alerts";

// Alerts are HTML markers (real <button>s) so they are keyboard-focusable and announce
// their status, cause and location to screen readers.

export interface MarkerEntry {
  marker: Marker;
  el: HTMLButtonElement;
}

export interface MarkerSyncInput {
  alerts: readonly RoadAlert[];
  hiddenIds: ReadonlySet<string>;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

function chipLabel(alert: RoadAlert): string {
  const km = alert.kmText.replace(/^km/i, "KM");
  return [km, alert.roadCode].filter(Boolean).join(" · ") || alert.district;
}

function createMarkerElement(alert: RoadAlert, input: Pick<MarkerSyncInput, "onSelect" | "onHover">): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "pr-marker";
  const pulse = document.createElement("span");
  pulse.className = "pr-marker__pulse";
  const dot = document.createElement("span");
  dot.className = "pr-marker__dot";
  const chip = document.createElement("span");
  chip.className = "pr-marker__chip";
  el.append(pulse, dot, chip);
  el.addEventListener("click", (event) => {
    event.stopPropagation();
    input.onSelect(alert.id);
  });
  el.addEventListener("mouseenter", () => input.onHover(alert.id));
  el.addEventListener("mouseleave", () => input.onHover(null));
  el.addEventListener("focus", () => input.onHover(alert.id));
  el.addEventListener("blur", () => input.onHover(null));
  return el;
}

function paintMarker(entry: MarkerEntry, alert: RoadAlert, input: MarkerSyncInput): void {
  const { el } = entry;
  const status = STATUS_META[alert.roadStatus];
  el.dataset.status = alert.roadStatus;
  el.style.setProperty("--marker-color", status.color);
  el.style.setProperty("--marker-ink", status.ink);
  el.setAttribute("aria-label", `${status.label}: ${alert.title}. ${alert.roadCode} ${alert.kmText}, ${alert.district}, ${alert.region}`);

  const dot = el.querySelector<HTMLSpanElement>(".pr-marker__dot");
  if (dot && dot.dataset.cause !== alert.cause) {
    dot.dataset.cause = alert.cause;
    dot.innerHTML = iconMarkup(alert.cause, 14, 2.2); // static, trusted SVG markup
  }
  const chip = el.querySelector<HTMLSpanElement>(".pr-marker__chip");
  if (chip) chip.textContent = chipLabel(alert);

  const hidden = input.hiddenIds.has(alert.id);
  const selected = alert.id === input.selectedId;
  const hovered = alert.id === input.hoveredId;
  const severe = alert.roadStatus === "interrumpido" || alert.roadStatus === "restringido";
  el.classList.toggle("is-hidden", hidden);
  el.classList.toggle("is-selected", selected);
  el.classList.toggle("is-hovered", hovered);
  el.classList.toggle("is-dimmed", input.selectedId !== null && !selected);
  el.classList.toggle("has-chip", selected || hovered || severe);
  el.tabIndex = hidden ? -1 : 0;
  el.setAttribute("aria-hidden", String(hidden));
  el.setAttribute("aria-pressed", String(selected));
  entry.marker.getElement().style.zIndex = String(selected ? 30 : hovered ? 20 : 10 + STATUS_PRIORITY[alert.roadStatus]);
}

/** Hides markers outside the visible area; in steep 3D views far-away points can project into view. */
export function cullMarkers(map: MLMap, entries: Map<string, MarkerEntry>): void {
  const bounds = map.getBounds();
  for (const { marker, el } of entries.values()) el.classList.toggle("is-offscreen", !bounds.contains(marker.getLngLat()));
}

/** Adds, updates and removes markers so they match the given alerts. */
export function syncMarkers(map: MLMap, MarkerClass: typeof Marker, entries: Map<string, MarkerEntry>, input: MarkerSyncInput): void {
  const keep = new Set(input.alerts.map((a) => a.id));
  for (const [id, entry] of entries) {
    if (keep.has(id)) continue;
    entry.marker.remove();
    entries.delete(id);
  }
  for (const alert of input.alerts) {
    let entry = entries.get(alert.id);
    if (!entry) {
      const el = createMarkerElement(alert, input);
      entry = { el, marker: new MarkerClass({ element: el, anchor: "center" }).setLngLat([alert.lng, alert.lat]).addTo(map) };
      entries.set(alert.id, entry);
    }
    entry.marker.setLngLat([alert.lng, alert.lat]);
    paintMarker(entry, alert, input);
  }
  cullMarkers(map, entries);
}

export function disposeMarkers(entries: Map<string, MarkerEntry>): void {
  for (const { marker } of entries.values()) marker.remove();
  entries.clear();
}
