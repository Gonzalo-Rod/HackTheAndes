import { z } from "zod";
import type { PdfSender } from "@/contracts/weekly-pdf";
import { postJson, type RequestOptions } from "@/integrations/http/fetch-json";
import { err, ok } from "@/lib/result";
import { toSendFailure } from "./client";
const documentSchema = z
  .object({
    to: z.string().min(1),
    mediaUrl: z.url().startsWith("https://"),
    filename: z
      .string()
      .regex(/^[a-zA-Z0-9._-]+\.pdf$/)
      .max(100),
    caption: z.string().max(1024),
    idempotencyKey: z.string().min(1),
    requestId: z.string().min(1),
  })
  .strict();
/** Zavu document messages fetch a publicly reachable HTTPS URL; the driver receives the file, not a link. */
export function createZavuPdfSender(
  config: { apiKey: string; senderId: string },
  options: Pick<RequestOptions, "fetchImpl" | "timeoutMs" | "sleep"> = {},
): PdfSender {
  return {
    async sendPdf(input) {
      const message = documentSchema.parse(input);
      try {
        const response = await postJson(
          "https://api.zavu.dev/v1/messages",
          {
            to: message.to,
            channel: "whatsapp",
            messageType: "document",
            text: message.caption,
            fallbackEnabled: false,
            idempotencyKey: message.idempotencyKey,
            content: { mediaUrl: message.mediaUrl, mimeType: "application/pdf", filename: message.filename },
          },
          {
            provider: "zavu",
            operation: "weekly-pdf.send",
            requestId: message.requestId,
            headers: { Authorization: `Bearer ${config.apiKey}`, "Zavu-Sender": config.senderId },
            idempotent: true,
            acceptStatuses: [409],
            ...options,
          },
        );
        const body = z.object({ message: z.object({ id: z.string().min(1) }) }).parse(response.body);
        return ok({ providerMessageId: body.message.id });
      } catch (error) {
        return err(toSendFailure(error));
      }
    },
  };
}
