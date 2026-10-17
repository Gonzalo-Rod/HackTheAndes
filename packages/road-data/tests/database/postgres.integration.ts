import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterAll, test } from "vitest";
import { loadDatabaseConfiguration } from "../../src/config/env.ts";
import { createDatabasePool } from "../../src/db/pool.ts";
import { createPostgresOfficialAlertRepository } from "../../src/db/official-alert-repository.ts";
import { createSutranIngestionService } from "../../src/services/ingest-sutran-alerts.ts";
import { fixtureAlert, TestSource, batch, publication } from "../ingestion/support.ts";

// Opt-in integration tests use isolated random IDs and remove only those IDs afterward.
const pool = createDatabasePool(loadDatabaseConfiguration());
const repository = createPostgresOfficialAlertRepository(pool);
const ids: string[] = [];
async function alert() {
  const externalId = randomUUID();
  ids.push(externalId);
  return fixtureAlert({ externalId, sourceUpdatedAt: "2026-10-17T15:00:00.000Z" });
}
async function counts(id: string) {
  const result = await pool.query<{ versions: number; history: number }>(
    "select (select count(*)::integer from private.official_alert_versions where external_id = $1) as versions, (select count(*)::integer from private.official_alert_history where external_id = $1) as history",
    [id],
  );
  return result.rows[0];
}
afterAll(async () => {
  try {
    await pool.query(
      "delete from private.official_alert_history where external_id = any($1::uuid[])",
      [ids],
    );
    await pool.query(
      "delete from private.official_alert_versions where external_id = any($1::uuid[])",
      [ids],
    );
    await pool.query("delete from private.official_alerts where external_id = any($1::uuid[])", [
      ids,
    ]);
  } finally {
    await pool.end();
  }
});

test("real persistence imports once and repeated polls only refresh freshness", async () => {
  const record = await alert();
  const source = new TestSource(record);
  const service = createSutranIngestionService({ source, repository, logger: () => undefined });
  const first = await service.run();
  assert.ok(first.ok);
  assert.equal(first.value.inserted, 1);
  source.alerts = batch([{ ...record, retrievedAt: "2026-10-17T18:40:00.000Z" }]);
  const second = await service.run();
  assert.ok(second.ok);
  assert.equal(second.value.unchanged, 1);
  assert.deepEqual(await counts(record.externalId), { versions: 1, history: 1 });
  assert.equal(
    (await repository.findById(record.externalId))?.lastObservedAt,
    "2026-10-17T18:40:00.000Z",
  );
});

test("concurrent first polls serialize before reading an absent row", async () => {
  const record = await alert();
  const source = new TestSource(record);
  const service = createSutranIngestionService({ source, repository, logger: () => undefined });
  const results = await Promise.all(Array.from({ length: 6 }, () => service.run()));
  let inserted = 0;
  for (const result of results) {
    assert.ok(result.ok);
    inserted += result.value.inserted;
    assert.equal(result.value.failed, 0);
  }
  assert.equal(inserted, 1);
  assert.deepEqual(await counts(record.externalId), { versions: 1, history: 1 });
});

test("a newer source status persists and an older revision cannot overwrite it", async () => {
  const record = await alert();
  const source = new TestSource(record);
  const service = createSutranIngestionService({ source, repository, logger: () => undefined });
  await service.run();
  const changed = {
    ...record,
    sourceUpdatedAt: "2026-10-17T16:00:00.000Z",
    roadStatus: "normal" as const,
    sourceRoadStatus: "normal",
  };
  source.alerts = batch([changed]);
  assert.ok((await service.run()).ok);
  source.alerts = batch([record]);
  const old = await service.run();
  assert.ok(old.ok);
  assert.equal(old.value.stale, 1);
  assert.equal((await repository.findById(record.externalId))?.alert.roadStatus, "normal");
  assert.equal((await counts(record.externalId))?.versions, 2);
});

test("rollback removes current state, revision, and history together", async () => {
  const record = await alert();
  await assert.rejects(
    repository.transaction(record.externalId, async (tx) => {
      await tx.appendHistory([publication(record)]);
      await tx.appendSnapshot(record);
      await tx.save({
        alert: record,
        firstObservedAt: record.retrievedAt,
        lastObservedAt: record.retrievedAt,
        historySynced: true,
      });
      throw new Error("deliberate rollback");
    }),
    /deliberate rollback/,
  );
  assert.equal(await repository.findById(record.externalId), null);
  assert.deepEqual(await counts(record.externalId), { versions: 0, history: 0 });
});

test("null source revisions dedupe and equivalent timestamp offsets share one history fact", async () => {
  const record = { ...(await alert()), sourceUpdatedAt: null };
  for (let iteration = 0; iteration < 2; iteration++) {
    await repository.transaction(record.externalId, async (tx) => {
      await tx.appendSnapshot(record);
      await tx.appendHistory([
        {
          ...publication(record),
          occurredAt:
            iteration === 0 ? "2026-10-17T15:00:00.000Z" : "2026-10-17T10:00:00.000-05:00",
        },
      ]);
      await tx.save({
        alert: record,
        firstObservedAt: record.retrievedAt,
        lastObservedAt: record.retrievedAt,
        historySynced: true,
      });
    });
  }
  assert.deepEqual(await counts(record.externalId), { versions: 1, history: 1 });
});

test("database constraints reject an out-of-range confidence value", async () => {
  await assert.rejects(
    pool.query(
      "insert into public.incidents (road_code, type, origin, road_status, status, confidence, first_seen) values ('PE-22', 'derrumbe', 'community', 'unknown', 'active', 1.5, now())",
    ),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "23514",
  );
});

test("all application tables enforce RLS and deny browser-role table access", async () => {
  const result = await pool.query<{ insecure: number }>(
    "select count(*)::integer as insecure from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r' and n.nspname in ('public','private') and c.relname <> 'spatial_ref_sys' and (not c.relrowsecurity or has_table_privilege('anon', c.oid, 'select,insert,update,delete') or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete'))",
  );
  assert.equal(result.rows[0]?.insecure, 0);
  const role = await pool.query<{ safe: boolean }>(
    "select not rolsuper and not rolbypassrls and not rolcreatedb and not rolcreaterole as safe from pg_catalog.pg_roles where rolname = current_user",
  );
  assert.equal(role.rows[0]?.safe, true);
});
