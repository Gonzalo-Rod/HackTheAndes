import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import {
  createSutranAdapter,
  SutranPayloadError,
  SUTRAN_BASE_URL,
} from "../../src/integrations/sutran/index.ts";
import type { JsonTransport } from "../../src/integrations/sutran/index.ts";

interface FixtureEnvelope {
  success: boolean;
  data: Record<string, unknown>[];
}
const fixture = (): FixtureEnvelope =>
  JSON.parse(readFileSync(new URL("./fixtures/alerts.json", import.meta.url), "utf8"));
const history = (): FixtureEnvelope =>
  JSON.parse(readFileSync(new URL("./fixtures/history.json", import.meta.url), "utf8"));
const firstAlert = (): Record<string, unknown> => {
  const alert = fixture().data.find((row) => row.viaCodigo === "PE-22");
  assert.ok(alert, "Fixture must contain a PE-22 alert");
  return alert;
};
const clock = () => new Date("2026-10-17T18:30:00.000Z");
function adapterFor(payload: unknown) {
  return createSutranAdapter({
    transport: {
      async getJson() {
        return payload;
      },
    },
    clock,
  });
}

test("normalizes the real national snapshot and selects three in-force PE-22 alerts", async () => {
  const batch = await adapterFor(fixture()).fetchCurrentAlerts();
  assert.equal(batch.complete, true);
  assert.equal(batch.receivedCount, 12);
  assert.equal(batch.filteredCount, 9);
  assert.equal(batch.records.length, 3);
  assert.deepEqual(batch.rejected, []);
  const alert = batch.records[0];
  assert.ok(alert);
  assert.equal(alert.externalId, "3e20237e-1aca-4f6a-879f-95333e74b131");
  assert.equal(alert.externalCode, "SIGEA-171026-01");
  assert.equal(alert.roadStatus, "restringido");
  assert.deepEqual(alert.location, { latitude: -11.9182317, longitude: -76.5575604 });
  assert.equal(alert.kilometer, 51);
  assert.equal(alert.eventDate, "2026-10-17");
  assert.equal(alert.sourceUpdatedAt, "2026-10-17T15:21:32.269Z");
  assert.equal(alert.retrievedAt, "2026-10-17T18:30:00.000Z");
  assert.equal(batch.sourceUrl, `${SUTRAN_BASE_URL}alerts`);
  assert.equal("accionesPnp" in alert, false);
  assert.equal(
    "status" in alert,
    false,
    "The adapter must not invent the application's incident lifecycle",
  );
});

test("retains reopened incidents and parses kilometer-plus-meter references", async () => {
  const batch = await adapterFor(fixture()).fetchCurrentAlerts();
  assert.equal(batch.records.filter((row) => row.roadStatus === "normal").length, 2);
  const maintenance = batch.records.find((row) => row.kilometerLabel === "KM 64+800");
  assert.equal(maintenance?.kilometer, 64.8);
});

test("filters only by the requested road and explicit validity flags", async () => {
  const rows = [
    firstAlert(),
    { ...firstAlert(), vencida: true },
    { ...firstAlert(), aunNoVigente: true },
    { ...firstAlert(), viaCodigo: "PE-1N" },
  ];
  const batch = await adapterFor({ success: true, data: rows }).fetchCurrentAlerts();
  assert.equal(batch.records.length, 1);
  assert.equal(batch.filteredCount, 3);
  const otherRoad = await adapterFor({ success: true, data: rows }).fetchCurrentAlerts({
    roadCode: " pe-1n ",
  });
  assert.equal(otherRoad.records.length, 1);
  assert.equal(otherRoad.records[0]?.roadCode, "PE-1N");
});

test("unknown upstream status is explicit and never mapped to normal", async () => {
  const batch = await adapterFor({
    success: true,
    data: [{ ...firstAlert(), estadoVia: "nuevo_estado" }],
  }).fetchCurrentAlerts();
  assert.equal(batch.records[0]?.roadStatus, "unknown");
  assert.equal(batch.records[0]?.sourceRoadStatus, "nuevo_estado");
});

test("retains valid rows and reports malformed rows as partial success", async () => {
  const batch = await adapterFor({
    success: true,
    data: [firstAlert(), { ...firstAlert(), lat: 100 }],
  }).fetchCurrentAlerts();
  assert.equal(batch.complete, false);
  assert.equal(batch.records.length, 1);
  assert.equal(batch.rejected.length, 1);
  assert.equal(batch.rejected[0]?.index, 1);
  assert.equal(batch.rejected[0]?.issues[0]?.path, "lat");
});

test("all-invalid rows cannot masquerade as a complete empty feed", async () => {
  const batch = await adapterFor({
    success: true,
    data: [null, {}, "not an alert"],
  }).fetchCurrentAlerts();
  assert.equal(batch.complete, false);
  assert.equal(batch.records.length, 0);
  assert.equal(batch.rejected.length, 3);
});

