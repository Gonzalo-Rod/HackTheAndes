import type { Pool } from "pg";
import { jobOutcomeSchema, type IngestionRunStore } from "../contracts/jobs.ts";

export function createPostgresIngestionRunStore(pool: Pool): IngestionRunStore {
  return {
    async reserve(requestId) {
      const result = await pool.query(
        "insert into private.ingestion_runs (request_id, provider, status) values ($1, 'sutran', 'running') on conflict (request_id) do nothing returning request_id",
        [requestId],
      );
      return result.rowCount === 1;
    },
    async read(requestId) {
      const result = await pool.query<{ status: string; summary: unknown }>(
        "select status, summary from private.ingestion_runs where request_id = $1 and provider = 'sutran'",
        [requestId],
      );
      const row = result.rows[0];
      if (row?.status === "running") return { requestId, status: "running" };
      const parsed = jobOutcomeSchema.safeParse(row?.summary);
      if (
        !parsed.success ||
        parsed.data.requestId !== requestId ||
        parsed.data.status !== row?.status
      )
        throw new Error("The stored ingestion outcome is unavailable");
      return parsed.data;
    },
    async finish(outcome) {
      const result = await pool.query(
        "update private.ingestion_runs set finished_at = now(), status = $2, summary = $3::jsonb where request_id = $1 and provider = 'sutran' and status = 'running'",
        [outcome.requestId, outcome.status, JSON.stringify(outcome)],
      );
      if (result.rowCount !== 1) throw new Error("The ingestion audit was not confirmed");
    },
  };
}
