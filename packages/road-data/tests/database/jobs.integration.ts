import { randomUUID } from "node:crypto";
import { afterAll, expect, test } from "vitest";
import { createDatabasePool } from "../../src/db/pool.ts";
import { loadDatabaseConfiguration } from "../../src/config/env.ts";
import { createPostgresIngestionRunStore } from "../../src/db/ingestion-runs.ts";

const pool = createDatabasePool(loadDatabaseConfiguration());
const runs = createPostgresIngestionRunStore(pool);
const ids: string[] = [];
function id() {
  const value = `test-job-${randomUUID()}`;
  ids.push(value);
  return value;
}
afterAll(async () => {
  try {
    await pool.query("delete from private.ingestion_runs where request_id = any($1::text[])", [
      ids,
    ]);
  } finally {
    await pool.end();
  }
});
test("concurrent reservations allow exactly one owner and expose running state", async () => {
  const requestId = id();
  const results = await Promise.all(Array.from({ length: 6 }, () => runs.reserve(requestId)));
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(await runs.read(requestId)).toEqual({ requestId, status: "running" });
});
test("durable completion is read back, cannot be overwritten, and cannot be reserved twice", async () => {
  const requestId = id();
  expect(await runs.reserve(requestId)).toBe(true);
  const outcome = { requestId, status: "complete" as const };
  await runs.finish(outcome);
  expect(await runs.read(requestId)).toEqual(outcome);
  expect(await runs.reserve(requestId)).toBe(false);
  await expect(runs.finish({ requestId, status: "failure" })).rejects.toThrow(
    "audit was not confirmed",
  );
});

test("rejects malformed or contradictory stored JSON at the database boundary", async () => {
  const requestId = id();
  await runs.reserve(requestId);
  await pool.query(
    "update private.ingestion_runs set status = 'complete', summary = $2::jsonb where request_id = $1",
    [requestId, JSON.stringify({ requestId, status: "failure" })],
  );
  await expect(runs.read(requestId)).rejects.toThrow("stored ingestion outcome is unavailable");
});
