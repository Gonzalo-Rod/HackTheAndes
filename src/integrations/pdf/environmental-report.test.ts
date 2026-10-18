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
