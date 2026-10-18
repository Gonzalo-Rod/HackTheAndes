import { z } from "zod";
import type { Pool } from "pg";
import {
  gazetteerSchema,
  type Gazetteer,
  type LocationResult,
} from "../contracts/road-locations.ts";
import { persistGazetteer, type GazetteerImportSummary } from "../db/gazetteer.ts";
import { prepareRoadGeometry } from "./prepare-road-geometry.ts";
import { validateGazetteerSnapshot } from "./prepare-pe22-gazetteer.ts";

export async function importPe22Gazetteer(
  pool: Pool,
  input: unknown,
): Promise<LocationResult<GazetteerImportSummary>> {
  const parsed = gazetteerSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "invalid_snapshot", message: "Gazetteer snapshot failed validation" },
    };
  const snapshot: Gazetteer = parsed.data;
  const result = await pool.query(
    "select source_snapshot from public.geometry_revisions where id=$1",
    [snapshot.geometryRevision],
  );
  if (!result.rows[0])
    return {
      ok: false,
      error: {
        code: "unknown_revision",
        message: "Import the source road revision before its gazetteer",
      },
    };
  const source = z.object({ source_snapshot: z.unknown() }).parse(result.rows[0]);
  const geometry = prepareRoadGeometry(source.source_snapshot);
  if (
    !geometry.ok ||
    geometry.value.corridor.properties.geometryRevision !== snapshot.geometryRevision
  )
    return {
      ok: false,
      error: {
        code: "invalid_geometry",
        message: "Stored source does not reproduce the requested road revision",
      },
    };
  const verified = validateGazetteerSnapshot(geometry.value.segments, snapshot);
  if (!verified.ok) return verified;
  return persistGazetteer(pool, verified.value);
}
