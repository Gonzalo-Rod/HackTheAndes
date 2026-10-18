import { describe, expect, it } from "vitest";

import previous from "../../../docs/research/environment-map-evidence-2026-10-17_christian.json";
import official from "../../../docs/research/official-map-geometries-2026-10-17_christian.json";
import verified from "../../../docs/research/verified-map-evidence-2026-10-17_christian.json";
import { EvidenceFeatureSchema } from "@/contracts/research-input_christian";
import type { EnvironmentalRecord } from "@/contracts/research_christian";

import { evidenceTiming, groupEvidencePoints, sortEvidence } from "./evidence-state_christian";
import { evidenceBounds, geometryPositions, inCentralView, isVerifiedMapRecord } from "./map-evidence_christian";
import { normalizeEvidence } from "./normalize-evidence_christian";

function normalize(feature: unknown): EnvironmentalRecord {
  const record = normalizeEvidence(EvidenceFeatureSchema.parse(feature));
  if (!record) throw new Error("Real evidence type not recognized");
  return record;
}
const oldRecords = previous.features.map(normalize);
const records = verified.features.map(normalize);

describe("verified geographic evidence", () => {
  it("shows the 11 official warning maps before the much larger critical-zone inventory", () => {
    const sorted = sortEvidence(records, Date.parse("2026-10-18T00:40:00Z"));
    expect(sorted.slice(0, 11).every((record) => record.recordType.startsWith("official_"))).toBe(true);
    expect(sorted[11]?.recordType).toBe("critical_zone_under_notice");
  });
  it("admits only nine dated, source-located references from the original research", () => {
    expect(oldRecords.filter(isVerifiedMapRecord)).toHaveLength(9);
    expect(oldRecords.filter((record) => !isVerifiedMapRecord(record))).toHaveLength(13);
    expect(records.every(isVerifiedMapRecord)).toBe(true);
  });
  it("retains all 303 INGEMMET source coordinates and the notice 421 association", () => {
    const zones = records.filter((record) => record.recordType === "critical_zone_under_notice");
    expect(zones).toHaveLength(303);
    const mapPoints = groupEvidencePoints(zones);
    expect(mapPoints).toHaveLength(303);
    for (const point of mapPoints)
      expect(point.coordinates).toEqual(zones.find((record) => point.recordIds.includes(record.id))?.coordinates);
    for (const feature of official.ingemmet.features) {
      const record = zones.find((item) => item.id === `ingemmet-critical-zone-${feature.properties.OBJECTID}-notice-421-2026`);
      expect(record?.geometry).toEqual(feature.geometry);
      expect(record?.facts).toContainEqual({ label: "Número de aviso SENAMHI", value: "421" });
      expect(record?.kind).toBe("inventory");
      expect(record?.startsAt).toBe("2026-10-17T05:00:00Z");
      expect(record?.endsAt).toBe("2026-10-20T04:59:59Z");
      expect(record).not.toHaveProperty("roadStatus");
    }
  });
  it("preserves the 11 daily warning areas without centroids or Nivel 1 background polygons", () => {
    const areas = records.filter((record) => record.geometry?.type === "MultiPolygon");
    expect(areas).toHaveLength(11);
    for (const area of areas) {
      expect(area.coordinates).toBeNull();
      expect(area.geometrySourceUrl).toContain("view_aviso");
      const captures = official.senamhi.find((capture) => capture.sourceUrl === area.geometrySourceUrl);
      const level = area.title.endsWith("Naranja") ? "Nivel 3" : "Nivel 2";
      const originals = captures?.features.filter((feature) => feature.properties.nivel === level) ?? [];
      expect(originals.length).toBeGreaterThan(0);
      expect(area.geometry?.coordinates).toEqual(originals.flatMap((feature) => feature.geometry.coordinates));
      expect(captures?.features.every((feature) => feature.properties.nivel !== "Nivel 1")).toBe(true);
    }
  });
  it("uses each map's own daily validity, including the 14:00 Lima start of warning 422", () => {
    const first = records.find((record) => record.id === "senamhi-area-422-day-1-level-2-2026");
    if (!first) throw new Error("Official warning 422 day one missing");
    expect(evidenceTiming(first, Date.parse("2026-10-18T18:59:59Z")).state).toBe("upcoming");
    expect(evidenceTiming(first, Date.parse("2026-10-18T19:00:00Z")).state).toBe("valid");
    expect(evidenceTiming(first, Date.parse("2026-10-19T05:00:00Z")).state).toBe("expired");
  });
  it("rejects missing geography, missing provenance, undated records and impersonating domains", () => {
    const record = records[0];
    expect(isVerifiedMapRecord({ ...record, geometry: null })).toBe(false);
    expect(isVerifiedMapRecord({ ...record, geometrySourceUrl: null })).toBe(false);
    expect(isVerifiedMapRecord({ ...record, startsAt: null, endsAt: null, issuedAt: null })).toBe(false);
    const inventory = records.find((item) => item.recordType === "critical_zone_under_notice");
    if (!inventory) throw new Error("Critical-zone inventory missing");
    expect(isVerifiedMapRecord({ ...inventory, endsAt: null })).toBe(false);
    expect(isVerifiedMapRecord({ ...record, geometrySourceUrl: "https://senamhi.gob.pe.example.com/data" })).toBe(false);
    expect(isVerifiedMapRecord({ ...record, geometrySourceUrl: "invalid" })).toBe(false);
  });
  it("calls the critical-zone points inventory and shows only the associated notice validity", () => {
    const inventory = records.find((record) => record.recordType === "critical_zone_under_notice");
    if (!inventory) throw new Error("Critical-zone inventory missing");
    expect(inventory.kind).toBe("inventory");
    expect(evidenceTiming(inventory, Date.parse("2026-10-17T04:59:59Z")).label).toBe("Aviso asociado próximo");
    expect(evidenceTiming(inventory, Date.parse("2026-10-17T05:00:00Z")).label).toBe("Aviso asociado vigente");
    expect(evidenceTiming(inventory, Date.parse("2026-10-20T05:00:00Z")).label).toBe("Aviso asociado vencido");
    expect(inventory.caveats.join(" ")).toContain("no es un pronóstico");
  });
  it("keeps northern zones out of the central view and fits every real area vertex", () => {
    expect(records.filter((record) => record.recordType === "critical_zone_under_notice").some(inCentralView)).toBe(false);
    expect(oldRecords.filter(isVerifiedMapRecord).every(inCentralView)).toBe(true);
    const areas = records.filter((record) => record.geometry?.type === "MultiPolygon");
    const bounds = evidenceBounds(areas);
    expect(bounds).not.toBeNull();
    if (!bounds) throw new Error("Area bounds missing");
    for (const area of areas)
      for (const [lng, lat] of area.geometry ? geometryPositions(area.geometry) : []) {
        expect(lng).toBeGreaterThanOrEqual(bounds[0]);
        expect(lng).toBeLessThanOrEqual(bounds[2]);
        expect(lat).toBeGreaterThanOrEqual(bounds[1]);
        expect(lat).toBeLessThanOrEqual(bounds[3]);
      }
  });
});
