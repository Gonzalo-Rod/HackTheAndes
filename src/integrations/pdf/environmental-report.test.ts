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
