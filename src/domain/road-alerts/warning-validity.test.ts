import { expect, it } from "vitest";
import { warningValidity } from "./warning-validity";
it("treats official validity as UTC with an exclusive expiry boundary", () => {
  const start = "2026-10-17T18:00:00Z";
  const end = "2026-10-18T18:00:00Z";
  expect(warningValidity(start, end, Date.parse(start) - 1)).toBe("future");
  expect(warningValidity(start, end, Date.parse(start))).toBe("active");
  expect(warningValidity(start, end, Date.parse(end))).toBe("expired");
  expect(warningValidity(null, end, Date.parse(start))).toBe("unknown");
});
