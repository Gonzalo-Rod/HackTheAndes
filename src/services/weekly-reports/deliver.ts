import type { EnvironmentalReport, ReportPeriod, ReportRange } from "@peruroad/road-data/reports";
import type { WeeklyTarget, PdfSender } from "@/contracts/weekly-pdf";
import type { WeeklyPdfRepository } from "@/db/weekly-pdf";
import type { TemplateSender } from "@/integrations/messaging/types";
import { weeklyPdfUrl } from "@/integrations/security/weekly-pdf-access";
import { logger } from "@/lib/logger";
export function createWeeklyDispatcher(deps: {
  repository: WeeklyPdfRepository;
  pdfSender: PdfSender;
  templates: TemplateSender;
  generate: (
    range: ReportRange,
    period: ReportPeriod,
    isDemo: boolean,
    nowMs: number,
    requestId: string,
  ) => Promise<{ report: EnvironmentalReport; pdf: Uint8Array }>;
  publicUrl: string;
  signingSecret: string;
  now: () => number;
}) {
  return async (target: WeeklyTarget, period: ReportPeriod, requestId: string) => {
    const delivery = await deps.repository.claim(target.id, period, deps.now(), target.consentAt);
    if (!delivery) return "unchanged" as const;
    try {
      if (!delivery.report) {
        const generated = await deps.generate(target.range, delivery.period, target.isTest, deps.now(), requestId);
        await deps.repository.save(delivery, generated.report, generated.pdf);
      }
      const destination = await deps.repository.destination(delivery, deps.now());
      if (!destination) {
        await deps.repository.finish(delivery, "cancelled", "consent_changed", deps.now());
        return "cancelled" as const;
      }
      const baseKey = `weekly-pdf:v1:${delivery.id}`;
      let result;
      if (destination.windowOpen) {
        result = await deps.pdfSender.sendPdf({
          to: destination.to,
          mediaUrl: weeklyPdfUrl(deps.publicUrl, delivery.id, delivery.expiresAt.getTime(), deps.signingSecret),
          filename: `PeruRoad-${delivery.period.end.slice(0, 10)}${target.isTest ? "-DEMO" : ""}.pdf`,
          caption: `${target.isTest ? "DEMO · " : ""}Tu informe ambiental semanal de PE-22. Incluye datos disponibles y exposición estimada; no certifica vía segura. SEMANAL BAJA cancela solo el PDF.`,
          idempotencyKey: `${baseKey}:document`,
          requestId,
        });
        if (result.ok) {
          await deps.repository.finish(delivery, "sent", null, deps.now(), result.value.providerMessageId);
          return "sent" as const;
        }
      }
      if (!destination.windowOpen || (result && !result.ok && result.error === "window_closed")) {
        if (delivery.notifiedAt) {
          await deps.repository.finish(delivery, "pending", "awaiting_pdf_reply", deps.now());
          return "pending" as const;
        }
        const notice = await deps.templates.sendTemplate({
          to: destination.to,
          text: "Tu informe ambiental semanal en PDF está listo. Responde PDF para recibir el archivo adjunto. SEMANAL BAJA cancela solo estos informes.",
          channel: "whatsapp",
          idempotencyKey: `${baseKey}:notice`,
          requestId,
        });
        await deps.repository.finish(
          delivery,
          notice.ok ? "notified" : "pending",
          notice.ok ? null : notice.error,
          deps.now(),
          notice.ok ? notice.value.providerMessageId : null,
        );
        return notice.ok ? ("notified" as const) : ("pending" as const);
      }
      await deps.repository.finish(delivery, "pending", result && !result.ok ? result.error : "unavailable", deps.now());
      return "pending" as const;
    } catch (error) {
      await deps.repository.finish(delivery, "pending", "infrastructure_unavailable", deps.now());
      logger.warn({
        requestId,
        operation: "weekly-pdf.deliver",
        provider: "zavu-supabase",
        result: "error",
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      return "failed" as const;
    }
  };
}
export type WeeklyDispatcher = ReturnType<typeof createWeeklyDispatcher>;
