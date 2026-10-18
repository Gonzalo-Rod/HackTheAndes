import type { LngLat } from "@/domain/geo/measure";

type Ring = readonly LngLat[];
export type PolygonRings = readonly Ring[];

/** Ray casting on [lng, lat]; points exactly on an edge may fall either way, which a coarse grid tolerates. */
function inRing(point: LngLat, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and outside every hole. */
export function inPolygon(point: LngLat, polygon: PolygonRings): boolean {
  const [outer, ...holes] = polygon;
  return outer !== undefined && inRing(point, outer) && !holes.some((hole) => inRing(point, hole));
}

/** Centers of a regular grid of `stepDeg` cells over `bbox` that fall inside any polygon. */
export function gridCentersInside(
  polygons: readonly PolygonRings[],
  bbox: readonly [number, number, number, number],
  stepDeg: number,
): LngLat[] {
  if (!(stepDeg > 0)) throw new RangeError("stepDeg must be positive");
  const [west, south, east, north] = bbox;
  const centers: LngLat[] = [];
  for (let lng = west + stepDeg / 2; lng < east; lng += stepDeg)
    for (let lat = south + stepDeg / 2; lat < north; lat += stepDeg) {
      const point: LngLat = [Number(lng.toFixed(4)), Number(lat.toFixed(4))];
      if (polygons.some((polygon) => inPolygon(point, polygon))) centers.push(point);
    }
  return centers;
}

export interface RainValue {
  lng: number;
  lat: number;
  pastMm: number;
  nextMm: number;
}

/**
 * Bilinear interpolation of coarse model cells onto finer display centers, for a smoother map
 * without more provider calls. Missing neighbours are dropped and the remaining weights
 * renormalized; a display center with no coarse neighbour at all is left out, never set to dry.
 */
export function interpolateRain(coarse: readonly RainValue[], coarseStepDeg: number, fineCenters: readonly LngLat[]): RainValue[] {
  if (!coarse.length) return [];
  const originLng = Math.min(...coarse.map((c) => c.lng));
  const originLat = Math.min(...coarse.map((c) => c.lat));
  const index = (lng: number, lat: number) =>
    [Math.round((lng - originLng) / coarseStepDeg), Math.round((lat - originLat) / coarseStepDeg)] as const;
  const byIndex = new Map(coarse.map((cell) => [index(cell.lng, cell.lat).join(","), cell]));
  const result: RainValue[] = [];
  for (const [lng, lat] of fineCenters) {
    const fx = (lng - originLng) / coarseStepDeg;
    const fy = (lat - originLat) / coarseStepDeg;
    const i0 = Math.floor(fx);
    const j0 = Math.floor(fy);
    const tx = fx - i0;
    const ty = fy - j0;
    let weight = 0;
    let pastMm = 0;
    let nextMm = 0;
    for (const [di, dj, w] of [
      [0, 0, (1 - tx) * (1 - ty)],
      [1, 0, tx * (1 - ty)],
      [0, 1, (1 - tx) * ty],
      [1, 1, tx * ty],
    ] as const) {
      const cell = byIndex.get(`${i0 + di},${j0 + dj}`);
      if (!cell || w <= 0) continue;
      weight += w;
      pastMm += w * cell.pastMm;
      nextMm += w * cell.nextMm;
    }
    if (weight > 0) result.push({ lng, lat, pastMm: pastMm / weight, nextMm: nextMm / weight });
  }
  return result;
}
