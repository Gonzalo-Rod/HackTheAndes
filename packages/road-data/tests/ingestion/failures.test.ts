import assert from "node:assert/strict";
import { test } from "vitest";
import { createSutranIngestionService } from "../../src/services/ingest-sutran-alerts.ts";
import { HttpTransportError } from "../../src/integrations/http/json-transport.ts";
import { SutranPayloadError } from "../../src/integrations/sutran/adapter.ts";
import type { IngestionResult, IngestionLog } from "../../src/contracts/ingestion.ts";
import { fixtureAlert, TestSource, TestRepository, batch, publication } from "./support.ts";

function successful(result: IngestionResult) {
  assert.ok(result.ok);
  return result.value;
}

test("a source outage returns an explicit unavailable result and preserves stored data", async () => {
  const alert = await fixtureAlert();
  const source = new TestSource(alert);
  const repository = new TestRepository();
  const logs: IngestionLog[] = [];
  const service = createSutranIngestionService({
    source,
    repository,
    logger: (entry) => logs.push(entry),
  });
  await service.run();
  const before = repository.inspect(alert.externalId);
  source.alertsError = new HttpTransportError("http", 503);
  const result = await service.run({ requestId: "offline-poll" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "source_unavailable");
  assert.deepEqual(repository.inspect(alert.externalId), before);
  assert.equal(logs.at(-1)?.requestId, "offline-poll");
  assert.equal(logs.at(-1)?.errorType, "source_unavailable");
  assert.equal(JSON.stringify(logs).includes(alert.title), false);
});

test("an inconsistent normalized batch fails validation before persistence", async () => {
  const alert = await fixtureAlert();
  const source = new TestSource(alert);
  source.alerts = { ...source.alerts, receivedCount: 99 };
  const repository = new TestRepository();
  const service = createSutranIngestionService({ source, repository, logger: () => undefined });
  const result = await service.run();
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "invalid_batch");
  assert.equal(repository.inspect(alert.externalId).state, null);
  assert.equal(source.historyCalls.length, 0);
});

test("history outages preserve the current snapshot and retry on an unchanged poll", async () => {
  const alert = await fixtureAlert();
  const source = new TestSource(alert);
  source.historyError = new SutranPayloadError();
  const repository = new TestRepository();
  const logs: IngestionLog[] = [];
  const service = createSutranIngestionService({
    source,
    repository,
    logger: (entry) => logs.push(entry),
  });
  const first = successful(await service.run());
  assert.equal(first.inserted, 1);
  assert.equal(first.status, "partial");
  assert.equal(first.issues[0]?.code, "history_unavailable");
  assert.ok(
    logs.some((entry) => entry.provider === "sutran" && entry.errorType === "history_unavailable"),
  );
  assert.equal(repository.inspect(alert.externalId).state?.historySynced, false);
  source.historyError = null;
  const next = successful(await service.run());
  assert.equal(next.unchanged, 1);
  assert.equal(next.historyInserted, 1);
  assert.equal(next.status, "complete");
  assert.equal(repository.inspect(alert.externalId).snapshots.size, 1);
  assert.equal(repository.inspect(alert.externalId).state?.historySynced, true);
});

test("partial history imports valid facts and retries without duplicating them", async () => {
  const alert = await fixtureAlert();
  const source = new TestSource(alert);
  source.history = batch([publication(alert)], 1);
  const repository = new TestRepository();
  const service = createSutranIngestionService({ source, repository, logger: () => undefined });
  const first = successful(await service.run());
  assert.equal(first.historyInserted, 1);
  assert.equal(first.issues[0]?.code, "history_partial");
  assert.equal(repository.inspect(alert.externalId).state?.historySynced, false);
  source.history = batch([publication(alert)]);
  const next = successful(await service.run());
  assert.equal(next.historyInserted, 0);
  assert.equal(next.status, "complete");
});

test("history for another alert is never attached to the requested record", async () => {
  const alert = await fixtureAlert();
  const source = new TestSource(alert);
  source.history = batch([
    { ...publication(alert), externalId: "98a5d67c-823b-41a8-9fbb-a11592596330" },
  ]);
  const repository = new TestRepository();
  const service = createSutranIngestionService({ source, repository, logger: () => undefined });
  const result = successful(await service.run());
  assert.equal(result.issues[0]?.code, "history_partial");
  assert.equal(repository.inspect(alert.externalId).history.size, 0);
});

