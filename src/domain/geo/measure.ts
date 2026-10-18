// Geodesic helpers on [lng, lat] coordinates and measured polylines ([lng, lat, km]).

export type LngLat = [number, number];
export type MeasuredVertex = [number, number, number];

/** Mean Earth radius (IUGG), km. */
const EARTH_RADIUS_KM = 6371.0088;
const toRad = (degrees: number) => (degrees * Math.PI) / 180;

export function haversineKm(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Initial bearing from a to b in degrees (0 = north, clockwise). */
export function bearingDeg(a: LngLat, b: LngLat): number {
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]));
  const x = Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) - Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export interface Projection {
  km: number;
  distanceKm: number;
  coord: LngLat;
}

/** Nearest point of a measured line to a point (local equirectangular projection per segment). */
export function projectOnMeasuredLine(point: LngLat, line: readonly MeasuredVertex[]): Projection {
  const cosLat = Math.cos(toRad(point[1]));
  let best: Projection = { km: line[0][2], distanceKm: Infinity, coord: [line[0][0], line[0][1]] };
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const dx = (b[0] - a[0]) * cosLat;
    const dy = b[1] - a[1];
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - a[0]) * cosLat * dx + (point[1] - a[1]) * dy) / lengthSq));
    const coord: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const distanceKm = haversineKm(point, coord);
    if (distanceKm < best.distanceKm) best = { km: a[2] + (b[2] - a[2]) * t, distanceKm, coord };
  }
  return best;
}

/** Coordinate at a measured km, clamped to the line ends. */
export function pointAtKm(line: readonly MeasuredVertex[], km: number): LngLat {
  const first = line[0];
  const last = line[line.length - 1];
  if (km <= first[2]) return [first[0], first[1]];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    if (km >= a[2] && km <= b[2]) {
      const t = b[2] === a[2] ? 0 : (km - a[2]) / (b[2] - a[2]);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
  }
  return [last[0], last[1]];
}

/** Bounding box [west, south, east, north] padded by `paddingDeg`; null for no points. */
export function boundsOfPoints(points: readonly LngLat[], paddingDeg: number): [number, number, number, number] | null {
  if (!points.length) return null;
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [Math.min(...lngs) - paddingDeg, Math.min(...lats) - paddingDeg, Math.max(...lngs) + paddingDeg, Math.max(...lats) + paddingDeg];
}

/** Sub-line between two measured kilometers, for highlighting a stretch. */
export function sliceByKm(line: readonly MeasuredVertex[], fromKm: number, toKm: number): LngLat[] {
  const lo = Math.max(line[0][2], Math.min(fromKm, toKm));
  const hi = Math.min(line[line.length - 1][2], Math.max(fromKm, toKm));
  const inner = line.filter((v) => v[2] > lo && v[2] < hi).map((v): LngLat => [v[0], v[1]]);
  return [pointAtKm(line, lo), ...inner, pointAtKm(line, hi)];
}
