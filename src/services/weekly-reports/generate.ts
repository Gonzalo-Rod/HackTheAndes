import { buildEnvironmentalReport, environmentalReportSchema, type ReportPeriod, type ReportRange } from "@peruroad/road-data/reports";
import { createExposureRepository, createExposureView } from "@peruroad/road-data/exposure";
import { database } from "@/db/pool";
import { readWeeklyObservations } from "@/db/weekly-observations";
import { createReportSummary } from "@/integrations/openai/report-summary";
import { loadOpenAiConfiguration } from "@/config/env";
import { renderEnvironmentalPdf } from "@/integrations/pdf/environmental-report";
export async function generateWeeklyReport(range: ReportRange, period: ReportPeriod, isDemo: boolean, nowMs: number, requestId: string) {
  const record = await createExposureRepository(database()).readLatest(range.geometryRevision);
  if (!record) throw new Error("No persisted environmental assessment available");
  const observations = await readWeeklyObservations(database(), range, period, isDemo);
  const exposure = createExposureView(record.assessment, nowMs, "database", 72, false);
  let report = buildEnvironmentalReport({ nowMs, period, range, isDemo, exposure, weather: record.input.weather, observations });
  const config = loadOpenAiConfiguration();
  const ids = config ? await createReportSummary(config)(report.facts, requestId) : null;
  report = environmentalReportSchema.parse({
    ...report,
    summaryIds: ids ?? report.summaryIds,
    limitations: ids
      ? report.limitations
      : [
          ...report.limitations,
          "El resumen automático no estuvo disponible. Se muestran directamente los datos calculados para este informe.",
        ],
  });
  return { report, pdf: await renderEnvironmentalPdf(report) };
}
