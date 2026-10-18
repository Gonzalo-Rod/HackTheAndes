import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { database } from "./pool";
import { createSubscriptionRepository } from "./subscriptions";
import { createAlertPassRequestRepository } from "./alert-pass-requests";
import { createAlertPassFulfilment } from "./alert-pass-fulfilment";
import { createAlertDeliveryRepository } from "./alert-deliveries";
import { expireAlertPasses } from "./expire-alert-passes";
import { loadGeometryRevision } from "@/config/env";
import type { AlertCandidate } from "@/contracts/notifications";
import type { SettledPurchase } from "@/contracts/alert-passes";

const pool = database(),
  now = Date.now();
const encryption = { key: randomBytes(32).toString("base64url"), version: "synthetic-alert-pass" };
const subscriptions = createSubscriptionRepository(pool, encryption),
  requests = createAlertPassRequestRepository(pool, encryption);
const fulfil = createAlertPassFulfilment(pool, encryption, { itemId: 123, digitalQuantity: "synthetic-usd" });
const deliveries = createAlertDeliveryRepository(pool, encryption);
const keys: string[] = [],
  events: string[] = [];
const range = { startKm: 10, endKm: 30, label: "Synthetic paid test", geometryRevision: loadGeometryRevision() };
function event() {
  const key = randomBytes(32).toString("hex");
  events.push(key);
  return key;
}
async function prepare(isTest = false) {
  const key = randomBytes(32).toString("hex");
  keys.push(key);
  const input = { key, now: new Date(now).toISOString(), destination: "US.synthetic-paid-pass", isTeam: !isTest, isTest };
  const proposal = await subscriptions.act({
    ...input,
    eventKey: event(),
    action: { kind: "prepare", code: "ABCDEF12", range, isTest: false },
  });
  const activationEvent = event();
  const reply = await subscriptions.act({ ...input, eventKey: activationEvent, action: { kind: "activate", code: "ABCDEF12" } });
  const r = await pool.query("select id from private.alert_pass_requests where phone_key=$1", [key]);
  const id = String(r.rows[0].id);
  return { key, id, input, activationEvent, proposal, reply, expiresAt: now + 7 * 24 * 3_600_000 };
}
function purchase(transactionId = randomUUID()): SettledPurchase {
  return {
    transaction_id: transactionId,
    catalog_item_id: 123,
    amount: "0.001",
    dq: "synthetic-usd",
    settled_at: new Date(now + 1).toISOString(),
    dispatch_status: "pending",
  };
}
const candidate = (expiresAt: number): AlertCandidate => ({
  key: "synthetic:paid-alert",
  fingerprint: "closed",
  kind: "official",
  level: 3,
  startKm: 20,
  endKm: 20,
  expiresAt: new Date(expiresAt).toISOString(),
  text: "Synthetic alert",
  isTest: false,
});
afterAll(async () => {
  try {
    await pool.query("update public.subscriptions set alert_payment_id=null where phone_key=any($1::text[])", [keys]);
    await pool.query("delete from private.alert_pass_requests where phone_key=any($1::text[])", [keys]);
    for (const table of ["alert_deliveries", "subscription_checkpoints", "weekly_pdf_preferences", "weekly_pdf_deliveries"])
      await pool.query(
        `delete from private.${table} where subscription_id in(select id from public.subscriptions where phone_key=any($1::text[]))`,
        [keys],
      );
    await pool.query("delete from public.subscriptions where phone_key=any($1::text[])", [keys]);
    await pool.query("delete from private.delivery_contacts where phone_key=any($1::text[])", [keys]);
    await pool.query("delete from private.subscription_intake where phone_key=any($1::text[])", [keys]);
    await pool.query("delete from private.subscription_results where event_key=any($1::text[])", [events]);
  } finally {
    await pool.end();
  }
});
it("requires settled payment after typed consent and stores a durable request", async () => {
  const p = await prepare();
  expect(p.reply).toContain("USD 0,001");
  expect(p.reply).toContain("Aún no está activa");
  expect((await pool.query("select id from public.subscriptions where phone_key=$1", [p.key])).rowCount).toBe(0);
  const a = await requests.claim(p.key, now + 2, p.activationEvent),
    b = await requests.claim(p.key, now + 2, p.activationEvent);
  expect(a?.leaseId).toBeTruthy();
  expect(b?.leaseId).toBeNull();
  if (!a?.leaseId) throw new Error("Missing checkout lease");
  const url = "https://checkout.m.todaq.net/checkout/synthetic-private";
  expect(await requests.save(p.id, a.leaseId, url, now + 2)).toBe(true);
  expect((await requests.claim(p.key, now + 3))?.url).toBe(url);
  const stored = await pool.query("select checkout_url,ciphertext from private.alert_pass_requests where id=$1", [p.id]);
  expect(JSON.stringify(stored.rows)).not.toContain("synthetic-private");
  expect(JSON.stringify(stored.rows)).not.toContain(p.input.destination);
  expect(await subscriptions.act({ ...p.input, eventKey: p.activationEvent, action: { kind: "activate", code: "ABCDEF12" } })).toBe(
    p.reply,
  );
});
it("activates once under concurrent callbacks without moving the original expiry", async () => {
  const p = await prepare(),
    sale = purchase();
  const results = await Promise.all([fulfil(p.id, sale.transaction_id, sale, now + 2), fulfil(p.id, sale.transaction_id, sale, now + 2)]);
  expect(results.map((r) => r.status).sort()).toEqual(["active", "already_processed"]);
  const rows = await pool.query("select alert_expires_at from public.subscriptions where phone_key=$1", [p.key]);
  expect(rows.rowCount).toBe(1);
  expect(rows.rows[0].alert_expires_at.getTime()).toBe(p.expiresAt);
});
it("cannot spend one settled transaction on two requests", async () => {
  const first = await prepare(),
    second = await prepare(),
    sale = purchase();
  expect((await fulfil(first.id, sale.transaction_id, sale, now + 2)).ok).toBe(true);
  expect((await fulfil(second.id, sale.transaction_id, sale, now + 2)).status).toBe("transaction_already_used");
});
it("STOP prevents a delayed payment callback from restoring consent", async () => {
  const p = await prepare(),
    sale = purchase();
  await subscriptions.act({ ...p.input, eventKey: event(), action: { kind: "stop" } });
  expect((await fulfil(p.id, sale.transaction_id, sale, now + 2)).status).toBe("request_unavailable");
  expect((await pool.query("select id from public.subscriptions where phone_key=$1", [p.key])).rowCount).toBe(0);
});
it("blocks an already-claimed delivery at the exact expiry, even before cleanup", async () => {
  const p = await prepare(),
    sale = purchase();
  await fulfil(p.id, sale.transaction_id, sale, now + 2);
  const row = await pool.query("select id from public.subscriptions where phone_key=$1", [p.key]);
  const id = String(row.rows[0].id);
  const claimed = await deliveries.claim(id, [candidate(p.expiresAt + 3_600_000)], p.expiresAt - 1);
  if (!claimed) throw new Error("Missing delivery before expiry");
  expect(await deliveries.destination(claimed, p.expiresAt - 1)).not.toBeNull();
  expect(await deliveries.destination(claimed, p.expiresAt)).toBeNull();
  expect(await deliveries.claim(id, [candidate(p.expiresAt + 3_600_000)], p.expiresAt)).toBeNull();
  await expireAlertPasses(pool, p.expiresAt);
  expect((await pool.query("select opted_out_at from public.subscriptions where id=$1", [id])).rows[0].opted_out_at.getTime()).toBe(
    p.expiresAt,
  );
  expect((await fulfil(p.id, sale.transaction_id, sale, p.expiresAt + 1)).status).toBe("already_processed");
  expect(await deliveries.claim(id, [candidate(p.expiresAt + 3_600_000)], p.expiresAt + 1)).toBeNull();
});
it("rejects wrong items/currencies and payments after the seven-day deadline", async () => {
  const p = await prepare(),
    sale = purchase();
  expect((await fulfil(p.id, sale.transaction_id, { ...sale, dq: "other" }, now + 2)).status).toBe("invalid_purchase");
  expect((await fulfil(p.id, sale.transaction_id, { ...sale, catalog_item_id: 999 }, now + 2)).status).toBe("invalid_purchase");
  expect((await fulfil(p.id, sale.transaction_id, sale, p.expiresAt)).status).toBe("request_unavailable");
});
it("unconfigured senders cannot get a free pass by typing PRUEBA", async () => {
  const key = randomBytes(32).toString("hex");
  keys.push(key);
  const input = { key, now: new Date(now).toISOString(), destination: "US.synthetic-demo-bypass", isTeam: false, isTest: false };
  await subscriptions.act({ ...input, eventKey: event(), action: { kind: "prepare", code: "ABCDEF12", range, isTest: true } });
  expect(await subscriptions.act({ ...input, eventKey: event(), action: { kind: "activate", code: "ABCDEF12" } })).toContain("Qatom");
  expect((await pool.query("select id from public.subscriptions where phone_key=$1", [key])).rowCount).toBe(0);
});
it("keeps the new payment ledger private", async () => {
  const r = await pool.query(
    "select has_table_privilege('anon','private.alert_pass_requests','select') as anon,has_table_privilege('peruroad_backend','private.alert_pass_requests','select') as backend",
  );
  expect(r.rows[0]).toEqual({ anon: false, backend: true });
});

