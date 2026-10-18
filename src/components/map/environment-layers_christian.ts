import type { ExpressionSpecification, GeoJSONSource, Map as MLMap, MapMouseEvent } from "maplibre-gl";

import type { EnvironmentalRecord } from "@/contracts/research_christian";
import { evidenceTiming, type EvidencePoint } from "@/domain/research/evidence-state_christian";

const AREA_SOURCE = "verified-environment-areas";
const DISPLAY_SOURCE = "verified-environment-display-points";
const AREA_FILL = "verified-environment-fill";
const AREA_LINE = "verified-environment-outline";
const CLUSTER_COUNT = "verified-zone-counts";
const POINT_LABELS = "verified-zone-point-icons";
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const AREA_COLOR: ExpressionSpecification = ["match", ["get", "severity"], "orange", "#c6a967", "red", "#bd7771", "#b7ad8e"];
const POINT_CLUSTER_RADIUS_PX = 40;

type LngLat = [number, number];
type ScreenPoint = { x: number; y: number };

const pointsByMap = new WeakMap<MLMap, GeoJSON.Feature<GeoJSON.Point>[]>();

function distanceSquared(a: ScreenPoint, b: ScreenPoint): number {
  const horizontal = a.x - b.x;
  const vertical = a.y - b.y;
  return horizontal * horizontal + vertical * vertical;
}

/** Groups nearby critical-zone symbols in screen space and anchors each count to a source point. */
export function groupDisplayPoints(
  points: GeoJSON.Feature<GeoJSON.Point>[],
  project: (coordinates: LngLat) => ScreenPoint,
  radiusPx = POINT_CLUSTER_RADIUS_PX,
): GeoJSON.Feature<GeoJSON.Point>[] {
  const critical = points.filter((feature) => feature.properties?.category === "critical-zone");
  const references = points.filter((feature) => feature.properties?.category !== "critical-zone");
  const projected = critical.map((feature) => ({
    feature,
    screen: project([feature.geometry.coordinates[0], feature.geometry.coordinates[1]]),
  }));
  const assigned = new Set<number>();
  const displayed: GeoJSON.Feature<GeoJSON.Point>[] = [];
  const radiusSquared = radiusPx * radiusPx;

  for (let index = 0; index < projected.length; index += 1) {
    if (assigned.has(index)) continue;
    const first = projected[index];
    const members = [first];
    assigned.add(index);

    for (let candidateIndex = index + 1; candidateIndex < projected.length; candidateIndex += 1) {
      if (assigned.has(candidateIndex)) continue;
      const candidate = projected[candidateIndex];
      if (distanceSquared(first.screen, candidate.screen) > radiusSquared) continue;
      assigned.add(candidateIndex);
      members.push(candidate);
    }

    if (members.length === 1) {
      displayed.push(first.feature);
      continue;
    }

    const center = members.reduce(
      (sum, member) => {
        return { x: sum.x + member.screen.x / members.length, y: sum.y + member.screen.y / members.length };
      },
      { x: 0, y: 0 },
    );
    const anchor = members.reduce((best, member) => {
      return distanceSquared(member.screen, center) < distanceSquared(best.screen, center) ? member : best;
    });
    const recordCount = members.reduce((count, member) => {
      const memberCount = member.feature.properties?.recordCount;
      return count + (typeof memberCount === "number" ? memberCount : 1);
    }, 0);
    const memberRecordIds = members.flatMap((member) => {
      const recordIds = member.feature.properties?.recordIds;
      if (Array.isArray(recordIds)) return recordIds.filter((id): id is string => typeof id === "string");
      const recordId = member.feature.properties?.recordId;
      return typeof recordId === "string" ? [recordId] : [];
    });

    displayed.push({
      type: "Feature",
      id: `cluster:${members.map((member) => String(member.feature.id ?? member.feature.properties?.recordId ?? "point")).join("|")}`,
      geometry: anchor.feature.geometry,
      properties: {
        category: "critical-zone",
        clusterCount: members.length,
        recordCount,
        selected: members.some((member) => member.feature.properties?.selected === true),
        memberRecordIds,
      },
    });
  }

  return [...displayed, ...references];
}

function syncClusterDisplay(map: MLMap): void {
  const output = map.getSource(DISPLAY_SOURCE) as GeoJSONSource | undefined;
  const points = pointsByMap.get(map);
  if (!output || !points) return;
  const features = groupDisplayPoints(points, (coordinates) => {
    const screen = map.project(coordinates);
    return { x: screen.x, y: screen.y };
  });
  output.setData({
    type: "FeatureCollection",
    features,
  });
}

