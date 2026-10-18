import { it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { syntheticWeeklyReport } from "@/test-fixtures/weekly-report";
import { renderEnvironmentalPdf, formatReportDate } from "./environmental-report";
it("renders a bounded PDF with explicit Peru display time", async () => {
  const bytes = await renderEnvironmentalPdf(syntheticWeeklyReport());
  expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
  expect(bytes.length).toBeLessThan(1_048_576);
  expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
  expect(formatReportDate("2026-10-18T03:00:00Z")).toContain("22:00");
});

it("keeps previously stored report JSON renderable without road rainfall details", async () => {
  const report = syntheticWeeklyReport();
  delete report.outlook.rainfallStretches;
  const bytes = await renderEnvironmentalPdf(report);
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(0);
  expect(pdf.getSubject()).toContain(report.outlook.assessmentId);
  expect(pdf.getSubject()).toContain(report.range.geometryRevision);
});

it("condenses a full-length route into charts and a short block table", async () => {
  const report = syntheticWeeklyReport();
  report.outlook.rainfallStretches = Array.from({ length: 174 }, (_, km) => ({
    startKm: km,
    endKm: km + 1,
    rainMmPeriod: km > 150 ? null : km % 9,
    rainMmNext72h: km < 8 ? null : (km * 7) % 25,
  }));
  const pdf = await PDFDocument.load(await renderEnvironmentalPdf(report));
  // 18 ten-kilometer rows instead of one row per distinct value keeps the report to three pages.
  expect(pdf.getPageCount()).toBeLessThanOrEqual(3);
});
