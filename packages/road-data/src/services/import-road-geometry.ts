import type { Pool } from "pg";
import { roadNetworkSnapshotSchema } from "../contracts/road-geometry.ts";
import { prepareRoadGeometry } from "./prepare-road-geometry.ts";
import { persistRoadGeometry } from "../db/import-geometry.ts";

export async function importRoadGeometry(pool: Pool, input: unknown) {
  const snapshot = roadNetworkSnapshotSchema.parse(input);
  const prepared = prepareRoadGeometry(snapshot);
  if (!prepared.ok) return prepared;
  return { ok: true as const, value: await persistRoadGeometry(pool, snapshot, prepared.value) };
}
