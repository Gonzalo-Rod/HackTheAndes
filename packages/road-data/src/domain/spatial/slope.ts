import type { Position } from "../../contracts/road-geometry.ts";
// Central differences at one DEM pixel on each side; sampling is much coarser than a full DEM mean.
export const DEM_STEP_M = 90;
const EARTH_RADIUS_M = 6_371_008.8;
export function slopeSamplePositions([longitude, latitude]: Position): [
  Position,
  Position,
  Position,
  Position,
] {
  const latitudeStep = ((DEM_STEP_M / EARTH_RADIUS_M) * 180) / Math.PI;
  const longitudeStep = latitudeStep / Math.cos((latitude * Math.PI) / 180);
  return [
    [longitude - longitudeStep, latitude],
    [longitude + longitudeStep, latitude],
    [longitude, latitude - latitudeStep],
    [longitude, latitude + latitudeStep],
  ];
}
export function slopeDegrees(elevationsM: readonly [number, number, number, number]): number {
  if (elevationsM.some((value) => !Number.isFinite(value))) throw new Error("Missing DEM sample");
  const [west, east, south, north] = elevationsM;
  return (
    (Math.atan(Math.hypot((east - west) / (2 * DEM_STEP_M), (north - south) / (2 * DEM_STEP_M))) *
      180) /
    Math.PI
  );
}
