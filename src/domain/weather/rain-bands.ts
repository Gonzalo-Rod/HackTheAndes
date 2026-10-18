import type { LngLat } from "@/domain/geo/measure";

import type { RainValue } from "./national-grid";
import { RAIN_LEVELS, rainPeakMm, type RainLevelMeta } from "./rain";

// Turns the regular display grid into filled rain bands whose edges follow the interpolated
// field, so rain reads as contoured regions instead of square blocks. The relief itself comes
// from the map's hillshade, which is drawn over these bands.

interface Vertex {
  lng: number;
  lat: number;
  mm: number;
}

interface GridVertex extends Vertex {
  /** False for padding added around the data; a square made only of padding is never drawn. */
  real: boolean;
}

export interface RainBand {
  level: RainLevelMeta;
  /** Convex pieces that tile the band; each is a single closed ring. */
  polygons: LngLat[][][];
}

/** Four decimals (~11 m) is far below the ~28 km display cell and keeps the payload small. */
const COORD_DECIMALS = 4;
const round = (value: number) => Number(value.toFixed(COORD_DECIMALS));
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

type Offsets = readonly (readonly [number, number])[];
const SIDE_OFFSETS: Offsets = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const CORNER_OFFSETS: Offsets = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const key = (i: number, j: number) => `${i},${j}`;

/** Sutherland–Hodgman against `mm >= threshold` (keepAbove) or `mm < threshold`, interpolating linearly. */
function clip(polygon: readonly Vertex[], threshold: number, keepAbove: boolean): Vertex[] {
  const inside = (v: Vertex) => (keepAbove ? v.mm >= threshold : v.mm < threshold);
  const result: Vertex[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    if (inside(current)) result.push(current);
    if (inside(current) !== inside(next)) {
      const t = (threshold - current.mm) / (next.mm - current.mm);
      result.push({
        lng: current.lng + t * (next.lng - current.lng),
        lat: current.lat + t * (next.lat - current.lat),
        mm: threshold,
      });
    }
  }
  return result;
}

function toRing(polygon: readonly Vertex[]): LngLat[] | null {
  const ring: LngLat[] = [];
  for (const v of polygon) {
    const point: LngLat = [round(v.lng), round(v.lat)];
    const last = ring[ring.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) ring.push(point);
  }
  if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
  if (ring.length < 3) return null;
  return [...ring, ring[0]];
}

/**
 * Pads every empty grid position next to a cell, so the bands cover each cell's whole footprint
 * and fill isolated holes instead of stopping at the cell centers. A pad takes the mean value of
 * its side neighbours (corner neighbours when it has none) and sits halfway toward them: next to a
 * lone cell that is exactly the footprint's corner or edge midpoint, so nothing reaches past it.
 */
function padGrid(grid: Map<string, GridVertex>, origin: LngLat, stepDeg: number): void {
  const pads = new Map<string, GridVertex>();
  for (const cellKey of grid.keys()) {
    const [i, j] = cellKey.split(",").map(Number);
    for (const [di, dj] of [...SIDE_OFFSETS, ...CORNER_OFFSETS]) {
      const [pi, pj] = [i + di, j + dj];
      const padKey = key(pi, pj);
      if (grid.has(padKey) || pads.has(padKey)) continue;
      const near = (offsets: Offsets) => offsets.flatMap(([oi, oj]) => grid.get(key(pi + oi, pj + oj)) ?? []);
      const sides = near(SIDE_OFFSETS);
      const neighbours = sides.length ? sides : near(CORNER_OFFSETS);
      pads.set(padKey, {
        lng: (origin[0] + pi * stepDeg + mean(neighbours.map((v) => v.lng))) / 2,
        lat: (origin[1] + pj * stepDeg + mean(neighbours.map((v) => v.lat))) / 2,
        mm: mean(neighbours.map((v) => v.mm)),
        real: false,
      });
    }
  }
  for (const [padKey, pad] of pads) grid.set(padKey, pad);
}

/**
 * Splits each grid square into four triangles around its mean center, where linear interpolation
 * is exact, and clips them into one band per rain level. Padding makes the bands cover every
 * cell's full footprint without gaps; dry rain ("seca") is not drawn at all.
 */
export function rainBands(cells: readonly RainValue[], stepDeg: number, levels: readonly RainLevelMeta[] = RAIN_LEVELS): RainBand[] {
  if (!(stepDeg > 0)) throw new RangeError("stepDeg must be positive");
  if (!cells.length) return [];
  const origin: LngLat = [Math.min(...cells.map((c) => c.lng)), Math.min(...cells.map((c) => c.lat))];
  const grid = new Map<string, GridVertex>();
  for (const cell of cells) {
    const i = Math.round((cell.lng - origin[0]) / stepDeg);
    const j = Math.round((cell.lat - origin[1]) / stepDeg);
    grid.set(key(i, j), { lng: cell.lng, lat: cell.lat, mm: rainPeakMm(cell), real: true });
  }
  padGrid(grid, origin, stepDeg);

  const sorted = [...levels].sort((a, b) => a.minMm - b.minMm);
  const bands = sorted.slice(1).map((level, index) => ({
    level,
    upperMm: sorted[index + 2]?.minMm ?? Infinity,
    polygons: [] as LngLat[][][],
  }));

  for (const cellKey of grid.keys()) {
    const [i, j] = cellKey.split(",").map(Number);
    const corners = [key(i, j), key(i + 1, j), key(i + 1, j + 1), key(i, j + 1)].map((k) => grid.get(k));
    if (corners.some((corner) => !corner)) continue;
    const square = corners as GridVertex[]; // every corner was checked present just above
    if (!square.some((corner) => corner.real)) continue;
    const center: Vertex = {
      lng: mean(square.map((v) => v.lng)),
      lat: mean(square.map((v) => v.lat)),
      mm: mean(square.map((v) => v.mm)),
    };
    for (let k = 0; k < 4; k++) {
      const triangle = [center, square[k], square[(k + 1) % 4]];
      for (const band of bands) {
        let piece = clip(triangle, band.level.minMm, true);
        if (piece.length >= 3 && band.upperMm !== Infinity) piece = clip(piece, band.upperMm, false);
        const ring = piece.length >= 3 ? toRing(piece) : null;
        if (ring) band.polygons.push([ring]);
      }
    }
  }
  return bands.filter((band) => band.polygons.length).map(({ level, polygons }) => ({ level, polygons }));
}

/** The display cell whose center is nearest a point, for tooltips over the contoured bands. */
export function nearestRainCell<T extends RainValue>(cells: readonly T[], point: LngLat): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const cell of cells) {
    const distance = (cell.lng - point[0]) ** 2 + (cell.lat - point[1]) ** 2;
    if (distance < bestDistance) {
      best = cell;
      bestDistance = distance;
    }
  }
  return best;
}