export function addEnvironmentLayers(map: MLMap): void {
  map.addSource(AREA_SOURCE, { type: "geojson", data: EMPTY });
  map.addSource(DISPLAY_SOURCE, { type: "geojson", data: EMPTY });
  map.addLayer({
    id: AREA_FILL,
    type: "fill",
    source: AREA_SOURCE,
    paint: {
      "fill-color": AREA_COLOR,
      "fill-opacity": ["case", ["get", "expired"], 0.02, ["get", "selected"], 0.2, 0.065],
    },
  });
  map.addLayer({
    id: AREA_LINE,
    type: "line",
    source: AREA_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["case", ["get", "selected"], "#f7f3e9", "#52616a"],
      "line-width": ["case", ["get", "selected"], 1.8, 0.65],
      "line-opacity": ["case", ["get", "expired"], 0.08, ["get", "selected"], 0.9, 0.28],
    },
  });
  map.addLayer({
    id: CLUSTER_COUNT,
    type: "symbol",
    source: DISPLAY_SOURCE,
    filter: ["has", "clusterCount"],
    layout: {
      "text-field": ["concat", "!", ["to-string", ["get", "recordCount"]]],
      "text-size": 12.5,
      "text-font": ["Noto Sans Bold"],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "text-pitch-alignment": "viewport",
    },
    paint: {
      "text-color": ["case", ["get", "selected"], "#ffffff", "#f5e6b5"],
      "text-halo-color": "#1a2a30",
      "text-halo-width": 2.2,
      "text-halo-blur": 0.2,
    },
  });
  map.addLayer({
    id: POINT_LABELS,
    type: "symbol",
    source: DISPLAY_SOURCE,
    filter: ["!", ["has", "clusterCount"]],
    layout: {
      "text-field": [
        "case",
        ["==", ["get", "category"], "critical-zone"],
        "!",
        [">", ["get", "recordCount"], 1],
        ["concat", "i", ["to-string", ["get", "recordCount"]]],
        "i",
      ],
      "text-size": 11,
      "text-font": ["Noto Sans Bold"],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "text-pitch-alignment": "viewport",
    },
    paint: {
      "text-color": ["case", ["get", "selected"], "#ffffff", ["==", ["get", "category"], "critical-zone"], "#f5e6b5", "#bfe5ed"],
      "text-halo-color": "#1a2a30",
      "text-halo-width": 2.2,
      "text-halo-blur": 0.2,
    },
  });
  for (const layer of [AREA_FILL, CLUSTER_COUNT, POINT_LABELS]) {
    map.on("mouseenter", layer, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", layer, () => {
      map.getCanvas().style.cursor = "";
    });
  }
  map.on("moveend", () => syncClusterDisplay(map));
  map.on("resize", () => syncClusterDisplay(map));
  map.on("remove", () => pointsByMap.delete(map));
}

export function syncEnvironmentLayers(
  map: MLMap,
  areas: EnvironmentalRecord[],
  points: EvidencePoint[],
  selectedId: string | null,
  nowMs: number,
): void {
  const areaSource = map.getSource(AREA_SOURCE) as GeoJSONSource | undefined;
  const pointSource = map.getSource(DISPLAY_SOURCE) as GeoJSONSource | undefined;
  if (!areaSource || !pointSource) return;
  const features: GeoJSON.Feature[] = areas.flatMap((record) =>
    record.geometry?.type === "Polygon" || record.geometry?.type === "MultiPolygon"
      ? [
          {
            type: "Feature",
            id: record.id,
            geometry: record.geometry,
            properties: {
              recordId: record.id,
              selected: record.id === selectedId,
              expired: evidenceTiming(record, nowMs).state === "expired",
              severity: record.facts.find((fact) => fact.label === "Nivel del aviso")?.value === "Naranja" ? "orange" : "yellow",
            },
          },
        ]
      : [],
  );
  areaSource.setData({ type: "FeatureCollection", features });
  pointsByMap.set(
    map,
    points.map((point) => ({
      type: "Feature",
      id: point.id,
      geometry: { type: "Point", coordinates: point.coordinates },
      properties: {
        recordId: point.recordIds.includes(selectedId ?? "") ? selectedId : point.recordIds[0],
        recordIds: point.recordIds,
        recordCount: point.recordIds.length,
        selected: point.recordIds.includes(selectedId ?? ""),
        category: point.category,
      },
    })),
  );
  syncClusterDisplay(map);
}

export function selectEnvironmentFeature(map: MLMap, event: MapMouseEvent, onSelect: (id: string) => void): boolean {
  const layers = [CLUSTER_COUNT, POINT_LABELS, AREA_FILL].filter((id) => map.getLayer(id));
  if (!layers.length) return false;
  const hits = map.queryRenderedFeatures(event.point, { layers });
  const feature = hits[0];
  if (!feature) return false;
  const clusterCount: unknown = feature.properties?.clusterCount;
  if (typeof clusterCount === "number" && feature.geometry.type === "Point") {
    const coordinates = feature.geometry.coordinates;
    if (map.getZoom() >= 15) {
      const memberRecordIds: unknown = feature.properties?.memberRecordIds;
      const firstRecordId = Array.isArray(memberRecordIds) ? memberRecordIds.find((id): id is string => typeof id === "string") : undefined;
      if (firstRecordId) onSelect(firstRecordId);
      return true;
    }
    map.easeTo({ center: [coordinates[0], coordinates[1]], zoom: Math.min(map.getZoom() + 2, 15), duration: 650 });
    return true;
  }
  const id: unknown = feature.properties?.recordId;
  if (typeof id !== "string") return false;
  onSelect(id);
  return true;
}
