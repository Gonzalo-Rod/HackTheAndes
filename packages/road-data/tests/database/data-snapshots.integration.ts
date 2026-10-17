import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, expect, it } from "vitest";
import { loadDatabaseConfiguration } from "../../src/config/env.ts";
import { createDatabasePool } from "../../src/db/pool.ts";
import { createDataSnapshotRepository } from "../../src/db/data-snapshots.ts";
import { historicalEventsSchema } from "../../src/contracts/historical-events.ts";
const pool = createDatabasePool(loadDatabaseConfiguration());
const revision = randomBytes(32).toString("hex");
const source = historicalEventsSchema.parse(
  JSON.parse(
    await readFile(new URL("../../data/events/pe22-events.json", import.meta.url), "utf8"),
  ),
);
const snapshot = { ...source, geometryRevision: revision };
const repository = createDataSnapshotRepository(pool, historicalEventsSchema);
beforeAll(async () => {
  await pool.query(
    "insert into public.geometry_revisions(id,road_code,retrieved_at,source_urls,source_snapshot,measured_length_km) values($1,'PE-22',now(),'{}','{}',1)",
    [revision],
  );
});
afterAll(async () => {
  try {
    await pool.query("delete from public.data_snapshots where geometry_revision=$1", [revision]);
    await pool.query("delete from public.geometry_revisions where id=$1", [revision]);
  } finally {
    await pool.end();
  }
});
it("stores complete snapshots once and preserves newer data on stale retries", async () => {
  const input = {
    dataset: "historical-events",
    key: "test",
    geometryRevision: revision,
    capturedAt: snapshot.capturedAt,
    payload: snapshot,
  };
  expect(await repository.save(input)).toEqual({ state: "stored" });
  expect(await repository.save(input)).toEqual({ state: "preserved" });
  expect(await repository.read("historical-events", revision, "test")).toEqual(snapshot);
  const older = new Date(Date.parse(snapshot.capturedAt) - 1000).toISOString();
  expect(
    await repository.save({
      ...input,
      capturedAt: older,
      payload: { ...snapshot, capturedAt: older },
    }),
  ).toEqual({ state: "preserved" });
  expect(await repository.read("historical-events", revision, "test")).toEqual(snapshot);
});
it("rejects invalid labels and mismatched revision before replacing committed data", async () => {
  await expect(
    repository.save({
      dataset: "historical-events",
      key: "test",
      geometryRevision: revision,
      capturedAt: snapshot.capturedAt,
      payload: { ...snapshot, geometryRevision: "f".repeat(64) },
    }),
  ).rejects.toThrow("envelope");
  expect(
    historicalEventsSchema.safeParse({ ...snapshot, negativeExamples: 20, trainingReady: true })
      .success,
  ).toBe(false);
  expect(await repository.read("historical-events", revision, "test")).toEqual(snapshot);
});
