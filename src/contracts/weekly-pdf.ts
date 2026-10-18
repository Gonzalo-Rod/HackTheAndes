import { z } from "zod";
import { environmentalReportSchema, reportPeriodSchema, reportRangeSchema } from "@peruroad/road-data/reports";
export const weeklyTargetSchema = z.object({
  id: z.uuid(),
  range: reportRangeSchema,
  consentAt: z.date(),
  isTest: z.boolean(),
});
export const weeklyDeliverySchema = z.object({
  id: z.uuid(),
  leaseId: z.uuid(),
  period: reportPeriodSchema,
  expiresAt: z.date(),
  notifiedAt: z.date().nullable(),
  report: environmentalReportSchema.nullable(),
});
export type WeeklyTarget = z.infer<typeof weeklyTargetSchema>;
export type WeeklyDelivery = z.infer<typeof weeklyDeliverySchema>;
export interface PdfSender {
  sendPdf(input: {
    to: string;
    mediaUrl: string;
    filename: string;
    caption: string;
    idempotencyKey: string;
    requestId: string;
  }): Promise<
    import("@/lib/result").Result<
      import("@/integrations/messaging/types").SentMessage,
      import("@/integrations/messaging/types").SendFailure
    >
  >;
}
export interface WeeklyRouter {
  handle(message: import("@/integrations/zavu/events").InboundMessageData, requestId: string): Promise<string | null>;
}
