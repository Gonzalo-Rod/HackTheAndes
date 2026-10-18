import { describe, it, expect } from "vitest";
import { planAlerts, isCommunityAlertEligible } from "./policy";
import type { AlertCandidate } from "@/contracts/notifications";
const NOW = Date.parse("2026-10-18T03:30:00Z");
const range = { startKm: 10, endKm: 30, isTest: false };
const candidate = (v: Partial<AlertCandidate> = {}): AlertCandidate => ({
  key: "source:one",
  fingerprint: "closed",
  kind: "official",
  level: 3,
  startKm: 20,
  endKm: 20,
  expiresAt: new Date(NOW + 60_000).toISOString(),
  text: "SUTRAN: interrumpido",
  isTest: false,
  ...v,
});
describe("Event-triggered material alert policy without quiet hours", () => {
  it("allows a relevant closure at 22:30 Lima", () => expect(planAlerts([candidate()], {}, range, NOW).selected).toHaveLength(1));
  it("does not repeat unchanged conditions", () =>
    expect(planAlerts([candidate()], { "source:one": { fingerprint: "closed", level: 3 } }, range, NOW).selected).toHaveLength(0));
  it("includes exact stretch boundaries", () =>
    expect(planAlerts([candidate({ startKm: 30, endKm: 30 })], {}, range, NOW).selected).toHaveLength(1));
  it("rejects outside stretches and expired events", () =>
    expect(
      planAlerts([candidate({ startKm: 31, endKm: 32 }), candidate({ expiresAt: new Date(NOW).toISOString() })], {}, range, NOW).selected,
    ).toHaveLength(0));
  it("does not treat initial normal status as an alert", () =>
    expect(planAlerts([candidate({ level: 0, fingerprint: "normal" })], {}, range, NOW).selected).toHaveLength(0));
  it("alerts on an explicit official return to normal", () =>
    expect(
      planAlerts([candidate({ level: 0, fingerprint: "normal" })], { "source:one": { fingerprint: "closed", level: 3 } }, range, NOW)
        .selected,
    ).toHaveLength(1));
  it("alerts on estimated exposure escalation but not decreases", () => {
    const c = candidate({ kind: "exposure", fingerprint: "priority", level: 2 });
    expect(planAlerts([c], {}, range, NOW).selected).toHaveLength(1);
    expect(planAlerts([c], { "source:one": { fingerprint: "high_attention", level: 3 } }, range, NOW).selected).toHaveLength(0);
  });
  it("keeps unknown inputs from resetting a prior assessed level", () =>
    expect(
      planAlerts(
        [candidate({ kind: "exposure", level: -1, fingerprint: "unknown" })],
        { "source:one": { fingerprint: "priority", level: 2 } },
        range,
        NOW,
      ).checkpoint["source:one"],
    ).toEqual({ fingerprint: "priority", level: 2 }));
  it("never sends demonstrations to production subscribers", () =>
    expect(planAlerts([candidate({ isTest: true })], {}, range, NOW).selected).toHaveLength(0));
  it("allows demonstrations for explicitly consenting test subscribers", () =>
    expect(planAlerts([candidate({ isTest: true })], {}, { ...range, isTest: true }, NOW).selected).toHaveLength(1));
  it("bundles three updates and preserves overflow for later", () => {
    const c = Array.from({ length: 5 }, (_, i) => candidate({ key: `source:${i}` }));
    const p = planAlerts(c, {}, range, NOW);
    expect(p.selected).toHaveLength(3);
    expect(planAlerts(c, p.checkpoint, range, NOW).selected).toHaveLength(2);
  });
});

it("delivers new reported events before a large climate batch without losing the climate backlog", () => {
  const exposure = Array.from({ length: 40 }, (_, i) => candidate({ key: `exposure:${i}`, kind: "exposure", level: 3 }));
  const report = candidate({ key: "community:new", kind: "community", level: 2 });
  const first = planAlerts([...exposure, report], {}, range, NOW);
  expect(first.selected.map((c) => c.key)).toEqual(["community:new"]);
  const second = planAlerts([...exposure, report], first.checkpoint, range, NOW + 1);
  expect(second.selected).toHaveLength(40);
  expect(planAlerts([...exposure, report], second.checkpoint, range, NOW + 2).selected).toHaveLength(0);
});
it("allows unconfirmed public reports, keeping team/test isolation and inactive reports out", () => {
  expect(isCommunityAlertEligible({ isTest: false, isTeam: false, status: "active" })).toBe(true);
  expect(isCommunityAlertEligible({ isTest: false, isTeam: true, status: "active" })).toBe(false);
  expect(isCommunityAlertEligible({ isTest: true, isTeam: true, status: "active" })).toBe(true);
  expect(isCommunityAlertEligible({ isTest: false, isTeam: false, status: "cleared" })).toBe(false);
});
