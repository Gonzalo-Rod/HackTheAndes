import type { Pool } from "pg";
import { roadNetworkSnapshotSchema } from "../contracts/road-geometry.ts";
import { preparePe22Geometry } from "./prepare-pe22.ts";
import { persistPe22Geometry } from "../db/import-geometry.ts";

export async function importPe22Geometry(pool: Pool, input: unknown) {
  const snapshot = roadNetworkSnapshotSchema.parse(input);
  const prepared = preparePe22Geometry(snapshot);
  if (!prepared.ok) return prepared;
  return { ok: true as const, value: await persistPe22Geometry(pool, snapshot, prepared.value) };
}
