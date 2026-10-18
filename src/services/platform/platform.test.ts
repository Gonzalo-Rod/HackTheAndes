import { randomBytes } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createAccessService } from "./access";
import type { WaitlistRecord } from "@/db/waitlist";
import { createWaitlistService } from "./waitlist";
import { platformRoute, readJson } from "./http";
import { z } from "zod";
import { keyedDigest } from "@/integrations/security/contacts";
import { signSession } from "@/integrations/security/session";
import { WaitlistInputSchema } from "@/contracts/platform";

const secret = randomBytes(32).toString("base64url");
const organizationId = "e2966a11-82e0-4885-930a-1ab8935a0368";
const nowMs = Date.parse("2026-10-17T12:00:00Z");
const pass = {
  organizationId,
  phoneKey: null,
  plan: "company_predictions" as const,
  status: "active" as const,
  startsAt: "2026-10-17T00:00:00Z",
  expiresAt: "2026-10-18T00:00:00Z",
};
const limiter = { consume: vi.fn(async () => true) };
const repository = {
  findOrganization: vi.fn(async (hash: string) => ({ id: organizationId, hash })),
  passes: vi.fn(async () => [pass]),
  reports: vi.fn(async () => []),
};
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://example.test/api/access", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

it("rejects missing sessions and a pass that expires after login", async () => {
  let now = nowMs;
  const service = createAccessService({ repository, limiter, secret, now: () => now });
  await expect(service.requireAccess(new Request("https://example.test"))).rejects.toMatchObject({ status: 401 });
  const response = await service.login(request({ code: "example-access-code" }));
  expect(repository.findOrganization).toHaveBeenLastCalledWith(keyedDigest("example-access-code", secret, "organization-code-v1"));
  expect(response.headers.get("Set-Cookie")).toContain("HttpOnly; SameSite=Strict");
  expect(response.headers.get("Set-Cookie")).toContain("Secure");
  const token = signSession({ organizationId, issuedAtMs: nowMs, expiresAtMs: nowMs + 60_000 }, secret);
  const withCookie = new Request("https://example.test", { headers: { cookie: `peruroad_session=${token}` } });
  expect((await service.requireAccess(withCookie)).organizationId).toBe(organizationId);
  now = Date.parse(pass.expiresAt);
  await expect(service.requireAccess(withCookie)).rejects.toMatchObject({ status: 401 });
});
it("rejects wrong organizations and inactive plans even with a signed cookie", async () => {
  const noPassRepository = { ...repository, passes: vi.fn(async () => []) };
  const service = createAccessService({ repository: noPassRepository, limiter, secret, now: () => nowMs });
  const token = signSession({ organizationId, issuedAtMs: nowMs, expiresAtMs: nowMs + 60_000 }, secret);
  await expect(
    service.requireAccess(new Request("https://example.test", { headers: { cookie: `peruroad_session=${token}` } })),
  ).rejects.toMatchObject({ status: 403 });
});
it("rate limits login before database lookup", async () => {
  const service = createAccessService({ repository, limiter: { consume: async () => false }, secret, now: () => nowMs });
  await expect(service.login(request({ code: "example-access-code" }))).rejects.toMatchObject({ status: 429 });
});
it("bounds input bytes, checks origin and rejects malformed/unexpected JSON", async () => {
  await expect(readJson(request({ data: "x".repeat(5000) }), z.unknown())).rejects.toMatchObject({ status: 413 });
  await expect(readJson(request({}, { Origin: "https://foreign.test" }), z.unknown())).rejects.toMatchObject({ status: 403 });
  await expect(readJson(request({ unexpected: true }), z.object({}).strict())).rejects.toMatchObject({ status: 400 });
  await expect(
    readJson(
      new Request("https://example.test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }),
      z.unknown(),
    ),
  ).rejects.toMatchObject({ status: 400 });
});
it("never exposes infrastructure error text in HTTP responses", async () => {
  const handler = platformRoute("test", async () => {
    throw new Error("private SQL and secret");
  });
  const response = await handler(new Request("https://example.test"));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private SQL");
});
it("waitlist requires consent, stores encrypted phone and ignores client flags", async () => {
  const phone = "9".repeat(9);
  const body = {
    requestId: crypto.randomUUID(),
    company: "Example company",
    contactName: "Example person",
    role: "Dispatcher",
    fleetSize: 3,
    routes: ["PE-22"],
    phone,
    consent: true,
  };
  expect(WaitlistInputSchema.safeParse({ ...body, consent: false }).success).toBe(false);
  expect(WaitlistInputSchema.safeParse({ ...body, isTeam: false }).success).toBe(false);
  const save = vi.fn<(record: WaitlistRecord) => Promise<void>>().mockResolvedValue(undefined);
  const service = createWaitlistService({
    repository: { save },
    limiter,
    now: () => nowMs,
    config: {
      CONTACT_ENCRYPTION_KEY: secret,
      CONTACT_KEY_VERSION: "v1",
      PHONE_KEY_PEPPER: secret,
      SESSION_SIGNING_SECRET: secret,
      TEAM_PHONE_KEYS: [],
      TEST_PHONE_KEYS: [],
    },
  });
  const response = await service(request(body));
  expect(response.status).toBe(202);
  const record = save.mock.calls[0]?.[0];
  expect(record).toHaveProperty("envelope");
  // The adapter receives input for non-sensitive fields, but only the envelope is persisted as contact data.
  expect(save).toHaveBeenCalledOnce();
});
