import type { SegmentCollection } from "@/contracts/platform";
import type { ExposureLayer } from "@/contracts/exposure";
import { boundsOfPoints } from "@/domain/geo/measure";
import type { ForecastWindow } from "./forecast-events";
export interface ForecastMapData {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    id: string;
    geometry: { type: "LineString"; coordinates: [number, number][] };
    properties: { eventId: string; category: string };
  }[];
}
export function projectForecastMap(view: ExposureLayer | null, segments: SegmentCollection | null, window: ForecastWindow | null) {
  const data: ForecastMapData = { type: "FeatureCollection", features: [] };
  const bounds: Record<string, [number, number, number, number]> = {};
  if (!window || !view) return { data, bounds, message: null };
  if (!segments || segments.geometryRevision !== view.data.geometryRevision)
    return { data, bounds, message: "Geometría del pronóstico no disponible o incompatible; no se dibujan ubicaciones supuestas." };
  const geometries = new Map(segments.features.map((s) => [s.id, s]));
  const eventBySegment = new Map(window.events.flatMap((event) => event.segmentIds.map((id) => [id, event] as const)));
  const index = view.data.segments[0].windows.sixHourly.findIndex((w) => w.validFrom === window.validFrom);
  let missing = 0;
  for (const segment of view.data.segments) {
    const geometry = geometries.get(segment.segmentId);
    if (!geometry) {
      missing++;
      continue;
    }
    const event = eventBySegment.get(segment.segmentId);
    const category = segment.windows.sixHourly[index]?.category ?? "unknown";
    data.features.push({
      type: "Feature",
      id: segment.segmentId,
      geometry: geometry.geometry,
      properties: { eventId: event?.id ?? "", category },
    });
  }
  for (const event of window.events) {
    if (event.segmentIds.some((id) => !geometries.has(id))) continue;
    const points = event.segmentIds.flatMap((id) => geometries.get(id)?.geometry.coordinates ?? []);
    const box = boundsOfPoints(points, 0.015);
    if (box) bounds[event.id] = box;
  }
  return { data, bounds, message: missing ? `${missing} tramos sin geometría disponible; ubicaciones omitidas.` : null };
}

export interface ForecastAnchor {
  eventId: string;
  category: string;
  position: [number, number];
}

/**
 * One label point per forecast event: the middle vertex of its stretch, ordered as the segments
 * appear (the projection keeps road order). Segments without an event are not labeled.
 */
export function forecastEventAnchors(data: ForecastMapData): ForecastAnchor[] {
  const byEvent = new Map<string, { category: string; points: [number, number][] }>();
  for (const feature of data.features) {
    const { eventId, category } = feature.properties;
    if (!eventId) continue;
    const entry = byEvent.get(eventId) ?? { category, points: [] };
    entry.points.push(...feature.geometry.coordinates);
    byEvent.set(eventId, entry);
  }
  return [...byEvent].flatMap(([eventId, { category, points }]) => {
    const position = points[Math.floor(points.length / 2)];
    return position ? [{ eventId, category, position }] : [];
  });
}