test("the history budget defers enrichment while retaining current alerts", async () => {
  const alert = await fixtureAlert();
  const source = new TestSource(alert);
  const repository = new TestRepository();
  const limited = createSutranIngestionService({
    source,
    repository,
    maxHistoryRequests: 0,
    logger: () => undefined,
  });
  const result = successful(await limited.run());
  assert.equal(result.inserted, 1);
  assert.equal(result.historyRequests, 0);
  assert.equal(result.issues[0]?.code, "history_deferred");
  assert.equal(source.historyCalls.length, 0);
  const next = createSutranIngestionService({ source, repository, logger: () => undefined });
  assert.equal(successful(await next.run()).historyInserted, 1);
});

test("a transaction failure rolls back snapshot, history, and current state together", async () => {
  const alert = await fixtureAlert();
  const source = new TestSource(alert);
  const repository = new TestRepository();
  repository.failNextSnapshot = true;
  const service = createSutranIngestionService({ source, repository, logger: () => undefined });
  const result = successful(await service.run());
  assert.equal(result.failed, 1);
  assert.equal(result.issues[0]?.code, "persistence_unavailable");
  const stored = repository.inspect(alert.externalId);
  assert.equal(stored.state, null);
  assert.equal(stored.history.size, 0);
  assert.equal(stored.snapshots.size, 0);
  assert.equal(successful(await service.run()).inserted, 1);
});

test("invalid road and validity flags are skipped with an explicit partial result", async () => {
  const alert = await fixtureAlert();
  const source = new TestSource(alert);
  const repository = new TestRepository();
  const service = createSutranIngestionService({ source, repository, logger: () => undefined });
  for (const override of [{ roadCode: "PE-1N" }, { expired: true }, { notYetValid: true }]) {
    source.alerts = batch([{ ...alert, ...override }]);
    const result = successful(await service.run());
    assert.equal(result.failed, 1);
    assert.equal(result.status, "partial");
  }
  assert.equal(repository.inspect(alert.externalId).state, null);
});

test("invalid run options make no source calls and unexpected bugs are rethrown", async () => {
  const source = new TestSource(await fixtureAlert());
  const repository = new TestRepository();
  const service = createSutranIngestionService({ source, repository, logger: () => undefined });
  const invalid = await service.run({ roadCode: " " });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.error.code, "invalid_options");
  assert.equal(source.requestIds.length, 0);
  assert.throws(
    () => createSutranIngestionService({ source, repository, maxHistoryRequests: 21 }),
    RangeError,
  );
  source.alertsError = new Error("programming bug");
  await assert.rejects(service.run(), /programming bug/);
});

test("a cancelled run makes no source calls or writes", async () => {
  const alert = await fixtureAlert();
  const source = new TestSource(alert);
  const repository = new TestRepository();
  const service = createSutranIngestionService({ source, repository, logger: () => undefined });
  await assert.rejects(service.run({ signal: AbortSignal.abort() }), { name: "AbortError" });
  assert.equal(source.requestIds.length, 0);
  assert.equal(repository.inspect(alert.externalId).state, null);
});

test("invalid stored JSON is rejected before it can influence revision decisions", async () => {
  const alert = await fixtureAlert();
  const source = new TestSource(alert);
  const repository = new TestRepository();
  repository.findById = async () => ({
    alert: { ...alert, kilometer: -1 },
    firstObservedAt: alert.retrievedAt,
    lastObservedAt: alert.retrievedAt,
    historySynced: true,
  });
  const service = createSutranIngestionService({ source, repository, logger: () => undefined });
  const result = successful(await service.run());
  assert.equal(result.status, "partial");
  assert.equal(result.issues[0]?.code, "persistence_unavailable");
  assert.equal(repository.inspect(alert.externalId).state, null);
});

test("filtered history is incomplete and must not mark the revision as fully synced", async () => {
  const alert = await fixtureAlert();
  const source = new TestSource(alert);
  source.history = { ...batch([publication(alert)]), filteredCount: 1, receivedCount: 2 };
  const repository = new TestRepository();
  const service = createSutranIngestionService({ source, repository, logger: () => undefined });
  assert.equal(successful(await service.run()).issues[0]?.code, "history_partial");
  assert.equal(repository.inspect(alert.externalId).state?.historySynced, false);
});