it("requires actual settlement for an explicit payment test and preserves test exclusion after activation", async () => {
  const p = await prepare(true);
  expect(p.proposal).toContain("PRUEBA DE PAGO REAL");
  expect(p.reply).toContain("Aún no está activa");
  expect((await pool.query("select id from public.subscriptions where phone_key=$1", [p.key])).rowCount).toBe(0);
  const request = await pool.query("select is_test,is_team,status from private.alert_pass_requests where id=$1", [p.id]);
  expect(request.rows[0]).toEqual({ is_test: true, is_team: false, status: "pending" });
  const sale = purchase();
  expect((await fulfil(p.id, sale.transaction_id, sale, now + 2)).status).toBe("active");
  const active = await pool.query("select is_test,alert_payment_id from public.subscriptions where phone_key=$1", [p.key]);
  expect(active.rows[0]).toEqual({ is_test: true, alert_payment_id: p.id });
});
it("retains free DEMO activation only when both sender and proposal are test-marked", async () => {
  const key = randomBytes(32).toString("hex");
  keys.push(key);
  const input = { key, now: new Date(now).toISOString(), destination: "US.synthetic-free-demo", isTeam: false, isTest: true };
  await subscriptions.act({ ...input, eventKey: event(), action: { kind: "prepare", code: "ABCDEF12", range, isTest: true } });
  expect(await subscriptions.act({ ...input, eventKey: event(), action: { kind: "activate", code: "ABCDEF12" } })).toContain(
    "DEMO · Suscripción activa",
  );
  expect((await pool.query("select id from private.alert_pass_requests where phone_key=$1", [key])).rowCount).toBe(0);
  expect((await pool.query("select is_test,alert_payment_id from public.subscriptions where phone_key=$1", [key])).rows[0]).toEqual({
    is_test: true,
    alert_payment_id: null,
  });
});
