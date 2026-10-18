import type { LngLat } from "./measure";

// Douglas–Peucker simplification in degrees (planar). Adequate for display-scale layers.

function squaredSegmentDistance(p: LngLat, a: LngLat, b: LngLat): number {
  let [x, y] = a;
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) [x, y] = b;
    else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

export function simplifyLine(points: readonly LngLat[], toleranceDeg: number): LngLat[] {
  if (points.length <= 2) return [...points];
  const toleranceSq = toleranceDeg * toleranceDeg;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop() as [number, number];
    let maxSq = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const sq = squaredSegmentDistance(points[i], points[first], points[last]);
      if (sq > maxSq) {
        maxSq = sq;
        index = i;
      }
    }
    if (index > 0 && maxSq > toleranceSq) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

export function roundCoord([lng, lat]: LngLat, digits: number): LngLat {
  const factor = 10 ** digits;
  return [Math.round(lng * factor) / factor, Math.round(lat * factor) / factor];
}

/** Removes consecutive duplicate points (common after rounding). */
export function dedupeConsecutive(points: readonly LngLat[]): LngLat[] {
  return points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
}
