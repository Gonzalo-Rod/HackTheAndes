import { describe, expect, it } from "vitest";
import {
  applyClearingEvent,
  COMMUNITY_EXPIRY_MS,
  computeConfidence,
  CONFIDENCE_HALF_LIFE_MS,
  CORROBORATED_THRESHOLD,
  type ClearingState,
  type CommunityEvidence,
} from "./confidence";

const NOW_MS = Date.parse("2026-10-18T03:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

const evidence = (overrides: Partial<CommunityEvidence> = {}): CommunityEvidence => ({
  independentReporters: 1,
  reputableReporters: 0,
  hasSharedPin: false,
  hasPhoto: false,
  confirmedByCall: false,
  officialMatch: false,
  exposureAgrees: false,
  lastConfirmedAt: iso(NOW_MS),
  ...overrides,
});

describe("computeConfidence", () => {
  it("keeps a single fresh report at the unconfirmed placeholder", () => {
    expect(computeConfidence(evidence(), NOW_MS)).toEqual({
      score: 0.2,
      level: "unconfirmed",
      reasons: [{ reason: "first_report", points: 0.2 }],
    });
  });

  it("never corroborates a single reporter, whatever else they send", () => {
    const result = computeConfidence(evidence({ hasSharedPin: true, hasPhoto: true, reputableReporters: 1 }), NOW_MS);
    expect(result.score).toBeLessThan(CORROBORATED_THRESHOLD);
    expect(result.level).toBe("unconfirmed");
  });

  it("corroborates two independent reporters with a shared pin", () => {
    const result = computeConfidence(evidence({ independentReporters: 2, hasSharedPin: true }), NOW_MS);
    expect(result).toMatchObject({ score: 0.4, level: "corroborated" });
  });

  it("stops adding points after four reporters and caps community evidence", () => {
    const four = computeConfidence(evidence({ independentReporters: 4 }), NOW_MS).score;
    expect(computeConfidence(evidence({ independentReporters: 40 }), NOW_MS).score).toBe(four);

    const everything = evidence({
      independentReporters: 10,
      reputableReporters: 10,
      hasSharedPin: true,
      hasPhoto: true,
      confirmedByCall: true,
      exposureAgrees: true,
    });
    expect(computeConfidence(everything, NOW_MS)).toMatchObject({ score: 0.75, level: "corroborated" });
  });

  it("does not count more reputable reporters than reporters", () => {
    expect(computeConfidence(evidence({ reputableReporters: 2 }), NOW_MS).reasons).toContainEqual({
      reason: "reputable_reporters",
      points: 0.05,
    });
  });

  it("halves community evidence after one half-life without confirmation", () => {
    const result = computeConfidence(
      evidence({ independentReporters: 2, hasSharedPin: true, lastConfirmedAt: iso(NOW_MS - CONFIDENCE_HALF_LIFE_MS) }),
      NOW_MS,
    );
    expect(result.score).toBe(0.2);
    expect(result.level).toBe("unconfirmed");
    expect(result.reasons.at(-1)).toEqual({ reason: "decay", points: -0.2 });
  });

  it("treats a future confirmation time as fresh", () => {
    expect(computeConfidence(evidence({ lastConfirmedAt: iso(NOW_MS + 60_000) }), NOW_MS).score).toBe(0.2);
  });

  it("raises a matching official incident to the official band, even when community evidence decayed", () => {
    const result = computeConfidence(evidence({ officialMatch: true, lastConfirmedAt: iso(NOW_MS - 24 * 60 * 60_000) }), NOW_MS);
    expect(result.level).toBe("official");
    expect(result.score).toBe(0.9);
    expect(result.reasons.map((item) => item.reason)).toEqual(["first_report", "decay", "official_match"]);
  });

  it("explains the score: the reasons add up to it", () => {
    const result = computeConfidence(
      evidence({ independentReporters: 3, confirmedByCall: true, lastConfirmedAt: iso(NOW_MS - 3_600_000) }),
      NOW_MS,
    );
    const total = result.reasons.reduce((sum, item) => sum + item.points, 0);
    expect(total).toBeCloseTo(result.score, 2);
  });
});

describe("applyClearingEvent", () => {
  const active: ClearingState = { status: "active", clearingReporters: [], lastConfirmedAt: iso(NOW_MS) };
  const at = iso(NOW_MS + 60_000);

  it("marks an incident as clearing on the first clearing report", () => {
    expect(applyClearingEvent(active, { kind: "clearing_report", reporterKey: "a", at })).toMatchObject({
      status: "clearing",
      clearingReporters: ["a"],
    });
  });

  it("clears after two independent clearing reports, not two from the same person", () => {
    const once = applyClearingEvent(active, { kind: "clearing_report", reporterKey: "a", at });
    expect(applyClearingEvent(once, { kind: "clearing_report", reporterKey: "a", at }).status).toBe("clearing");
    expect(applyClearingEvent(once, { kind: "clearing_report", reporterKey: "b", at }).status).toBe("cleared");
  });

  it("reopens a clearing incident on a new active report and resets the clearing count", () => {
    const clearing = applyClearingEvent(active, { kind: "clearing_report", reporterKey: "a", at });
    const reopened = applyClearingEvent(clearing, { kind: "active_report", reporterKey: "c", at: iso(NOW_MS + 120_000) });
    expect(reopened).toEqual({ status: "active", clearingReporters: [], lastConfirmedAt: iso(NOW_MS + 120_000) });
  });

  it("keeps the latest confirmation time when an older active report arrives late", () => {
    expect(applyClearingEvent(active, { kind: "active_report", reporterKey: "c", at: iso(NOW_MS - 60_000) }).lastConfirmedAt).toBe(
      iso(NOW_MS),
    );
  });

  it("clears on an official source", () => {
    expect(applyClearingEvent(active, { kind: "official_cleared", at }).status).toBe("cleared");
  });

  it("expires community evidence only after the expiry period", () => {
    expect(applyClearingEvent(active, { kind: "tick", at: iso(NOW_MS + COMMUNITY_EXPIRY_MS - 1) }).status).toBe("active");
    expect(applyClearingEvent(active, { kind: "tick", at: iso(NOW_MS + COMMUNITY_EXPIRY_MS) }).status).toBe("cleared");
  });

  it("does not reopen a cleared incident", () => {
    const cleared: ClearingState = { ...active, status: "cleared" };
    expect(applyClearingEvent(cleared, { kind: "active_report", reporterKey: "c", at })).toBe(cleared);
  });
});
