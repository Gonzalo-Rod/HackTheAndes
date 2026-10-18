import type { EvidenceGeometry } from "@/contracts/evidence-geometry_christian";
import type { EnvironmentalRecord } from "@/contracts/research_christian";

type Position = [number, number];
export type EvidenceBounds = [number, number, number, number];
// This view window includes PE-22 and the Mantaro references. It is a navigation
// filter, never a mine boundary, road buffer, or claim of intersection with PE-22.
export const CENTRAL_VIEW_BOUNDS: EvidenceBounds = [-77.2, -12.5, -74.9, -11.3];

function officialUrl(value: string | null): boolean {
  if (!value) return false;
  if (!URL.canParse(value)) return false;
  const host = new URL(value).hostname;
  return host === "gob.pe" || host.endsWith(".gob.pe");
}

export function isVerifiedMapRecord(record: EnvironmentalRecord): boolean {
  if (!record.geometry || !officialUrl(record.geometrySourceUrl) || !officialUrl(record.sourceUrl)) return false;
  if (record.kind === "surveillance") return false;
  const start = record.startsAt ?? record.issuedAt;
  if (!start || !Number.isFinite(Date.parse(start))) return false;
  if ((record.kind === "forecast" || record.kind === "inventory") && (!record.startsAt || !record.endsAt)) return false;
  return !record.endsAt || Date.parse(record.endsAt) >= Date.parse(start);
}

export function geometryPositions(geometry: EvidenceGeometry): Position[] {
  if (geometry.type === "Point") return [geometry.coordinates];
  return geometry.type === "Polygon" ? geometry.coordinates.flat() : geometry.coordinates.flat(2);
}

export function evidenceBounds(records: readonly EnvironmentalRecord[], paddingDeg = 0.08): EvidenceBounds | null {
  let bounds: EvidenceBounds | null = null;
  for (const record of records) {
    if (!record.geometry) continue;
    for (const [lng, lat] of geometryPositions(record.geometry)) {
      if (!bounds) bounds = [lng, lat, lng, lat];
      else {
        bounds[0] = Math.min(bounds[0], lng);
        bounds[1] = Math.min(bounds[1], lat);
        bounds[2] = Math.max(bounds[2], lng);
        bounds[3] = Math.max(bounds[3], lat);
      }
    }
  }
  return bounds && [bounds[0] - paddingDeg, bounds[1] - paddingDeg, bounds[2] + paddingDeg, bounds[3] + paddingDeg];
}

const insideBox = ([x, y]: Position, [west, south, east, north]: EvidenceBounds) => x >= west && x <= east && y >= south && y <= north;

function segmentIntersectsBox(a: Position, b: Position, box: EvidenceBounds): boolean {
  let near = 0;
  let far = 1;
  for (const axis of [0, 1] as const) {
    const delta = b[axis] - a[axis];
    if (delta === 0) {
      if (a[axis] < box[axis] || a[axis] > box[axis + 2]) return false;
      continue;
    }
    const first = (box[axis] - a[axis]) / delta;
    const last = (box[axis + 2] - a[axis]) / delta;
    near = Math.max(near, Math.min(first, last));
    far = Math.min(far, Math.max(first, last));
    if (near > far) return false;
  }
  return true;
}

function inRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function polygonIntersectsBox(rings: Position[][], box: EvidenceBounds): boolean {
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) if (segmentIntersectsBox(ring[i - 1], ring[i], box)) return true;
  }
  const corners: Position[] = [
    [box[0], box[1]],
    [box[2], box[1]],
    [box[2], box[3]],
    [box[0], box[3]],
  ];
  return corners.some((point) => inRing(point, rings[0]) && !rings.slice(1).some((hole) => inRing(point, hole)));
}

export function inCentralView(record: EnvironmentalRecord): boolean {
  const geometry = record.geometry;
  if (!geometry) return false;
  if (geometry.type === "Point") return insideBox(geometry.coordinates, CENTRAL_VIEW_BOUNDS);
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => polygonIntersectsBox(polygon, CENTRAL_VIEW_BOUNDS));
}
