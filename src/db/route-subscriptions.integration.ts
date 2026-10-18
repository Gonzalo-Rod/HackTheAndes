import { randomBytes, randomUUID, createHash } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { database } from "./pool";
import { createSubscriptionRepository } from "./subscriptions";
import { createAlertDeliveryRepository } from "./alert-deliveries";
import { loadGeometryRevision } from "@/config/env";
import type { SubscriptionAction } from "./subscriptions";
import type { AlertCandidate } from "@/contracts/notifications";
const pool = database(),
  now = Date.now(),
  geometryRevision = loadGeometryRevision();
const encryption = { key: randomBytes(32).toString("base64url"), version: "synthetic-route-test" };
const repository = createSubscriptionRepository(pool, encryption),
  alerts = createAlertDeliveryRepository(pool, encryption);
const key = randomBytes(32).toString("hex"),
  eventKeys: string[] = [];
const event = () => createHash("sha256").update(randomUUID()).digest("hex");
const endpoint = (distanceKm: number) => ({ distanceKm, label: `Km ${distanceKm} del mapa`, geometryRevision });
const origin = endpoint(70),
  range = { startKm: 50, endKm: 70, label: "Synthetic route 70 to 50", geometryRevision };
const draft = () => ({ id: randomUUID(), origin: null, isTest: true, expiresAt: new Date(now + 30 * 60_000).toISOString() });
async function act(action: SubscriptionAction, at = now, eventKey = event()) {
  eventKeys.push(eventKey);
  return repository.act({
    key,
    eventKey,
    destination: "US.synthetic-route-integration",
    action,
    now: new Date(at).toISOString(),
    isTeam: true,
    isTest: true,
  });
}
const state = (at = now, eventKey = event()) => repository.routeState(key, eventKey, new Date(at).toISOString());
afterAll(async () => {
  try {
    await pool.query(
      "delete from private.alert_deliveries where subscription_id in(select id from public.subscriptions where phone_key=$1)",
      [key],
    );
    await pool.query(
      "delete from private.subscription_checkpoints where subscription_id in(select id from public.subscriptions where phone_key=$1)",
      [key],
    );
    await pool.query("delete from public.subscriptions where phone_key=$1", [key]);
    await pool.query("delete from private.delivery_contacts where phone_key=$1", [key]);
    await pool.query("delete from private.route_intake where phone_key=$1", [key]);
    await pool.query("delete from private.subscription_intake where phone_key=$1", [key]);
    await pool.query("delete from private.subscription_results where event_key=any($1::text[])", [eventKeys]);
  } finally {
    await pool.end();
  }
});
it("encrypts route drafts, preserves pin-command replay and requires explicit activation", async () => {
  const proposed = draft();
  expect(await act({ kind: "routeStart", draft: proposed })).toContain("empieza");
  const stored = await pool.query("select ciphertext from private.route_intake where phone_key=$1", [key]);
  expect(stored.rows[0].ciphertext.toString()).not.toContain(proposed.id);
  const e = event();
  const prompt = await act({ kind: "routeOrigin", draftId: proposed.id, endpoint: origin }, now, e);
  expect((await state()).draft?.origin).toEqual(origin);
  expect((await state(now, e)).reply).toBe(prompt);
  expect((await pool.query("select id from public.subscriptions where phone_key=$1", [key])).rowCount).toBe(0);
  expect(await act({ kind: "routeDestination", draftId: proposed.id, origin, range, code: "ABCDEF12" })).toContain("ACTIVAR ABCDEF12");
  expect((await state()).draft).toBeNull();
  expect(await act({ kind: "activate", code: "ABCDEF12" })).toContain("Suscripción activa");
});
it("filters events to the chosen range and sends a new event immediately after another", async () => {
  const rows = await pool.query(
    "select id,km_start::float8 as start,km_end::float8 as end from public.subscriptions where phone_key=$1 and opted_out_at is null",
    [key],
  );
  expect(rows.rows[0].start).toBe(50);
  expect(rows.rows[0].end).toBe(70);
  const id = rows.rows[0].id;
  const candidate = (name: string, km: number): AlertCandidate => ({
    key: `synthetic:${name}`,
    fingerprint: "active",
    kind: "community",
    level: 2,
    startKm: km,
    endKm: km,
    expiresAt: new Date(now + 60_000).toISOString(),
    text: "Reporte SIN CONFIRMAR: prueba",
    isTest: true,
  });
  expect(await alerts.claim(id, [candidate("outside", 49.9)], now)).toBeNull();
  const first = await alerts.claim(id, [candidate("first", 50)], now);
  if (!first) throw new Error("Missing first synthetic delivery");
  await alerts.finish(first, true, null, now);
  expect(await alerts.claim(id, [candidate("first", 50)], now + 1)).toBeNull();
  const second = await alerts.claim(id, [candidate("first", 50), candidate("second", 70)], now + 1);
  expect(second).not.toBeNull();
  if (second) await alerts.finish(second, true, null, now + 1);
});
it("keeps existing consent while a new route is drafted and cancels its final proposal", async () => {
  const proposed = draft();
  await act({ kind: "routeStart", draft: proposed });
  await act({ kind: "routeOrigin", draftId: proposed.id, endpoint: origin });
  await act({ kind: "routeDestination", draftId: proposed.id, origin, range: { ...range, startKm: 40 }, code: "ABCDEF99" });
  await act({ kind: "routeCancel" });
  expect(await act({ kind: "activate", code: "ABCDEF99" })).toContain("No hay una suscripción pendiente");
  const rows = await pool.query("select km_start::float8 as start from public.subscriptions where phone_key=$1 and opted_out_at is null", [
    key,
  ]);
  expect(rows.rows[0].start).toBe(50);
});
it("rejects expired and concurrently replaced drafts without replacing the active route", async () => {
  const old = draft();
  await act({ kind: "routeStart", draft: old });
  expect((await state(now + 31 * 60_000)).draft).toBeNull();
  expect(await act({ kind: "routeOrigin", draftId: old.id, endpoint: origin }, now + 31 * 60_000)).toContain("expiró");
  const current = draft();
  await act({ kind: "routeStart", draft: current });
  expect(await act({ kind: "routeOrigin", draftId: old.id, endpoint: origin })).toContain("cambió");
});
it("STOP erases the proposal and stops deliveries, with no browser access to route state", async () => {
  expect(await act({ kind: "stop" })).toContain("canceladas");
  expect((await state()).draft).toBeNull();
  const result = await pool.query("select has_table_privilege('anon','private.route_intake','select') as allowed");
  expect(result.rows[0].allowed).toBe(false);
  expect((await pool.query("select id from public.subscriptions where phone_key=$1 and opted_out_at is null", [key])).rowCount).toBe(0);
});
