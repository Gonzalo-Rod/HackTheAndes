import { randomUUID, createHash, randomBytes } from "node:crypto";
import { describe, it, expect, afterAll } from "vitest";
import { database } from "./pool";
import { createSubscriptionRepository } from "./subscriptions";
import { createAlertDeliveryRepository } from "./alert-deliveries";
import { loadGeometryRevision } from "@/config/env";
import type { AlertCandidate } from "@/contracts/notifications";
const pool = database();
const encryption = { key: randomBytes(32).toString("base64url"), version: "notification-test-v1" };
const subscription = createSubscriptionRepository(pool, encryption),
  delivery = createAlertDeliveryRepository(pool, encryption, "https://example.test");
const key = createHash("sha256").update(randomUUID()).digest("hex");
const now = Date.now();
const event = () => createHash("sha256").update(randomUUID()).digest("hex");
const base = { key, destination: "US.synthetic-notification-test", now: new Date(now).toISOString(), isTeam: true, isTest: true };
let subscriptionId = "";
afterAll(async () => {
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
  await pool.query("delete from private.subscription_intake where phone_key=$1", [key]);
  for (const e of events) await pool.query("delete from private.subscription_results where event_key=$1", [e]);
  await pool.end();
});
const events: string[] = [];
const act = async (action: Parameters<typeof subscription.act>[0]["action"], eventKey = event()) => {
  events.push(eventKey);
  return subscription.act({ ...base, eventKey, action });
};
const candidate = (fingerprint = "closed"): AlertCandidate => ({
  key: "synthetic:source",
  fingerprint,
  kind: "official",
  level: 3,
  startKm: 20,
  endKm: 20,
  expiresAt: new Date(now + 4 * 3_600_000).toISOString(),
  text: "SUTRAN: synthetic integration fixture",
  isTest: false,
});
describe("durable subscription and notification delivery", () => {
  it("does not activate until a valid typed consent code; replay is stable", async () => {
    const range = { startKm: 10, endKm: 30, label: "Synthetic test stretch", geometryRevision: loadGeometryRevision() };
    const e = event();
    const prompt = await act({ kind: "prepare", range, code: "ABCDEF12", isTest: true }, e);
    expect(await act({ kind: "prepare", range, code: "12345678", isTest: true }, e)).toBe(prompt);
    expect(await act({ kind: "activate", code: "FFFFFFFF" })).toContain("expiró");
    expect((await pool.query("select id from public.subscriptions where phone_key=$1", [key])).rowCount).toBe(0);
    expect(await act({ kind: "activate", code: "ABCDEF12" })).toContain("Suscripción activa");
    const result = await pool.query(
      "select s.id,c.ciphertext from public.subscriptions s join private.delivery_contacts c on c.id=s.contact_ref where s.phone_key=$1",
      [key],
    );
    subscriptionId = result.rows[0].id;
    expect(result.rows[0].ciphertext.toString()).not.toContain(base.destination);
  });
  it("does nothing for an empty evaluation", async () => expect(await delivery.claim(subscriptionId, [], now)).toBeNull());
  it("serializes concurrent workers and preserves retry identity", async () => {
    const results = await Promise.all([
      delivery.claim(subscriptionId, [candidate()], now),
      delivery.claim(subscriptionId, [candidate()], now),
    ]);
    const owned = results.find((x) => x !== null);
    expect(results.filter(Boolean)).toHaveLength(1);
    if (!owned) throw new Error("Missing lease");
    expect((await delivery.destination(owned, now))?.windowOpen).toBe(true);
    await delivery.finish(owned, false, "unavailable", now);
    const retry = await delivery.claim(subscriptionId, [candidate()], now);
    expect(retry?.id).toBe(owned.id);
    if (!retry) throw new Error("Missing retry");
    await delivery.finish(retry, true, null, now);
  });
  it("enforces the 30-minute cooldown and suppresses unchanged conditions afterward", async () => {
    expect(await delivery.claim(subscriptionId, [candidate("changed")], now + 1800000 - 1)).toBeNull();
    expect(await delivery.claim(subscriptionId, [candidate()], now + 1800000)).toBeNull();
    const changed = await delivery.claim(subscriptionId, [candidate("changed")], now + 1800000);
    expect(changed).not.toBeNull();
    if (!changed) throw new Error("Missing changed event");
    await delivery.finish(changed, false, "unavailable", now + 1800000);
  });
  it("BAJA cancels pending deliveries and prevents new sends", async () => {
    expect(await act({ kind: "stop" })).toContain("canceladas");
    expect(
      (await pool.query("select disabled_at from private.delivery_contacts where phone_key=$1", [key])).rows[0].disabled_at,
    ).not.toBeNull();
    expect(await delivery.claim(subscriptionId, [candidate("next")], now + 3600000)).toBeNull();
    const result = await pool.query(
      "select count(*)::integer as count from private.alert_deliveries where subscription_id=$1 and status='pending'",
      [subscriptionId],
    );
    expect(result.rows[0].count).toBe(0);
  });
});
