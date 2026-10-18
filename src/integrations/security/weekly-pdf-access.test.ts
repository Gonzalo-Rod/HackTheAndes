import { it, expect } from "vitest";
import { weeklyPdfUrl, verifyWeeklyPdfAccess } from "./weekly-pdf-access";
const id = "12345678-1234-4234-8234-123456789abc",
  secret = "synthetic-signing-secret";
it("bounds PDF access by identity, signature and expiry without contact data", () => {
  const now = 100000,
    expires = now + 3_600_000;
  const url = new URL(weeklyPdfUrl("https://example.test", id, expires, secret));
  const input = { id, ...Object.fromEntries(url.searchParams) };
  expect(verifyWeeklyPdfAccess(input, secret, now)).toBe(id);
  expect(verifyWeeklyPdfAccess(input, secret, expires)).toBeNull();
  expect(verifyWeeklyPdfAccess({ ...input, id: "22345678-1234-4234-8234-123456789abc" }, secret, now)).toBeNull();
  expect(verifyWeeklyPdfAccess({ ...input, signature: "0".repeat(64) }, secret, now)).toBeNull();
  expect(verifyWeeklyPdfAccess({ id }, secret, now)).toBeNull();
  expect(verifyWeeklyPdfAccess({ ...input, expires: now + 73 * 3_600_000 }, secret, now)).toBeNull();
});
