import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";

export interface DataSnapshot<T> {
  dataset: string;
  key: string;
  geometryRevision: string;
  capturedAt: string;
  payload: T;
}
const envelopeSchema = z.object({
  dataset: z.string().regex(/^[a-z][a-z0-9_-]{0,60}$/),
  key: z.string().min(1).max(120),
  geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
  capturedAt: z.iso.datetime({ offset: true }),
});
/** Stores complete validated captures atomically. No partial batch becomes the latest dataset. */
export function createDataSnapshotRepository<T>(pool: Pick<Pool, "query">, schema: z.ZodType<T>) {
  return {
    async save(input: DataSnapshot<T>): Promise<{ state: "stored" | "preserved" }> {
      const envelope = envelopeSchema.parse(input);
      const value = schema.parse(input.payload);
      const identity = z
        .object({ geometryRevision: z.string(), capturedAt: z.string() })
        .parse(value);
      if (
        identity.geometryRevision !== envelope.geometryRevision ||
        Date.parse(identity.capturedAt) !== Date.parse(envelope.capturedAt)
      )
        throw new Error("Snapshot envelope does not match validated payload");
      const payload = JSON.stringify(value);
      const hash = createHash("sha256").update(payload).digest("hex");
      const result = await pool.query(
        `insert into public.data_snapshots(dataset,snapshot_key,geometry_revision,captured_at,content_sha256,payload)
        values($1,$2,$3,$4,$5,$6) on conflict(dataset,snapshot_key,geometry_revision)
        do update set captured_at=excluded.captured_at,content_sha256=excluded.content_sha256,payload=excluded.payload
        where data_snapshots.captured_at < excluded.captured_at`,
        [
          envelope.dataset,
          envelope.key,
          envelope.geometryRevision,
          envelope.capturedAt,
          hash,
          payload,
        ],
      );
      return { state: result.rowCount === 1 ? "stored" : "preserved" };
    },
    async read(dataset: string, geometryRevision: string, key?: string): Promise<T | null> {
      const result = await pool.query(
        `select payload from public.data_snapshots where dataset=$1 and geometry_revision=$2
        and ($3::text is null or snapshot_key=$3) order by captured_at desc limit 1`,
        [dataset, geometryRevision, key ?? null],
      );
      return result.rows[0] ? schema.parse(result.rows[0].payload) : null;
    },
  };
}
