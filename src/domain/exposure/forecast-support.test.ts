import { describe, expect, it } from "vitest";

import verified from "../../../docs/research/verified-map-evidence-2026-10-17_christian.json";
import { EvidenceFeatureSchema } from "@/contracts/research-input_christian";
import type { EnvironmentalRecord } from "@/contracts/research_christian";
import { normalizeEvidence } from "@/domain/research/normalize-evidence_christian";

import type { ForecastWindow } from "./forecast-events";
import { forecastSupport } from "./forecast-support";

const records = verified.features.flatMap((feature) => normalizeEvidence(EvidenceFeatureSchema.parse(feature)) ?? []);
const CENTRAL_NOTICE_ID = "senamhi-area-422-day-1-level-2-2026"; // 2026-10-18T19:00Z – 2026-10-19T04:59:59Z

function window(validFrom: string, validUntil: string): ForecastWindow {
  return { id: validFrom, validFrom, validUntil, events: [], assessedSegments: 1, unknownSegments: 0 };
}

function ids(support: ReturnType<typeof forecastSupport>): string[] {
  return support.state === "corroborated" ? support.precipitationNotices.map((record) => record.id) : [];
}

describe("forecastSupport", () => {
  it("reports unavailable evidence separately from an absent notice", () => {
    expect(forecastSupport(window("2026-10-18T20:00:00Z", "2026-10-19T02:00:00Z"), null)).toEqual({ state: "unavailable" });
  });

  it("corroborates a window with an overlapping SENAMHI precipitation notice near PE-22", () => {
    const support = forecastSupport(window("2026-10-18T20:00:00Z", "2026-10-19T02:00:00Z"), records);
    expect(support.state).toBe("corroborated");
    expect(ids(support)).toContain(CENTRAL_NOTICE_ID);
  });

  it("ignores notices whose area is outside the PE-22 and Mantaro view", () => {
    const support = forecastSupport(window("2026-10-18T06:00:00Z", "2026-10-18T12:00:00Z"), records);
    expect(ids(support).some((id) => id.startsWith("senamhi-area-421"))).toBe(false);
  });

  it("treats a window ending exactly when the notice starts as not overlapping", () => {
    const notice = records.filter((record) => record.id === CENTRAL_NOTICE_ID);
    expect(forecastSupport(window("2026-10-18T13:00:00Z", "2026-10-18T19:00:00Z"), notice)).toEqual({ state: "none" });
  });

  it("returns none, not safety, when no notice covers a later window", () => {
    expect(forecastSupport(window("2026-10-25T00:00:00Z", "2026-10-25T06:00:00Z"), records)).toEqual({ state: "none" });
  });

  it("excludes cold warnings and undated notices", () => {
    const base = records.find((record) => record.id === CENTRAL_NOTICE_ID) as EnvironmentalRecord;
    const cold: EnvironmentalRecord = { ...base, id: "cold", topics: ["frost"] };
    const undated: EnvironmentalRecord = { ...base, id: "undated", endsAt: null };
    expect(forecastSupport(window("2026-10-18T20:00:00Z", "2026-10-19T02:00:00Z"), [cold, undated])).toEqual({ state: "none" });
  });
});
