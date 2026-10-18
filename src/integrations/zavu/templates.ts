import { z } from "zod";
import { getJson, postJson } from "@/integrations/http/fetch-json";
import type { TemplateSender } from "@/integrations/messaging/types";
import { err, ok } from "@/lib/result";
import { toSendFailure } from "./client";
export function createZavuTemplateSender(
  config: { apiKey: string; senderId: string; templateId: string | null; summaryVariable?: boolean },
  fetchImpl?: typeof fetch,
): TemplateSender {
  return {
    async sendTemplate(message) {
      if (!config.templateId) return err("window_closed");
      try {
        const status = z.object({ id: z.string(), status: z.string() }).parse(
          await getJson(`https://api.zavu.dev/v1/templates/${encodeURIComponent(config.templateId)}`, {
            provider: "zavu",
            operation: "alerts.template-status",
            requestId: message.requestId,
            headers: { Authorization: `Bearer ${config.apiKey}` },
            fetchImpl,
          }),
        );
        if (status.status.toLowerCase() !== "approved") return err("window_closed");
        const response = await postJson(
          "https://api.zavu.dev/v1/messages",
          {
            to: message.to,
            channel: "whatsapp",
            messageType: "template",
            fallbackEnabled: false,
            idempotencyKey: message.idempotencyKey,
            content: {
              templateId: config.templateId,
              ...(config.summaryVariable === false ? {} : { templateVariables: { "1": message.text.replace(/\s+/g, " ").slice(0, 950) } }),
            },
          },
          {
            provider: "zavu",
            operation: "alerts.template-send",
            requestId: message.requestId,
            headers: { Authorization: `Bearer ${config.apiKey}`, "Zavu-Sender": config.senderId },
            fetchImpl,
            idempotent: true,
            acceptStatuses: [409],
          },
        );
        const parsed = z.object({ message: z.object({ id: z.string().min(1) }) }).parse(response.body);
        return ok({ providerMessageId: parsed.message.id });
      } catch (error) {
        return err(toSendFailure(error));
      }
    },
  };
}
