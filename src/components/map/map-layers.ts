import type { ExpressionSpecification, GeoJSONSource, Map as MLMap } from "maplibre-gl";

import { STATUS_META } from "@/components/alert-meta";
import { CONDITION_COLORS, CONDITION_FALLBACK, type LayerState } from "@/components/dashboard/types";
import type { CorridorData } from "@/contracts/corridor";
import { pointAtKm, sliceByKm } from "@/domain/geo/measure";
import type { RainSegment } from "@/domain/weather/rain";
import { AFFECTED_STRETCH_HALF_KM, type CorridorAlert } from "@/domain/road-alerts/corridor-placement";
import { formatElevation } from "@/lib/format";

import { createLabelLayers, HILLSHADE_LAYER, PALETTE, SATELLITE_LAYER } from "./basemap-style";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const NO_REGION = "__none__";
const CORRIDOR_LAYERS = [
  "corridor-casing",
  "corridor-line",
  "corridor-flow",
  "corridor-stretches",
  "corridor-km",
  "corridor-km-label",
  "corridor-places",
];

// "Ant path" dash cycle that makes the corridor read as a flowing route.
const FLOW_DASHES: number[][] = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];
const FLOW_STEP_MS = 90;

const source = (map: MLMap, id: string) => map.getSource(id) as GeoJSONSource | undefined;

/** Adds the thematic sources and layers; static layers load by URL so parsing happens in the map worker. */
export function addThematicLayers(map: MLMap, origin: string): void {
  map.addSource("regions", { type: "geojson", data: `${origin}/data/regiones.geojson` });
  map.addSource("rivers", { type: "geojson", data: `${origin}/data/rios-quebradas.geojson` });
  map.addSource("network", { type: "geojson", data: `${origin}/data/red-vial-nacional.geojson`, tolerance: 0.5 });
  for (const id of ["corridor", "corridor-rain", "corridor-stretches", "corridor-km", "corridor-places", "profile-point"]) {
    map.addSource(id, { type: "geojson", data: EMPTY });
  }

  // A light wash over Peru's regions, under the hillshade, so the country reads first.
  map.addLayer(
    { id: "regions-spotlight", type: "fill", source: "regions", paint: { "fill-color": "#fffaf0", "fill-opacity": 0.14 } },
    HILLSHADE_LAYER,
  );
  map.addLayer({
    id: "regions-highlight",
    type: "fill",
    source: "regions",
    filter: ["==", ["get", "key"], NO_REGION],
    paint: { "fill-color": "#c2512c", "fill-opacity": 0.06 },
  });
  map.addLayer({
    id: "regions-line",
    type: "line",
    source: "regions",
    paint: { "line-color": PALETTE.boundary, "line-width": 0.8, "line-opacity": 0.55 },
  });
  map.addLayer({
    id: "rivers-line",
    type: "line",
    source: "rivers",
    layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["match", ["get", "kind"], "quebrada", "#5fa6c4", "#3b88ae"],
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        ["match", ["get", "kind"], "quebrada", 0.5, 0.8],
        12,
        ["match", ["get", "kind"], "quebrada", 1.6, 2.6],
      ],
      "line-opacity": 0.8,
    },
  });
  map.addLayer({
    id: "network-line",
    type: "line",
    source: "network",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#6b6255", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 8, 1.5, 12, 2.8], "line-opacity": 0.7 },
  });
  addCorridorLayers(map);
  for (const layer of createLabelLayers()) map.addLayer(layer);
  addCorridorLabelLayers(map);
}

