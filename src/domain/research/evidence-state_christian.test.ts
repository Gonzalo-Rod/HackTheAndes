import { describe, expect, it } from "vitest";

import evidence from "../../../docs/research/environment-map-evidence-2026-10-17_christian.json";
import { EvidenceFeatureSchema } from "@/contracts/research-input_christian";
import { EnvironmentalRecordSchema, type EnvironmentalRecord } from "@/contracts/research_christian";

import { evidenceTiming, groupEvidencePoints, sortEvidence } from "./evidence-state_christian";
import { normalizeEvidence } from "./normalize-evidence_christian";

const records = evidence.features.map((feature) => {
  const record = normalizeEvidence(EvidenceFeatureSchema.parse(feature));
  if (!record) throw new Error(`Unrecognized real evidence: ${feature.id}`);
  return EnvironmentalRecordSchema.parse(record);
});
function record(id: string): EnvironmentalRecord {
  const found = records.find((item) => item.id === id);
  if (!found) throw new Error(`Missing real evidence: ${id}`);
  return found;
}

describe("real environmental evidence", () => {
  it("preserves all 22 records and only the nine source-provided point references", () => {
    expect(records).toHaveLength(22);
    expect(records.filter((item) => item.coordinates !== null)).toHaveLength(9);
    expect(records.filter((item) => item.coordinates === null)).toHaveLength(13);
  });
  it("keeps rainfall observations separate from road status", () => {
    const rainfall = record("indeci-ingenio-rainfall-2026-10-17");
    expect(rainfall.kind).toBe("observation");
    expect(rainfall.facts).toContainEqual({ label: "Lluvia (mm)", value: "12" });
    expect(rainfall).not.toHaveProperty("roadStatus");
  });
  it("preserves the reported frost minimum and the station-coordinate limitation", () => {
    const frost = record("senamhi-huayao-maize-frost-impact-october-2026");
    expect(frost.topics).toContain("frost");
    expect(frost.facts).toContainEqual({ label: "Mínima durante helada (°C)", value: "-3.5" });
    expect(frost.caveats.join(" ")).toContain("0,1°");
    expect(record("senamhi-comas-potato-observation-2026-10-06-12").topics).not.toContain("frost");
  });
  it("does not convert pest trapping into a dated outbreak", () => {
    const pests = record("senasa-junin-fruit-fly-trap-network-reference");
    expect(pests.kind).toBe("surveillance");
    expect(pests.coordinates).toBeNull();
    expect(pests.startsAt).toBeNull();
    expect(evidenceTiming(pests, Date.parse("2026-10-18T00:00:00Z")).state).toBe("undated");
  });
  it("keeps national scenarios off the map and apart from active alerts", () => {
    const scenarios = records.filter((item) => item.kind === "scenario");
    expect(scenarios).toHaveLength(3);
    for (const scenario of scenarios) {
      expect(scenario.coordinates).toBeNull();
      expect(evidenceTiming(scenario, Date.parse("2027-01-02T00:00:00Z")).state).toBe("context");
    }
  });
  it("groups co-located references without inventing a midpoint or dropping records", () => {
    const points = groupEvidencePoints(records);
    expect(points.length).toBeLessThan(9);
    expect(points.flatMap((point) => point.recordIds)).toHaveLength(9);
    for (const point of points)
      expect(records.some((item) => JSON.stringify(item.coordinates) === JSON.stringify(point.coordinates))).toBe(true);
  });
  it("rejects unsafe URLs and out-of-range coordinates at the input boundary", () => {
    const feature = evidence.features[0];
    expect(EvidenceFeatureSchema.safeParse({ ...feature, geometry: { type: "Point", coordinates: [200, -12] } }).success).toBe(false);
    expect(
      EvidenceFeatureSchema.safeParse({ ...feature, properties: { ...feature.properties, sourceUrl: "javascript:alert(1)" } }).success,
    ).toBe(false);
  });
});

describe("forecast validity in America/Lima", () => {
  const warning = record("senamhi-warning-422-central-andes-2026-10-18-19");
  it("does not activate a future notice early", () => {
    expect(evidenceTiming(warning, Date.parse("2026-10-18T18:59:59Z")).state).toBe("upcoming");
    expect(evidenceTiming(warning, Date.parse("2026-10-18T19:00:00Z")).state).toBe("valid");
  });
  it("expires at the published end, not at the snapshot retrieval time", () => {
    expect(evidenceTiming(warning, Date.parse("2026-10-20T04:59:00Z")).state).toBe("valid");
    expect(evidenceTiming(warning, Date.parse("2026-10-20T04:59:01Z")).state).toBe("expired");
  });
  it("treats a date-only forecast as valid through the end of that Lima date", () => {
    const town = record("senamhi-forecast-chosica-2026-10-17");
    expect(evidenceTiming(town, Date.parse("2026-10-19T04:59:59Z")).state).toBe("valid");
    expect(evidenceTiming(town, Date.parse("2026-10-19T05:00:00Z")).state).toBe("expired");
  });
  it("places official notices before town forecasts without changing their geometry", () => {
    const sorted = sortEvidence(records, Date.parse("2026-10-18T00:40:00Z"));
    expect(sorted[0]?.recordType).toBe("short_term_hazard_notice");
    expect(sorted[1]?.id).toBe(warning.id);
    expect(sorted[0]?.coordinates).toBeNull();
  });
});
