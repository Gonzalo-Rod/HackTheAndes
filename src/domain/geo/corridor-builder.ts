import { haversineKm, type LngLat, type MeasuredVertex } from "./measure";

// Builds a single measured line from official road segments (each with a km range and
// possibly several unordered parts), as published in the MTC network served by SUTRAN.

export interface RoadSegmentInput {
  kmStart: number;
  kmEnd: number;
  parts: LngLat[][];
}

/** Joins the parts of one segment into a polyline by repeatedly linking the nearest endpoints. */
export function mergeParts(parts: readonly LngLat[][]): LngLat[] {
  if (!parts.length) return [];
  const remaining = parts.slice(1).map((part) => [...part]);
  let chain = [...parts[0]];
  while (remaining.length) {
    let best = { distanceKm: Infinity, index: 0, joined: chain };
    remaining.forEach((part, index) => {
      const reversed = [...part].reverse();
      const options: [number, LngLat[]][] = [
        [haversineKm(chain[chain.length - 1], part[0]), [...chain, ...part]],
        [haversineKm(chain[chain.length - 1], part[part.length - 1]), [...chain, ...reversed]],
        [haversineKm(chain[0], part[part.length - 1]), [...part, ...chain]],
        [haversineKm(chain[0], part[0]), [...reversed, ...chain]],
      ];
      for (const [distanceKm, joined] of options) {
        if (distanceKm < best.distanceKm) best = { distanceKm, index, joined };
      }
    });
    chain = best.joined;
    remaining.splice(best.index, 1);
  }
  return chain;
}

function endpointDistance(from: LngLat, line: readonly LngLat[]): number {
  return Math.min(haversineKm(from, line[0]), haversineKm(from, line[line.length - 1]));
}

/**
 * Orders segments by km, orients each to continue from the previous one, and measures
 * every vertex by interpolating the segment's official km range along its length.
 */
export function buildMeasuredCorridor(segments: readonly RoadSegmentInput[]): { line: MeasuredVertex[]; maxGapKm: number } {
  const sorted = [...segments].sort((a, b) => a.kmStart - b.kmStart);
  const lines = sorted.map((segment) => mergeParts(segment.parts)).filter((line) => line.length >= 2);
  if (lines.length !== sorted.length || !lines.length) return { line: [], maxGapKm: Infinity };

  if (lines.length > 1) {
    const [first, second] = lines;
    if (endpointDistance(first[0], second) < endpointDistance(first[first.length - 1], second)) first.reverse();
  }
  for (let i = 1; i < lines.length; i++) {
    const previousEnd = lines[i - 1][lines[i - 1].length - 1];
    const line = lines[i];
    if (haversineKm(previousEnd, line[line.length - 1]) < haversineKm(previousEnd, line[0])) line.reverse();
  }

  const measured: MeasuredVertex[] = [];
  let maxGapKm = 0;
  sorted.forEach((segment, i) => {
    const line = lines[i];
    if (i > 0) maxGapKm = Math.max(maxGapKm, haversineKm(lines[i - 1][lines[i - 1].length - 1], line[0]));
    const cumulative = [0];
    for (let j = 1; j < line.length; j++) cumulative.push(cumulative[j - 1] + haversineKm(line[j - 1], line[j]));
    const lengthKm = cumulative[cumulative.length - 1] || 1;
    line.forEach((coord, j) => {
      measured.push([coord[0], coord[1], segment.kmStart + (segment.kmEnd - segment.kmStart) * (cumulative[j] / lengthKm)]);
    });
  });
  return { line: measured, maxGapKm };
}
