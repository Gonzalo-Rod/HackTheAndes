import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  storedOfficialAlertSchema,
  OfficialAlertRepositoryError,
  type OfficialAlertRepository,
} from "../contracts/ingestion.ts";
import {
  officialRoadAlertSchema,
  officialAlertHistoryEntrySchema,
} from "../contracts/road-alerts.ts";
import { sourceHistoryKey } from "../domain/road-data/official-alert-update.ts";

const identitySchema = z.uuid();
const stateRowsSchema = z.array(z.object({ state: storedOfficialAlertSchema })).max(1);

function infrastructureFailure(error: unknown): boolean {
  const parsed = z.object({ code: z.string() }).safeParse(error);
  if (!parsed.success) return false;
  const code = parsed.data.code;
  return (
    code.startsWith("08") ||
    [
      "53300",
      "57P01",
      "57P02",
      "57P03",
      "57014",
      "40001",
      "40P01",
      "28P01",
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EAI_AGAIN",
    ].includes(code)
  );
}

async function readState(db: Pick<Pool, "query"> | Pick<PoolClient, "query">, id: string) {
  const result = await db.query(
    "select state from private.official_alerts where source = 'sutran' and external_id = $1",
    [id],
  );
  const parsed = stateRowsSchema.safeParse(result.rows);
  if (!parsed.success) throw new OfficialAlertRepositoryError();
  const state = parsed.data[0]?.state ?? null;
  if (state && state.alert.externalId !== id) throw new OfficialAlertRepositoryError();
  return state;
}

export function createPostgresOfficialAlertRepository(pool: Pool): OfficialAlertRepository {
  return {
    async findById(externalId) {
      const id = identitySchema.parse(externalId);
      try {
        return await readState(pool, id);
      } catch (error) {
        if (infrastructureFailure(error)) throw new OfficialAlertRepositoryError();
        throw error;
      }
    },
    async transaction(externalId, work) {
      const id = identitySchema.parse(externalId);
      let client: PoolClient | undefined;
      let discard = false;
      try {
        client = await pool.connect();
        const db = client;
        await db.query("begin");
        // A transaction-scoped lock covers concurrent first inserts as well as existing rows.
        await db.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`sutran:${id}`]);
        const result = await work({
          read: () => readState(db, id),
          save: async (value) => {
            const state = storedOfficialAlertSchema.parse(value);
            if (state.alert.externalId !== id) throw new TypeError("Transaction identity mismatch");
            await db.query(
              "insert into private.official_alerts (source, external_id, source_updated_at, state) values ('sutran', $1, $2, $3::jsonb) on conflict (source, external_id) do update set source_updated_at = excluded.source_updated_at, state = excluded.state",
              [id, state.alert.sourceUpdatedAt, JSON.stringify(state)],
            );
          },
          appendSnapshot: async (value) => {
            const alert = officialRoadAlertSchema.parse(value);
            if (alert.externalId !== id) throw new TypeError("Transaction identity mismatch");
            await db.query(
              "insert into private.official_alert_versions (source, external_id, source_updated_at, retrieved_at, payload) values ('sutran', $1, $2, $3, $4::jsonb) on conflict (source, external_id, source_updated_at) do nothing",
              [id, alert.sourceUpdatedAt, alert.retrievedAt, JSON.stringify(alert)],
            );
          },
          appendHistory: async (values) => {
            const entries = z.array(officialAlertHistoryEntrySchema).parse(values);
            if (entries.some((entry) => entry.externalId !== id))
              throw new TypeError("Transaction identity mismatch");
            if (entries.length === 0) return 0;
            const rows = entries.map((entry) => ({
              event_key: createHash("sha256").update(sourceHistoryKey(entry)).digest("hex"),
              external_id: id,
              occurred_at: entry.occurredAt,
              payload: entry,
            }));
            const inserted = await db.query(
              "insert into private.official_alert_history (event_key, source, external_id, occurred_at, payload) select item->>'event_key', 'sutran', (item->>'external_id')::uuid, (item->>'occurred_at')::timestamptz, item->'payload' from jsonb_array_elements($1::jsonb) item on conflict (event_key) do nothing returning event_key",
              [JSON.stringify(rows)],
            );
            if (inserted.rowCount === null) throw new OfficialAlertRepositoryError();
            return inserted.rowCount;
          },
        });
        await db.query("commit");
        return result;
      } catch (error) {
        if (client) {
          try {
            await client.query("rollback");
          } catch (rollbackError) {
            discard = true;
            throw new AggregateError(
              [error, rollbackError],
              "Official alert rollback failed; connection discarded",
              { cause: rollbackError },
            );
          }
        }
        if (infrastructureFailure(error)) throw new OfficialAlertRepositoryError();
        throw error;
      } finally {
        client?.release(discard);
      }
    },
  };
}
