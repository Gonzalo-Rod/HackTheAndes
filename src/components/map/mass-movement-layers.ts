import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import type { RoadAlert } from "@/contracts/road-alerts";
import type { RoadNetwork } from "@/contracts/road-network";
import { canonicalRoadCode, circleRing, clipLineToCircle, HIGHLIGHT_RINGS_KM, massMovementKind } from "@/domain/road-alerts/mass-movement";

const ROADS = "mass-movement-roads";
/** Degrees of padding for a cheap bounding-box test before exact clipping (~5.5 km per 0.05°). */
const BBOX_PADDING_DEG = 0.06;

const SOURCE = "mass-movement-zones";
const FILL = "mass-movement-fill";
const OUTLINE = "mass-movement-outline";

/**
 * Concentric rings around reported huaicos and landslides. Fill layers drape over the 3D terrain,
 * so the surrounding slopes are tinted; stacked rings darken toward the reported point.
 */
export function addMassMovementLayers(map: MLMap) {
  map.addSource(SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: FILL,
    type: "fill",
    source: SOURCE,
    paint: {
      "fill-color": [
        "match",
        ["get", "kind"],
        "huaico",
        ["match", ["get", "band"], 0, "#c1121f", 1, "#f3722c", "#f9c74f"],
        ["match", ["get", "band"], 0, "#d95d39", 1, "#f4a259", "#f6d186"],
      ],
      "fill-opacity": ["match", ["get", "band"], 0, 0.34, 1, 0.24, 0.16],
    },
  });
  map.addSource(ROADS, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "mass-movement-road-casing",
    type: "line",
    source: ROADS,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#fffdf7", "line-width": ["case", ["get", "own"], 10, 7], "line-opacity": 0.95 },
  });
  map.addLayer({
    id: "mass-movement-road",
    type: "line",
    source: ROADS,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["match", ["get", "kind"], "huaico", "#c1121f", "#e2582d"],
      "line-width": ["case", ["get", "own"], 6, 3.5],
    },
  });
  map.addLayer({
    id: OUTLINE,
    type: "line",
    source: SOURCE,
    filter: ["==", ["get", "outer"], true],
    paint: {
      "line-color": ["match", ["get", "kind"], "huaico", "#9d0208", "#b5502c"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1, 12, 2.5],
      "line-dasharray": [2, 1.5],
      "line-opacity": 0.9,
    },
  });
}

/** Network roads inside each zone; the alert's own road is drawn thicker than crossing roads. */
function zoneRoads(alerts: readonly RoadAlert[], network: RoadNetwork | null) {
  if (!network) return [];
  return alerts.flatMap((alert) => {
    const kind = massMovementKind(alert);
    if (!kind) return [];
    const radiusKm = Math.max(...HIGHLIGHT_RINGS_KM[kind]);
    const own = canonicalRoadCode(alert.roadCode);
    const center: [number, number] = [alert.lng, alert.lat];
    return network.features.flatMap((feature) => {
      const coords = feature.geometry.coordinates;
      const near = coords.some(
        ([lng, lat]) => Math.abs(lng - alert.lng) < BBOX_PADDING_DEG && Math.abs(lat - alert.lat) < BBOX_PADDING_DEG,
      );
      if (!near) return [];
      return clipLineToCircle(coords, center, radiusKm).map((part) => ({
        type: "Feature" as const,
        geometry: { type: "LineString" as const, coordinates: part },
        properties: { kind, own: own !== "" && canonicalRoadCode(feature.properties.road) === own },
      }));
    });
  });
}

export function setMassMovementData(
  map: MLMap,
  alerts: readonly RoadAlert[],
  hiddenIds: ReadonlySet<string>,
  visible: boolean,
  network: RoadNetwork | null,
) {
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined;
  if (!source) return;
  const shown = visible ? alerts.filter((alert) => !hiddenIds.has(alert.id)) : [];
  (map.getSource(ROADS) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: zoneRoads(shown, network) });
  const features = visible
    ? alerts.flatMap((alert) => {
        const kind = massMovementKind(alert);
        if (!kind || hiddenIds.has(alert.id)) return [];
        const radii = HIGHLIGHT_RINGS_KM[kind];
        // Largest first, so smaller, darker rings draw on top.
        return [...radii].reverse().map((radiusKm, reversedIndex) => ({
          type: "Feature" as const,
          geometry: { type: "Polygon" as const, coordinates: [circleRing([alert.lng, alert.lat], radiusKm)] },
          properties: { kind, band: radii.length - 1 - reversedIndex, outer: reversedIndex === 0 },
        }));
      })
    : [];
  source.setData({ type: "FeatureCollection", features });
}