function addCorridorLayers(map: MLMap): void {
  const round = { "line-cap": "round", "line-join": "round" } as const;
  map.addLayer({
    id: "corridor-casing",
    type: "line",
    source: "corridor",
    layout: round,
    paint: { "line-color": "#fffdf7", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 3.5, 10, 7, 14, 13] },
  });
  // Rain ribbon: the corridor colored by 24 h rain, under the alert stretches and the road line.
  map.addLayer({
    id: "corridor-rain",
    type: "line",
    source: "corridor-rain",
    layout: round,
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 8, 10, 14, 14, 22],
      "line-opacity": 1,
    },
  });
  map.addLayer({
    id: "corridor-stretches",
    type: "line",
    source: "corridor-stretches",
    layout: round,
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 6, 10, 11, 14, 18],
      "line-opacity": 0.85,
      "line-blur": 1,
    },
  });
  map.addLayer({
    id: "corridor-line",
    type: "line",
    source: "corridor",
    layout: round,
    paint: { "line-color": "#2b2620", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.8, 10, 3.6, 14, 6.5] },
  });
  map.addLayer({
    id: "corridor-flow",
    type: "line",
    source: "corridor",
    minzoom: 7,
    layout: { "line-cap": "butt", "line-join": "round" },
    paint: {
      "line-color": "#fffdf7",
      "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1, 10, 1.6, 14, 2.6],
      "line-opacity": 0.85,
      "line-dasharray": FLOW_DASHES[0],
    },
  });
}

function addCorridorLabelLayers(map: MLMap): void {
  const halo = { "text-color": "#2b2620", "text-halo-color": "#fffdf7", "text-halo-width": 1.5 };
  map.addLayer({
    id: "corridor-km",
    type: "circle",
    source: "corridor-km",
    minzoom: 9,
    paint: { "circle-radius": 3, "circle-color": "#fffdf7", "circle-stroke-color": "#2b2620", "circle-stroke-width": 1.4 },
  });
  map.addLayer({
    id: "corridor-km-label",
    type: "symbol",
    source: "corridor-km",
    minzoom: 9.5,
    layout: {
      "text-field": ["concat", "km ", ["to-string", ["get", "km"]]],
      "text-font": ["Noto Sans Bold"],
      "text-size": 10,
      "text-offset": [0, 1.1],
      "text-anchor": "top",
    },
    paint: halo,
  });
  map.addLayer({
    id: "corridor-places",
    type: "symbol",
    source: "corridor-places",
    minzoom: 7.5,
    layout: {
      "text-field": [
        "format",
        ["get", "name"],
        { "font-scale": 1 },
        ["concat", "\n", ["get", "detail"]],
        { "font-scale": 0.82, "text-color": PALETTE.labelMuted },
      ],
      "text-font": ["Noto Sans Bold"],
      "text-size": 11.5,
      "text-anchor": "bottom",
      "text-offset": [0, -0.8],
      "text-max-width": 10,
    },
    paint: halo,
  });
  map.addLayer({
    id: "profile-point-halo",
    type: "circle",
    source: "profile-point",
    paint: { "circle-radius": 14, "circle-color": "#1f1c17", "circle-opacity": 0.14 },
  });
  map.addLayer({
    id: "profile-point",
    type: "circle",
    source: "profile-point",
    paint: { "circle-radius": 6, "circle-color": "#1f1c17", "circle-stroke-color": "#fffdf7", "circle-stroke-width": 2.5 },
  });
}

export function applyLayerState(map: MLMap, layers: LayerState): void {
  const visibility = (on: boolean) => (on ? "visible" : "none");
  map.setLayoutProperty(HILLSHADE_LAYER, "visibility", visibility(layers.hillshade));
  const strength = (layers.satellite ? 0.3 : 0.75) * layers.hillshadeOpacity;
  // Relief reads weaker at country scale, so it is boosted at low zoom.
  map.setPaintProperty(HILLSHADE_LAYER, "hillshade-exaggeration", [
    "interpolate",
    ["linear"],
    ["zoom"],
    4,
    Math.min(1, strength * 1.45),
    9,
    strength,
  ]);
  map.setLayoutProperty(SATELLITE_LAYER, "visibility", visibility(layers.satellite));
  map.setPaintProperty(SATELLITE_LAYER, "raster-opacity", layers.satelliteOpacity);
  map.setPaintProperty("regions-spotlight", "fill-opacity", layers.satellite ? 0 : 0.14);
  map.setLayoutProperty("network-line", "visibility", visibility(layers.network));
  map.setPaintProperty("network-line", "line-opacity", layers.networkOpacity);
  const conditionColor: ExpressionSpecification = [
    "match",
    ["get", "condition"],
    "Bueno",
    CONDITION_COLORS.Bueno,
    "Regular",
    CONDITION_COLORS.Regular,
    "Malo",
    CONDITION_COLORS.Malo,
    CONDITION_FALLBACK,
  ];
  map.setPaintProperty(
    "network-line",
    "line-color",
    layers.networkColorBy === "condition" ? conditionColor : layers.satellite ? "#fffdf7" : "#6b6255",
  );
  map.setLayoutProperty("rivers-line", "visibility", visibility(layers.rivers));
  map.setPaintProperty("rivers-line", "line-opacity", layers.riversOpacity);
  map.setLayoutProperty("regions-line", "visibility", visibility(layers.regions));
  for (const id of CORRIDOR_LAYERS) map.setLayoutProperty(id, "visibility", visibility(layers.corridor));
  map.setLayoutProperty("corridor-rain", "visibility", visibility(layers.corridor && layers.rain));
}

