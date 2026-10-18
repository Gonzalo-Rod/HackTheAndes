import { describe, it, expect } from "vitest";
import { weeklyPeriod, buildEnvironmentalReport } from "../src/domain/reports/weekly.ts";
import { readBundledExposure } from "../src/integrations/exposure/files.ts";
import { createExposureView } from "../src/domain/exposure/view.ts";
import { environmentalReportSchema } from "../src/contracts/weekly-report.ts";
describe("weekly environmental reporting", () => {
  it("rolls the reporting week at Monday 07:00 Lima, never ahead of now", () => {
    expect(weeklyPeriod(Date.parse("2026-10-19T11:59:59Z")).end).toBe("2026-10-12T12:00:00.000Z");
    expect(weeklyPeriod(Date.parse("2026-10-19T12:00:00Z")).end).toBe("2026-10-19T12:00:00.000Z");
    expect(weeklyPeriod(Date.parse("2026-10-19T12:59:59Z"), true).end).toBe(
      "2026-10-19T12:00:00.000Z",
    );
  });
  async function inputs() {
    const record = await readBundledExposure();
    const nowMs = Date.parse(record.assessment.sources.weatherCapturedAt) + 60_000;
    return {
      nowMs,
      period: weeklyPeriod(nowMs, true),
      range: {
        startKm: 0.25,
        endKm: 10.5,
        label: "Synthetic partial stretch",
        geometryRevision: record.assessment.geometryRevision,
      },
      isDemo: false,
      exposure: createExposureView(record.assessment, nowMs, "database", 72, false),
      weather: record.input.weather,
      observations: {
        firstRecordedAt: null,
        officialEnvironmentalAlerts: 0,
        communityEnvironmentalIncidents: 0,
      },
    };
  }
  it("clips fractional geometry endpoints and preserves unknown kilometers", async () => {
    const report = buildEnvironmentalReport(await inputs());
    expect(Object.values(report.outlook.kilometers).reduce((a, b) => a + b, 0)).toBeCloseTo(
      10.25,
      1,
    );
    expect(report.outlook.kilometers.unknown).toBeGreaterThan(0);
    expect(report.outlook.rainfallStretches?.length).toBeGreaterThan(0);
    expect(
      report.outlook.rainfallStretches?.every((s) => s.startKm >= 0.25 && s.endKm <= 10.5),
    ).toBe(true);
    expect(report.observations.closureHours).toBeNull();
    expect(report.limitations.join(" ")).toContain("cero avisos no significa");
  });
  it("makes stale exposure unknown and never serves its rain as a fresh outlook", async () => {
    const input = await inputs();
    input.nowMs += 4 * 3_600_000;
    input.exposure.meta.operationallyUsable = false;
    input.exposure.meta.state = "stale";
    const r = buildEnvironmentalReport(input);
    expect(r.outlook.kilometers.unknown).toBeCloseTo(10.25, 1);
    expect(r.outlook.catchments.every((c) => c.rainMmNext72h === null)).toBe(true);
    expect(r.outlook.rainfallStretches?.every((s) => s.rainMmNext72h === null)).toBe(true);
  });
  it("does not redistribute missing historical rainfall or fabricate an earlier archive", async () => {
    const input = await inputs();
    input.weather.grids.forEach((g) => g.values.precipitation?.fill(null));
    const r = buildEnvironmentalReport(input);
    expect(r.observations.firstRecordedAt).toBeNull();
    expect(r.outlook.catchments.every((c) => c.rainMmPeriod === null)).toBe(true);
  });
  it("reads stored v1 reports without the new road rainfall display", async () => {
    const report = buildEnvironmentalReport(await inputs());
    const { rainfallStretches: _stretches, ...legacyOutlook } = report.outlook;
    expect(environmentalReportSchema.safeParse({ ...report, outlook: legacyOutlook }).success).toBe(
      true,
    );
  });
  it("rejects rainfall stretches outside the subscription or across overlapping ranges", async () => {
    const report = buildEnvironmentalReport(await inputs());
    const parse = (rainfallStretches: unknown) =>
      environmentalReportSchema.safeParse({
        ...report,
        outlook: { ...report.outlook, rainfallStretches },
      }).success;
    const rain = { rainMmPeriod: null, rainMmNext72h: 4 };
    expect(parse([{ ...rain, startKm: 0, endKm: 1 }])).toBe(false);
    expect(
      parse([
        { ...rain, startKm: 1, endKm: 2 },
        { ...rain, startKm: 1.5, endKm: 3 },
      ]),
    ).toBe(false);
    expect(parse([{ ...rain, startKm: 2, endKm: 2 }])).toBe(false);
  });
  it("rejects geometry mismatches and summary claims outside computed facts", async () => {
    const input = await inputs();
    const report = buildEnvironmentalReport(input);
    expect(
      environmentalReportSchema.safeParse({ ...report, summaryIds: ["invented"] }).success,
    ).toBe(false);
    expect(() =>
      buildEnvironmentalReport({
        ...input,
        range: { ...input.range, geometryRevision: "0".repeat(64) },
      }),
    ).toThrow("geometry");
  });
});
