import assert from "node:assert/strict";
import { test } from "vitest";
import { createSutranIngestionService } from "../../src/services/ingest-sutran-alerts.ts";
import type { IngestionResult, IngestionSummary } from "../../src/contracts/ingestion.ts";
import { fixtureAlert, TestSource, TestRepository, batch, publication } from "./support.ts";

function successful(result: IngestionResult): IngestionSummary {
  assert.ok(result.ok);
  return result.value;
}

test("the first poll stores the official snapshot and history without inventing an incident lifecycle", async () => {
  const alert = await fixtureAlert();
  const repository = new TestRepository();
  const source = new TestSource(alert);
  const service = createSutranIngestionService({ source, repository, logger: () => undefined });
  const result = successful(await service.run({ requestId: "poll-1" }));
  assert.equal(result.status, "complete");
  assert.equal(result.inserted, 1);
  assert.equal(result.historyInserted, 1);
  const stored = repository.inspect(alert.externalId);
  assert.equal(stored.snapshots.size, 1);
  assert.equal(stored.history.size, 1);
  assert.equal(stored.state?.historySynced, true);
  assert.equal(stored.state?.alert.roadStatus, "restringido");
  assert.equal("status" in (stored.state?.alert ?? {}), false);
  assert.deepEqual(source.requestIds, ["poll-1", "poll-1"]);
});

test("repeated polls update freshness without duplicate snapshots or history requests", async () => {
  const alert = await fixtureAlert();
  const repository = new TestRepository();
  const source = new TestSource(alert);
  const service = createSutranIngestionService({ source, repository, logger: () => undefined });
  await service.run();
  source.alerts = batch([{ ...alert, retrievedAt: "2026-10-17T18:40:00.000Z" }]);
  const result = successful(await service.run());
  assert.equal(result.unchanged, 1);
  assert.equal(result.historyRequests, 0);
  assert.equal(source.historyCalls.length, 1);
  const stored = repository.inspect(alert.externalId);
  assert.equal(stored.snapshots.size, 1);
  assert.equal(stored.history.size, 1);
  assert.equal(stored.state?.lastObservedAt, "2026-10-17T18:40:00.000Z");
  assert.equal(stored.state?.firstObservedAt, alert.retrievedAt);
});

test("a newer source revision updates the snapshot and imports only new history facts", async () => {
  const alert = await fixtureAlert();
  const repository = new TestRepository();
  const source = new TestSource(alert);
  const service = createSutranIngestionService({ source, repository, logger: () => undefined });
  await service.run();
  const reopened = {
    ...alert,
    roadStatus: "normal" as const,
    sourceRoadStatus: "normal",
    sourceUpdatedAt: "2026-10-17T18:35:00.000Z",
    retrievedAt: "2026-10-17T18:40:00.000Z",
  };
  source.alerts = batch([reopened]);
  source.history = batch([
    publication(alert),
    {
      ...publication(reopened),
      eventType: "cambio_estado_via",
      roadStatus: "normal",
      sourceRoadStatus: "normal",
    },
  ]);
  const result = successful(await service.run());
  assert.equal(result.updated, 1);
  assert.equal(result.historyInserted, 1);
  const stored = repository.inspect(alert.externalId);
  assert.equal(stored.snapshots.size, 2);
  assert.equal(stored.history.size, 2);
  assert.equal(stored.state?.alert.roadStatus, "normal");
});

test("an older source revision cannot overwrite the current road status or freshness", async () => {
  const alert = await fixtureAlert();
  const repository = new TestRepository();
  const source = new TestSource(alert);
  const service = createSutranIngestionService({ source, repository, logger: () => undefined });
  await service.run();
  const before = repository.inspect(alert.externalId);
  source.alerts = batch([
    {
      ...alert,
      sourceUpdatedAt: "2026-10-16T15:00:00.000Z",
      roadStatus: "normal",
      sourceRoadStatus: "normal",
    },
  ]);
  const result = successful(await service.run());
  assert.equal(result.stale, 1);
  assert.deepEqual(repository.inspect(alert.externalId), before);
  assert.equal(source.historyCalls.length, 1);
});

test("a changed payload reusing the source revision is quarantined as a conflict", async () => {
  const alert = await fixtureAlert();
  const repository = new TestRepository();
  const source = new TestSource(alert);
  const service = createSutranIngestionService({ source, repository, logger: () => undefined });
  await service.run();
  source.alerts = batch([{ ...alert, roadStatus: "normal", sourceRoadStatus: "normal" }]);
  const result = successful(await service.run());
  assert.equal(result.status, "partial");
  assert.equal(result.conflicts, 1);
  assert.equal(result.issues[0]?.code, "revision_conflict");
  assert.equal(repository.inspect(alert.externalId).state?.alert.roadStatus, "restringido");
});

test("empty and partial feeds never clear an incident absent from the current records", async () => {
  const alert = await fixtureAlert();
  const repository = new TestRepository();
  const source = new TestSource(alert);
  const service = createSutranIngestionService({ source, repository, logger: () => undefined });
  await service.run();
  const before = repository.inspect(alert.externalId);
  source.alerts = batch([]);
  assert.equal(successful(await service.run()).status, "complete");
  source.alerts = batch([], 1);
  const result = successful(await service.run());
  assert.equal(result.status, "partial");
  assert.equal(result.sourceRejected, 1);
  assert.deepEqual(repository.inspect(alert.externalId), before);
});

test("concurrent duplicate polls are idempotent when the repository honors its transaction contract", async () => {
  const alert = await fixtureAlert();
  const repository = new TestRepository();
  const source = new TestSource(alert);
  const service = createSutranIngestionService({ source, repository, logger: () => undefined });
  const results = await Promise.all([service.run(), service.run()]);
  assert.equal(
    results.map(successful).reduce((total, result) => total + result.inserted, 0),
    1,
  );
  const stored = repository.inspect(alert.externalId);
  assert.equal(stored.snapshots.size, 1);
  assert.equal(stored.history.size, 1);
});
