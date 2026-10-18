import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { database } from "./pool";
import { createPostgresWebhookProcessor } from "./webhook-processor";
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
const deliveryKeys: string[] = [];
function deliveryKey() {
  const key = randomUUID();
  deliveryKeys.push(createHash("sha256").update(key).digest("hex"));
  return key;
}
const syntheticPhone = "9".repeat(9);
const contactKey = phoneKey(syntheticPhone, key) ?? "";
const repository = createDashboardRepository(pool, loadGeometryRevision());
afterAll(async () => {
  try {
    await pool.query("delete from private.messaging_deliveries where provider='integration-test' and message_key=any($1::text[])", [
      deliveryKeys,
    ]);
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

it("makes failed sends retryable and completed messages durable across processor instances", async () => {
  const key = deliveryKey();
  const processor = createPostgresWebhookProcessor(pool);
  await expect(
    processor.processOnce("integration-test", key, async () => {
      throw new Error("synthetic provider failure");
    }),
  ).rejects.toThrow();
  let executions = 0;
  expect(
    await processor.processOnce("integration-test", key, async () => {
      executions++;
    }),
  ).toBe(true);
  expect(
    await createPostgresWebhookProcessor(pool).processOnce("integration-test", key, async () => {
      executions++;
    }),
  ).toBe(false);
  expect(executions).toBe(1);
});
it("does not acknowledge an active lease as completed or retain a database connection during work", async () => {
  const key = deliveryKey();
  const processor = createPostgresWebhookProcessor(pool);
  let releaseWork = () => {};
  let startWork = () => {};
  const started = new Promise<void>((resolve) => {
    startWork = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseWork = resolve;
  });
  const first = processor.processOnce("integration-test", key, async () => {
    startWork();
    await released;
  });
  try {
    await started;
    await expect(
      processor.processOnce("integration-test", key, async () => {
        throw new Error("must not execute");
      }),
    ).rejects.toThrow("already in progress");
    // No checked-out client survives across the async provider callback.
    expect(pool.idleCount).toBe(pool.totalCount);
  } finally {
    releaseWork();
    await first;
  }
});
it("reclaims an expired lease after a simulated serverless crash", async () => {
  const key = deliveryKey();
  const messageKey = createHash("sha256").update(key).digest("hex");
  await pool.query(
    "insert into private.messaging_deliveries(provider,message_key,lease_id,lease_until) values('integration-test',$1,$2,clock_timestamp()-interval '1 second')",
    [messageKey, randomUUID()],
  );
  expect(await createPostgresWebhookProcessor(pool).processOnce("integration-test", key, async () => undefined)).toBe(true);
  const grants = await pool.query(
    "select has_table_privilege('anon','private.messaging_deliveries','select') as browser_read, has_table_privilege('authenticated','private.messaging_deliveries','insert') as browser_write",
  );
  expect(grants.rows[0]).toEqual({ browser_read: false, browser_write: false });
});