test("a real empty feed is distinct from invalid or failed envelopes", async () => {
  const empty = await adapterFor({ success: true, data: [] }).fetchCurrentAlerts();
  assert.equal(empty.complete, true);
  assert.deepEqual(empty.records, []);
  for (const payload of [
    { success: false, data: [] },
    { data: [] },
    [],
    null,
    { success: true, data: {} },
  ]) {
    await assert.rejects(adapterFor(payload).fetchCurrentAlerts(), SutranPayloadError);
  }
});

test("missing validity flags and mistyped coordinates are rejected without coercion", async () => {
  const { vencida: _flag, ...missingFlag } = firstAlert();
  const batch = await adapterFor({
    success: true,
    data: [missingFlag, { ...firstAlert(), lat: "-11.9" }],
  }).fetchCurrentAlerts();
  assert.equal(batch.records.length, 0);
  assert.equal(batch.rejected.length, 2);
});

test("null locations and dates remain unknown, but half a coordinate is rejected", async () => {
  const unknown = {
    ...firstAlert(),
    lat: null,
    lng: null,
    fechaEvento: null,
    vigenteDesde: null,
    vigenteHasta: null,
    lastActionAt: null,
  };
  const batch = await adapterFor({
    success: true,
    data: [unknown, { ...firstAlert(), lat: null }],
  }).fetchCurrentAlerts();
  assert.equal(batch.records[0]?.location, null);
  assert.equal(batch.records[0]?.eventDate, null);
  assert.equal(batch.records[0]?.sourceUpdatedAt, null);
  assert.equal(batch.rejected.length, 1);
});

test("rejects impossible dates, reversed validity periods, and timestamps without timezone", async () => {
  const rows = [
    { ...firstAlert(), fechaEvento: "31/02/2026" },
    { ...firstAlert(), vigenteDesde: "30/10/2026", vigenteHasta: "17/10/2026" },
    { ...firstAlert(), lastActionAt: "2026-10-17T15:21:32" },
  ];
  const batch = await adapterFor({ success: true, data: rows }).fetchCurrentAlerts();
  assert.equal(batch.records.length, 0);
  assert.equal(batch.rejected.length, 3);
});

test("normalizes timestamp offsets while preserving calendar-only event dates", async () => {
  const row = { ...firstAlert(), lastActionAt: "2026-10-17T10:21:32.269-05:00" };
  const batch = await adapterFor({ success: true, data: [row] }).fetchCurrentAlerts();
  assert.equal(batch.records[0]?.sourceUpdatedAt, "2026-10-17T15:21:32.269Z");
  assert.equal(batch.records[0]?.eventDate, "2026-10-17");
});

test("additive upstream fields do not break validation or leak into the contract", async () => {
  const batch = await adapterFor({
    success: true,
    data: [{ ...firstAlert(), futureField: { new: true } }],
  }).fetchCurrentAlerts();
  assert.equal(batch.complete, true);
  const alert = batch.records[0];
  assert.ok(alert);
  assert.equal("futureField" in alert, false);
});

test("history is chronological and publication events do not invent a road status", async () => {
  const externalId = "98a4c1d9-b1ad-4069-aa26-33941df1f38b";
  const batch = await adapterFor(history()).fetchAlertHistory(externalId);
  assert.equal(batch.complete, true);
  assert.equal(batch.records.length, 2);
  assert.equal(batch.records[0]?.eventType, "publicacion");
  assert.equal(batch.records[0]?.roadStatus, null);
  assert.equal(batch.records[1]?.roadStatus, "normal");
  assert.equal(batch.records[1]?.externalId, externalId);
  assert.equal(batch.sourceUrl, `${SUTRAN_BASE_URL}alerts/${externalId}/historial`);
});

test("history has the same explicit partial-failure behavior", async () => {
  const payload = history();
  payload.data.push({ fecha: "yesterday", tipo: "cambio_estado_via", estadoNuevo: "normal" });
  const batch = await adapterFor(payload).fetchAlertHistory("98a4c1d9-b1ad-4069-aa26-33941df1f38b");
  assert.equal(batch.complete, false);
  assert.equal(batch.records.length, 2);
  assert.equal(batch.rejected.length, 1);
});

test("invalid alert identifiers cannot become request paths", async () => {
  let calls = 0;
  const transport: JsonTransport = {
    async getJson() {
      calls++;
      return history();
    },
  };
  const adapter = createSutranAdapter({ transport });
  await assert.rejects(adapter.fetchAlertHistory("../../private"));
  assert.equal(calls, 0);
});

test("passes cancellation to the injected shared transport", async () => {
  const controller = new AbortController();
  const transport: JsonTransport = {
    async getJson(url, options) {
      assert.equal(url, `${SUTRAN_BASE_URL}alerts`);
      assert.equal(options?.signal, controller.signal);
      return fixture();
    },
  };
  await createSutranAdapter({ transport, clock }).fetchCurrentAlerts({ signal: controller.signal });
});
