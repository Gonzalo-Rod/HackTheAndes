import type { Pool } from "pg";
import { elevationSnapshotSchema, type ElevationResult } from "../contracts/road-elevation.ts";
import { persistSegmentElevations, type ElevationImportSummary } from "../db/segment-elevations.ts";

export async function importPe22Elevation(
  pool: Pool,
  input: unknown,
): Promise<ElevationResult<ElevationImportSummary>> {
  const parsed = elevationSnapshotSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "invalid_snapshot", message: "The elevation snapshot failed validation" },
    };
  return persistSegmentElevations(pool, parsed.data);
}
