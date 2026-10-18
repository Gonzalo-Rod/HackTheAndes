import type { RoadAlert } from "@/contracts/road-alerts";
import { haversineKm, type LngLat } from "@/domain/geo/measure";

import { stripAccents } from "./parsing";

/** Debris flows lead; landslides and rockfalls are the same hazard family on mountain roads. */
export const MASS_MOVEMENT_KINDS = ["huaico", "deslizamiento", "derrumbe"] as const;
export type MassMovementKind = (typeof MASS_MOVEMENT_KINDS)[number];

const PATTERNS: ReadonlyArray<[MassMovementKind, RegExp]> = [
  ["huaico", /\bhua[iy]cos?\b/],
  ["deslizamiento", /\bdeslizamientos?\b/],
  ["derrumbe", /\b(derrumbes?|caida de rocas|desprendimientos?)\b/],
];

/** SUTRAN has no hazard-type field and community titles start with the reported type. */
export function massMovementKind(alert: Pick<RoadAlert, "title" | "description" | "currentSituation">): MassMovementKind | null {
  const text = stripAccents(`${alert.title} ${alert.description} ${alert.currentSituation}`).toLowerCase();
  return PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

/** Highlight radii around a reported mass movement, in km: visual emphasis, not a modeled impact area. */
export const HIGHLIGHT_RINGS_KM: Record<MassMovementKind, readonly number[]> = {
  huaico: [1.5, 3, 5],
  deslizamiento: [1, 2, 3.5],
  derrumbe: [1, 2, 3.5],
};

/** Mean Earth radius (IUGG), km. */
const EARTH_RADIUS_KM = 6371.0088;

/** Closed geodesic circle as a GeoJSON ring of [lng, lat]. */
export function circleRing(center: LngLat, radiusKm: number, steps = 48): LngLat[] {
  if (!(radiusKm > 0) || steps < 8) throw new RangeError("radiusKm must be positive and steps at least 8");
  const [lng0, lat0] = center.map((d) => (d * Math.PI) / 180);
  const angular = radiusKm / EARTH_RADIUS_KM;
  const ring: LngLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = (2 * Math.PI * (i % steps)) / steps;
    const lat = Math.asin(Math.sin(lat0) * Math.cos(angular) + Math.cos(lat0) * Math.sin(angular) * Math.cos(bearing));
    const lng =
      lng0 + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat0), Math.cos(angular) - Math.sin(lat0) * Math.sin(lat));
    ring.push([(lng * 180) / Math.PI, (lat * 180) / Math.PI]);
  }
  return ring;
}

/** SUTRAN writes "PE-2", the MTC network "PE-02"; compare without leading zeros or spaces. */
export function canonicalRoadCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^(PE-)0+(\d)/, "$1$2");
}

/**
 * Parts of a line inside a geodesic circle, cut at the boundary. Boundary points are found by
 * bisection along each crossing edge, which is accurate to metres for road vertex spacing.
 */
export function clipLineToCircle(line: readonly LngLat[], center: LngLat, radiusKm: number): LngLat[][] {
  const inside = (p: LngLat) => haversineKm(center, p) <= radiusKm;
  const boundary = (from: LngLat, to: LngLat): LngLat => {
    let [a, b] = [from, to];
    for (let i = 0; i < 20; i++) {
      const mid: LngLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (inside(mid) === inside(from)) a = mid;
      else b = mid;
    }
    return a;
  };
  const parts: LngLat[][] = [];
  let current: LngLat[] = [];
  line.forEach((point, index) => {
    const previous = line[index - 1];
    const isIn = inside(point);
    if (previous && isIn !== inside(previous)) {
      const cut = boundary(previous, point);
      if (isIn) current = [cut];
      else {
        current.push(cut);
        if (current.length >= 2) parts.push(current);
        current = [];
      }
    }
    if (isIn) current.push(point);
  });
  if (current.length >= 2) parts.push(current);
  return parts;
}
