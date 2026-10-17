import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptContact, encryptContact, normalizePhone, phoneKey } from "./contacts";
import { readSession, SESSION_DURATION_MS, signSession } from "./session";
import { timestampWithinWindow, verifyHmacSignature } from "./webhook";

const secret = randomBytes(32).toString("base64url");
const phone = "9".repeat(9);
describe("contact security", () => {
  it("normalizes Peruvian mobile formats to a stable keyed identifier", () => {
    expect(phoneKey(phone, secret)).toBe(phoneKey(`+51 ${phone.slice(0, 3)} ${phone.slice(3)}`, secret));
    expect(phoneKey(phone, secret)).toBe(phoneKey(`0051${phone}`, secret));
    expect(normalizePhone("not a phone")).toBeNull();
    expect(phoneKey(phone, secret)).not.toBe(phoneKey(phone, "another pepper"));
  });
  it("round-trips encryption with independent IVs", () => {
    const a = encryptContact(phone, secret, "v1");
    const b = encryptContact(phone, secret, "v1");
    expect(decryptContact(a, secret)).toBe(phone);
    expect(a.iv.equals(b.iv)).toBe(false);
  });
  it("rejects changed ciphertext, tags, key versions and keys", () => {
    const envelope = encryptContact(phone, secret, "v1");
    const changed = Buffer.from(envelope.ciphertext);
    changed[0] = (changed[0] ?? 0) ^ 1;
    expect(() => decryptContact({ ...envelope, ciphertext: changed }, secret)).toThrow();
    expect(() => decryptContact({ ...envelope, authTag: randomBytes(16) }, secret)).toThrow();
    expect(() => decryptContact({ ...envelope, keyVersion: "v2" }, secret)).toThrow();
    expect(() => decryptContact(envelope, randomBytes(32).toString("base64url"))).toThrow();
  });
});
describe("raw webhook signatures and replay window", () => {
  const body = Buffer.from('{"event":"example"}');
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  it("accepts only a valid signature over unchanged bytes", () => {
    expect(verifyHmacSignature(body, signature, secret)).toBe(true);
    expect(verifyHmacSignature(body, null, secret)).toBe(false);
    expect(verifyHmacSignature(body, "0".repeat(64), secret)).toBe(false);
    expect(verifyHmacSignature(Buffer.from("changed"), signature, secret)).toBe(false);
    expect(verifyHmacSignature(body, "invalid", secret)).toBe(false);
  });
  it("rejects expired and future replays outside the exact window", () => {
    expect(timestampWithinWindow(0, 300_000)).toBe(true);
    expect(timestampWithinWindow(0, 300_001)).toBe(false);
    expect(timestampWithinWindow(600_001, 300_000)).toBe(false);
    expect(timestampWithinWindow(Number.NaN, 0)).toBe(false);
  });
});
it("authenticates cookies, rejects modification and expires at the boundary", () => {
  const session = { organizationId: "e2966a11-82e0-4885-930a-1ab8935a0368", issuedAtMs: 1000, expiresAtMs: 1000 + SESSION_DURATION_MS };
  const token = signSession(session, secret);
  expect(readSession(token, secret, 1000)).toEqual(session);
  expect(readSession(token, secret, session.expiresAtMs)).toBeNull();
  expect(readSession(token, secret, 999)).toBeNull();
  expect(readSession(`${token}x`, secret, 1000)).toBeNull();
  expect(readSession(token, "wrong", 1000)).toBeNull();
});
