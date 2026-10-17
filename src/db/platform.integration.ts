import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { database } from "./pool";
import { recordUsageEvent } from "./usage";
import { createDashboardRepository } from "./dashboard";
import { createRateLimiter, createWebhookDeduplicator } from "./request-limits";
import { createWaitlistRepository } from "./waitlist";
import { decryptContact, encryptContact, phoneKey } from "@/integrations/security/contacts";
import { loadGeometryRevision } from "@/config/env";

const pool = database();
const key = randomBytes(32).toString("base64url");
const requestId = randomUUID();
const bucketKey = randomBytes(32).toString("hex");
const eventId = randomUUID();
const syntheticPhone = "9".repeat(9);
const contactKey = phoneKey(syntheticPhone, key) ?? "";
const repository = createDashboardRepository(pool, loadGeometryRevision());
afterAll(async () => {
  try {
    await pool.query("delete from public.waitlist where request_id=$1", [requestId]);
    await pool.query("delete from private.delivery_contacts where phone_key=$1", [contactKey]);
    await pool.query("delete from private.request_buckets where bucket_key=$1", [bucketKey]);
    await pool.query("delete from private.webhook_claims where provider='integration-test' and event_id=$1", [eventId]);
  } finally {
    await pool.end();
  }
});
it("reads validated segments, sanitized incidents and exclusion-aware stats", async () => {
  const segments = await repository.segments();
  expect(segments.features.length).toBeGreaterThan(0);
  expect(segments.features[0]?.properties.kilometerCalibration).toBe("unverified");
  expect(Array.isArray(await repository.incidents())).toBe(true);
  const stats = await repository.stats([], new Date().toISOString());
  expect(stats.exclusions).toContain("team");
});
it("durably bounds concurrent requests and resets only at a window boundary", async () => {
  const limiter = createRateLimiter(pool);
  const results = await Promise.all(Array.from({ length: 8 }, () => limiter.consume(bucketKey, 5, 1000, 500)));
  expect(results.filter(Boolean)).toHaveLength(5);
  expect(await limiter.consume(bucketKey, 5, 1000, 999)).toBe(false);
  expect(await limiter.consume(bucketKey, 5, 1000, 1000)).toBe(true);
});
it("claims a webhook event atomically across concurrent deliveries", async () => {
  const dedupe = createWebhookDeduplicator(pool);
  const results = await Promise.all(Array.from({ length: 5 }, () => dedupe.claim("integration-test", eventId)));
  expect(results.filter(Boolean)).toHaveLength(1);
});
it("retries a waitlist request without duplicates and stores no plaintext phone", async () => {
  const save = createWaitlistRepository(pool).save;
  const envelope = encryptContact(`+51${syntheticPhone}`, key, "test-v1");
  const record = {
    input: {
      requestId,
      company: "Integration test only",
      contactName: "Synthetic test",
      role: "test",
      fleetSize: 0,
      routes: ["PE-22"],
      phone: `+51${syntheticPhone}`,
      consent: true as const,
    },
    envelope,
    phoneKey: contactKey,
    now: new Date().toISOString(),
    isTeam: false,
    isTest: true,
  };
  const before = await repository.stats([], new Date().toISOString());
  await Promise.all([save(record), save(record)]);
  const rows = await pool.query("select count(*)::integer as count from public.waitlist where request_id=$1", [requestId]);
  expect(rows.rows[0]?.count).toBe(1);
  const contacts = await pool.query(
    'select ciphertext,iv,auth_tag as "authTag",key_version as "keyVersion" from private.delivery_contacts where phone_key=$1',
    [contactKey],
  );
  expect(decryptContact(contacts.rows[0], key)).toBe(`+51${syntheticPhone}`);
  const after = await repository.stats([], new Date().toISOString());
  expect(after.companiesOnWaitlist).toBe(before.companiesOnWaitlist);
});
it("allows anonymous change-signal reads while keeping operational incidents private", async () => {
  const result = await pool.query(
    "select has_table_privilege('anon','public.incident_updates','select') as signal, has_table_privilege('anon','public.incidents','select') as incidents, has_table_privilege('anon','private.delivery_contacts','select') as contacts",
  );
  expect(result.rows[0]).toEqual({ signal: true, incidents: false, contacts: false });
});

it("counts real answered queries once and excludes team, test, automation and configured phone keys", async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const scoped = createDashboardRepository(client, loadGeometryRevision());
    const before = await scoped.stats([], new Date().toISOString());
    const base = {
      provider: "integration-metrics",
      eventId: randomUUID(),
      phoneKey: contactKey,
      kind: "query_answered" as const,
      occurredAt: new Date().toISOString(),
      isTeam: false,
      isTest: false,
      isAutomated: false,
    };
    expect(await recordUsageEvent(client, base)).toBe(true);
    expect(await recordUsageEvent(client, base)).toBe(false);
    await recordUsageEvent(client, { ...base, eventId: randomUUID() });
    await recordUsageEvent(client, { ...base, eventId: randomUUID(), isTeam: true });
    await recordUsageEvent(client, { ...base, eventId: randomUUID(), isTest: true });
    await recordUsageEvent(client, { ...base, eventId: randomUUID(), isAutomated: true });
    const after = await scoped.stats([], new Date().toISOString());
    expect(after.queriesAnswered - before.queriesAnswered).toBe(2);
    expect(after.returningUsers - before.returningUsers).toBe(1);
    const excluded = await scoped.stats([contactKey], new Date().toISOString());
    expect(excluded.queriesAnswered).toBe(before.queriesAnswered);
  } finally {
    await client.query("rollback");
    client.release();
  }
});
