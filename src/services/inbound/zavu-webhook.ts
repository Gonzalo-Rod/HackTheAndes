import { loadIntentConfiguration, loadZavuConfiguration } from "@/config/env";
import { database } from "@/db/pool";
import { createPostgresWebhookProcessor } from "@/db/webhook-processor";
import { createOpenAiIntentParser } from "@/integrations/openai/intent-parser";
import { createZavuClient } from "@/integrations/zavu/client";
import { createZavuWebhookHandler } from "@/integrations/zavu/webhook-handler";
import { logger } from "@/lib/logger";
import { handleInboundMessage } from "./handle-inbound-message";
import { createDefaultRoadInformation } from "./road-information";

export function createZavuWebhook() {
  const config = loadZavuConfiguration();
  const intentConfig = loadIntentConfiguration();
  if (!intentConfig)
    logger.warn({ operation: "inbound.setup", provider: "openai", result: "fallback", reason: "intent_parser_not_configured" });
  // Deployed webhooks fail closed without durable completion storage; no cross-instance fallback.
  const processor = createPostgresWebhookProcessor(database());
  const deps = {
    messaging: createZavuClient({ apiKey: config.apiKey, senderId: config.senderId }),
    information: createDefaultRoadInformation(config.publicAppUrl),
    intentParser: intentConfig ? createOpenAiIntentParser(intentConfig) : null,
  };
  return createZavuWebhookHandler({
    webhookSecret: config.webhookSecret,
    processor,
    onInboundMessage: (message, requestId) => handleInboundMessage(message, deps, requestId),
  });
}
