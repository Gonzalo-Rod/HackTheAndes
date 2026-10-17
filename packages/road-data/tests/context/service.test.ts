import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { createRoadContextService } from "../../src/services/road-context.ts";
import type { RoadContextRepository, RoadContextLog } from "../../src/contracts/road-context.ts";
import { fixtureAlert } from "../ingestion/support.ts";

const source: unknown = JSON.parse(
  readFileSync(new URL("../../data/pe22/source.json", import.meta.url), "utf8"),
);
const gazetteer: unknown = JSON.parse(
  readFileSync(new URL("../../data/pe22/gazetteer.json", import.meta.url), "utf8"),
);
async function archive() {
  return {
    records: [
      {
        alert: await fixtureAlert({ roadCode: "PE-22", validFrom: null, validUntil: null }),
        firstObservedAt: "2026-10-17T22:00:00Z",
        lastObservedAt: "2026-10-17T22:00:00Z",
        historySynced: true,
      },
    ],
    poll: { startedAt: "2026-10-17T21:59:59Z", finishedAt: "2026-10-17T22:00:05Z" },
  };
}
function service(
  repository: RoadContextRepository,
  clock = () => new Date("2026-10-17T22:01:00Z"),
  logger = (entry: RoadContextLog) => {
    void entry;
  },
) {
  return createRoadContextService({ repository, clock, logger });
}
test("B can resolve a pin, an exact alias, unknown places and ambiguous names without choosing for the user", async () => {
  const context = service({
    readSpatial: async () => ({ source, gazetteer }),
    readOfficial: async () => archive(),
  });
  const pin = await context.execute(
    { kind: "pin", longitude: -76.588748, latitude: -11.910688 },
    "b-pin",
  );
  assert.ok(pin.kind === "location" && pin.location);
  assert.equal(pin.requiresConfirmation, true);
  assert.equal(pin.status, "matched");
  for (const [name, status] of [
    ["corcona", "matched"],
    ["infiernillo", "ambiguous"],
    ["past the bridge", "not_found"],
  ]) {
    const result = await context.execute({ kind: "place", name }, "b-place");
    assert.ok(result.kind === "location");
    assert.equal(result.status, status);
  }
  const outside = await context.execute({ kind: "pin", longitude: 0, latitude: 0 }, "b-outside");
  assert.ok(outside.kind === "location");
  assert.equal(outside.status, "outside_corridor");
});
test("a database outage uses the validated spatial cache with its age and redacts the failure", async () => {
  let failing = false;
  const logs: RoadContextLog[] = [];
  const context = service(
    {
      readSpatial: async () => {
        if (failing) throw new Error("private database detail");
        return { source, gazetteer };
      },
      readOfficial: async () => archive(),
    },
    undefined,
    (entry) => logs.push(entry),
  );
  await context.execute({ kind: "place", name: "corcona" }, "first");
  failing = true;
  const fallback = await context.execute({ kind: "place", name: "corcona" }, "second");
  assert.equal(fallback.state, "stale");
  assert.ok(fallback.dataAgeMs && fallback.dataAgeMs > 0);
  assert.equal(JSON.stringify(logs).includes("private database detail"), false);
  assert.equal(JSON.stringify(logs).includes("corcona"), false);
});
test("cold outages and invalid stored JSON return explicit unavailable responses", async () => {
  const context = service({
    readSpatial: async () => ({ source: null, gazetteer: null }),
    readOfficial: async () => {
      throw new Error("database offline");
    },
  });
  assert.equal(
    (await context.execute({ kind: "place", name: "corcona" }, "spatial")).state,
    "unavailable",
  );
  assert.equal(
    (await context.execute({ kind: "official_alerts" }, "official")).state,
    "unavailable",
  );
});
test("official answers exclude archived-only observations and retain the absence caveat", async () => {
  const data = await archive();
  const first = data.records[0];
  assert.ok(first);
  data.records.push({
    ...first,
    lastObservedAt: "2026-10-17T20:00:00Z",
    alert: { ...first.alert, externalId: "91ef641a-69b8-4c81-a6ba-cb5f5382ecea" },
  });
  const context = service({ readSpatial: async () => null, readOfficial: async () => data });
  const result = await context.execute({ kind: "official_alerts" }, "official");
  assert.ok(result.kind === "official_alerts");
  assert.equal(result.alerts.length, 1);
  assert.equal(result.absenceDoesNotConfirmClearance, true);
});
test("successful empty polls stay distinguishable from missing polls", async () => {
  const data = await archive();
  data.records = [];
  const context = service({ readSpatial: async () => null, readOfficial: async () => data });
  const empty = await context.execute({ kind: "official_alerts" }, "empty");
  assert.equal(empty.state, "ready");
  const unavailable = service({
    readSpatial: async () => null,
    readOfficial: async () => ({ ...data, poll: null }),
  });
  assert.equal(
    (await unavailable.execute({ kind: "official_alerts" }, "missing")).state,
    "unavailable",
  );
});
test("official freshness becomes stale only after the 20-minute boundary, and outages retain the last cache", async () => {
  const data = await archive();
  let time = new Date("2026-10-17T22:20:05Z");
  let fail = false;
  const context = service(
    {
      readSpatial: async () => null,
      readOfficial: async () => {
        if (fail) throw new Error("offline");
        return data;
      },
    },
    () => time,
  );
  assert.equal((await context.execute({ kind: "official_alerts" }, "boundary")).state, "ready");
  time = new Date("2026-10-17T22:20:05.001Z");
  assert.equal((await context.execute({ kind: "official_alerts" }, "stale")).state, "stale");
  fail = true;
  const result = await context.execute({ kind: "official_alerts" }, "cached");
  assert.equal(result.state, "stale");
  assert.ok(result.kind === "official_alerts");
  assert.equal(result.alerts.length, 1);
});
test("calendar validity is re-evaluated at Lima midnight, not UTC midnight", async () => {
  const data = await archive();
  const first = data.records[0];
  assert.ok(first);
  first.alert.validUntil = "2026-10-17";
  let time = new Date("2026-10-18T04:59:59Z");
  const context = service(
    { readSpatial: async () => null, readOfficial: async () => data },
    () => time,
  );
  const before = await context.execute({ kind: "official_alerts" }, "before");
  assert.ok(before.kind === "official_alerts");
  assert.equal(before.alerts.length, 1);
  time = new Date("2026-10-18T05:00:00Z");
  const after = await context.execute({ kind: "official_alerts" }, "after");
  assert.ok(after.kind === "official_alerts");
  assert.equal(after.alerts.length, 0);
});
