import assert from "node:assert/strict";
import { test } from "vitest";
import {
  decideOfficialAlertUpdate,
  sourceHistoryKey,
} from "../../src/domain/road-data/official-alert-update.ts";
import { createSutranIngestionService } from "../../src/services/ingest-sutran-alerts.ts";
import { storedOfficialAlertSchema } from "../../src/contracts/ingestion.ts";
import { fixtureAlert, TestSource, TestRepository, batch, publication } from "./support.ts";

test("equivalent source timestamp offsets are the same revision and history key", async () => {
  const alert = await fixtureAlert({ sourceUpdatedAt: "2026-10-17T15:00:00.000Z" });
  const state = storedOfficialAlertSchema.parse({
    alert,
    firstObservedAt: alert.retrievedAt,
    lastObservedAt: alert.retrievedAt,
    historySynced: true,
  });
  const incoming = {
    ...alert,
    sourceUpdatedAt: "2026-10-17T10:00:00.000-05:00",
    retrievedAt: "2026-10-17T18:40:00.000Z",
  };
  assert.equal(decideOfficialAlertUpdate(state, incoming).kind, "unchanged");
  assert.equal(sourceHistoryKey(publication(alert)), sourceHistoryKey(publication(incoming)));
});

test("missing revision timestamps never overwrite known revisions", async () => {
  const alert = await fixtureAlert();
  const state = storedOfficialAlertSchema.parse({
    alert,
    firstObservedAt: alert.retrievedAt,
    lastObservedAt: alert.retrievedAt,
    historySynced: true,
  });
  assert.deepEqual(decideOfficialAlertUpdate(state, { ...alert, sourceUpdatedAt: null }), {
    kind: "conflict",
    reason: "missing_source_timestamp",
  });
  const unknown = { ...state, alert: { ...alert, sourceUpdatedAt: null } };
  assert.equal(decideOfficialAlertUpdate(unknown, alert).kind, "updated");
  assert.equal(
    decideOfficialAlertUpdate(unknown, { ...unknown.alert, title: "changed" }).kind,
    "conflict",
  );
});

test("a delayed observation of the same revision cannot move freshness backwards", async () => {
  const alert = await fixtureAlert();
  const state = storedOfficialAlertSchema.parse({
    alert,
    firstObservedAt: alert.retrievedAt,
    lastObservedAt: alert.retrievedAt,
    historySynced: true,
  });
  const result = decideOfficialAlertUpdate(state, {
    ...alert,
    retrievedAt: "2026-10-17T18:20:00.000Z",
  });
  assert.equal(result.kind, "unchanged");
  if (result.kind === "unchanged") assert.deepEqual(result.state, state);
});

test("an older poll finishing its history request after a newer poll cannot overwrite it", async () => {
  const older = await fixtureAlert();
  const newer = {
    ...older,
    sourceUpdatedAt: "2026-10-17T18:35:00.000Z",
    roadStatus: "normal" as const,
    sourceRoadStatus: "normal",
  };
  const repository = new TestRepository();
  const oldSource = new TestSource(older);
  const newSource = new TestSource(newer);
  let release: () => void = () => undefined;
  let started: () => void = () => undefined;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  oldSource.fetchAlertHistory = async () => {
    started();
    await gate;
    return batch([publication(older)]);
  };
  const oldService = createSutranIngestionService({
    source: oldSource,
    repository,
    logger: () => undefined,
  });
  const newService = createSutranIngestionService({
    source: newSource,
    repository,
    logger: () => undefined,
  });
  const pendingOld = oldService.run();
  await waiting;
  await newService.run();
  release();
  const result = await pendingOld;
  assert.ok(result.ok);
  assert.equal(result.value.stale, 1);
  assert.equal(repository.inspect(older.externalId).state?.alert.roadStatus, "normal");
  assert.equal(repository.inspect(older.externalId).snapshots.size, 1);
});