export function applyRegionHighlight(map: MLMap, regionKey: string | null): void {
  const key = regionKey ?? NO_REGION;
  const isKey: ExpressionSpecification = ["==", ["get", "key"], key];
  map.setFilter("regions-highlight", isKey);
  map.setPaintProperty("regions-line", "line-color", ["case", isKey, "#5b4f40", PALETTE.boundary]);
  map.setPaintProperty("regions-line", "line-width", ["case", isKey, 2, 0.8]);
}

export function setCorridorData(map: MLMap, corridor: CorridorData): void {
  source(map, "corridor")?.setData({
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: corridor.line.map(([lng, lat]) => [lng, lat]) },
  });
  source(map, "corridor-km")?.setData({
    type: "FeatureCollection",
    features: corridor.kmMarkers
      .filter((m) => m.km > 0)
      .map((m) => ({ type: "Feature", properties: { km: m.km }, geometry: { type: "Point", coordinates: [m.lng, m.lat] } })),
  });
  source(map, "corridor-places")?.setData({
    type: "FeatureCollection",
    features: corridor.places.map((p) => ({
      type: "Feature",
      properties: { name: p.name, detail: `${formatElevation(p.elevationM)} · km ${Math.round(p.km)}` },
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    })),
  });
}

/** Colors the corridor by rain level, one line per stretch between sample midpoints. */
export function setCorridorRain(map: MLMap, corridor: CorridorData | null, segments: readonly RainSegment[]): void {
  const features: GeoJSON.Feature[] = corridor
    ? segments.map((segment) => ({
        type: "Feature",
        properties: { color: segment.level.color },
        geometry: { type: "LineString", coordinates: sliceByKm(corridor.line, segment.kmStart, segment.kmEnd) },
      }))
    : [];
  source(map, "corridor-rain")?.setData({ type: "FeatureCollection", features });
}

/** Highlights ±1.2 km of PE-22 around interrupted or restricted alerts that are visible. */
export function setAffectedStretches(
  map: MLMap,
  corridor: CorridorData,
  placed: readonly CorridorAlert[],
  hiddenIds: ReadonlySet<string>,
): void {
  const features: GeoJSON.Feature[] = placed
    .filter(({ alert }) => (alert.roadStatus === "interrumpido" || alert.roadStatus === "restringido") && !hiddenIds.has(alert.id))
    .map(({ alert, km }) => ({
      type: "Feature",
      properties: { color: STATUS_META[alert.roadStatus].color },
      geometry: { type: "LineString", coordinates: sliceByKm(corridor.line, km - AFFECTED_STRETCH_HALF_KM, km + AFFECTED_STRETCH_HALF_KM) },
    }));
  source(map, "corridor-stretches")?.setData({ type: "FeatureCollection", features });
}

export function setProfilePoint(map: MLMap, corridor: CorridorData | null, km: number | null): void {
  const coord = corridor && km !== null ? pointAtKm(corridor.line, km) : null;
  source(map, "profile-point")?.setData(
    coord
      ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: coord } }] }
      : EMPTY,
  );
}

/** Animates the corridor dashes; returns a stop function. */
export function startFlowAnimation(map: MLMap): () => void {
  let step = 0;
  const timer = window.setInterval(() => {
    if (!map.getLayer("corridor-flow") || map.getLayoutProperty("corridor-flow", "visibility") === "none") return;
    step = (step + 1) % FLOW_DASHES.length;
    map.setPaintProperty("corridor-flow", "line-dasharray", FLOW_DASHES[step]);
  }, FLOW_STEP_MS);
  return () => window.clearInterval(timer);
}
