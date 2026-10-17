import { expect, it } from "vitest";
import { activePass, type AccessPass } from "./entitlements";
const pass: AccessPass = {
  organizationId: "e2966a11-82e0-4885-930a-1ab8935a0368",
  phoneKey: null,
  plan: "company_predictions",
  status: "active",
  startsAt: "2026-10-17T00:00:00Z",
  expiresAt: "2026-10-18T00:00:00Z",
};
const subject = { organizationId: pass.organizationId ?? "" };
const now = Date.parse("2026-10-17T12:00:00Z");
it("requires a pass for the correct organization, plan and status", () => {
  expect(activePass([], subject, "dashboard", now)).toBeNull();
  expect(activePass([pass], subject, "predictions", now)).toBe(pass);
  expect(activePass([pass], { organizationId: "other" }, "dashboard", now)).toBeNull();
  expect(activePass([{ ...pass, plan: "company_dashboard" }], subject, "predictions", now)).toBeNull();
  expect(activePass([{ ...pass, status: "cancelled" }], subject, "dashboard", now)).toBeNull();
});
it("handles start, expiry during a trip and UTC/Lima date boundaries", () => {
  expect(activePass([pass], subject, "dashboard", Date.parse(pass.startsAt ?? ""))).toBe(pass);
  expect(activePass([pass], subject, "dashboard", Date.parse(pass.expiresAt ?? ""))).toBeNull();
  expect(activePass([pass], subject, "dashboard", Date.parse("2026-10-16T19:00:00-05:00"))).toBe(pass);
  expect(activePass([pass], subject, "dashboard", Date.parse("2026-10-17T19:00:00-05:00"))).toBeNull();
});
