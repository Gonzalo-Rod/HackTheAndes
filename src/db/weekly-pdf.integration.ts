import { randomBytes, randomUUID, createHash } from "node:crypto";
import { afterAll, it, expect } from "vitest";
import { database } from "./pool";
import { createSubscriptionRepository } from "./subscriptions";
import { createWeeklyPdfRepository } from "./weekly-pdf";
import { readWeeklyObservations } from "./weekly-observations";
import { loadGeometryRevision } from "@/config/env";
import { syntheticWeeklyReport } from "@/test-fixtures/weekly-report";
const pool = database(),
  encryption = { key: randomBytes(32).toString("base64url"), version: "synthetic-weekly-test" };
const preferences = createSubscriptionRepository(pool, encryption),
  repository = createWeeklyPdfRepository(pool, encryption);
const key = randomBytes(32).toString("hex"),
  now = Date.now();
const range = { startKm: 0, endKm: 10, label: "Synthetic weekly integration", geometryRevision: loadGeometryRevision() };
const events: string[] = [];
async function act(
  action: Parameters<typeof preferences.act>[0]["action"],
  eventKey = createHash("sha256").update(randomUUID()).digest("hex"),
) {
  events.push(eventKey);
  return preferences.act({
    key,
    eventKey,
    destination: "US.synthetic-weekly-pdf",
    action,
    now: new Date(now).toISOString(),
    isTeam: true,
    isTest: true,
  });
}
afterAll(async () => {
  try {
    await pool.query(
      "delete from private.subscription_checkpoints where subscription_id in(select id from public.subscriptions where phone_key=$1)",
      [key],
    );
    await pool.query("delete from public.subscriptions where phone_key=$1", [key]);
    await pool.query("delete from private.delivery_contacts where phone_key=$1", [key]);
    await pool.query("delete from private.subscription_intake where phone_key=$1", [key]);
    await pool.query("delete from private.subscription_results where event_key=any($1::text[])", [events]);
  } finally {
    await pool.end();
  }
});
it("requires separate typed weekly consent and preserves replayed command results", async () => {
  expect(await act({ kind: "weeklyPrepare", code: "ABCDEF12" })).toContain("Primero");
  await act({ kind: "prepare", range, code: "12345678", isTest: true });
  await act({ kind: "activate", code: "12345678" });
  expect(await repository.targets(range.geometryRevision, key)).toHaveLength(0);
  const event = createHash("sha256").update(randomUUID()).digest("hex");
  const prompt = await act({ kind: "weeklyPrepare", code: "ABCDEF12" }, event);
  expect(await act({ kind: "weeklyPrepare", code: "00000000" }, event)).toBe(prompt);
  expect(await act({ kind: "weeklyActivate", code: "FFFFFFFF" })).toContain("expiró");
  expect(await act({ kind: "weeklyActivate", code: "ABCDEF12" })).toContain("activado");
  expect(await repository.targets(range.geometryRevision, key)).toHaveLength(1);
});
it("serializes delivery leases, preserves PDF retries and enforces browser isolation", async () => {
  const [target] = await repository.targets(range.geometryRevision, key);
  if (!target) throw new Error("Missing synthetic consent");
  const report = syntheticWeeklyReport();
  report.range = range;
  const claims = await Promise.all([
    repository.claim(target.id, report.period, now, target.consentAt),
    repository.claim(target.id, report.period, now, target.consentAt),
  ]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  const delivery = claims.find(Boolean);
  if (!delivery) throw new Error("Missing synthetic lease");
  await repository.save(delivery, report, Buffer.from("%PDF-synthetic integration artifact"));
  expect((await repository.destination(delivery, now))?.windowOpen).toBe(true);
  await repository.finish(delivery, "notified", null, now, "synthetic-notice");
  const retry = await repository.claim(target.id, report.period, now + 1, target.consentAt);
  expect(retry?.id).toBe(delivery.id);
  expect(retry?.report?.range).toEqual(range);
  expect(await repository.pdf(delivery.id, now)).not.toBeNull();
  const grants = await pool.query("select has_table_privilege('anon','private.weekly_pdf_deliveries','select') as allowed");
  expect(grants.rows[0].allowed).toBe(false);
  if (!retry) throw new Error("Missing retry");
  await repository.finish(retry, "pending", "unavailable", now + 1);
});
it("weekly-only opt-out leaves short alerts active and revokes pending PDF access", async () => {
  const [target] = await repository.targets(range.geometryRevision, key);
  if (!target) throw new Error("Missing target");
  expect(await act({ kind: "weeklyStop" })).toContain("alertas cortas siguen activas");
  expect(await repository.targets(range.geometryRevision, key)).toHaveLength(0);
  const active = await pool.query("select id from public.subscriptions where phone_key=$1 and opted_out_at is null", [key]);
  expect(active.rowCount).toBe(1);
  const rows = await pool.query("select id,status from private.weekly_pdf_deliveries where subscription_id=$1", [target.id]);
  expect(rows.rows[0].status).toBe("cancelled");
  expect(await repository.pdf(rows.rows[0].id, now)).toBeNull();
});
it("BAJA cancels weekly consent and short alerts; real-data counts are sanitized", async () => {
  await act({ kind: "weeklyPrepare", code: "ABCDEF12" });
  await act({ kind: "weeklyActivate", code: "ABCDEF12" });
  expect(await act({ kind: "stop" })).toContain("canceladas");
  expect(await repository.targets(range.geometryRevision, key)).toHaveLength(0);
  const period = {
    start: new Date(now - 7 * 24 * 3_600_000).toISOString(),
    end: new Date(now).toISOString(),
    key: "synthetic-observation-check",
  };
  const result = await readWeeklyObservations(pool, range, period, false);
  expect(result.officialEnvironmentalAlerts).toBeGreaterThanOrEqual(0);
  expect(result.communityEnvironmentalIncidents).toBeGreaterThanOrEqual(0);
  expect(Object.keys(result)).not.toContain("phone_key");
});
