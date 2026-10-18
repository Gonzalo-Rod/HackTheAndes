import { loadGeometryRevision, loadOpenAiConfiguration, loadPlatformConfiguration, loadZavuConfiguration } from "@/config/env";
import { database } from "@/db/pool";
import { createPostgresWebhookProcessor } from "@/db/webhook-processor";
import { createOpenAiIntentParser } from "@/integrations/openai/intent-parser";
import { createZavuClient } from "@/integrations/zavu/client";
import { createZavuWebhookHandler } from "@/integrations/zavu/webhook-handler";
import { logger } from "@/lib/logger";
import { handleInboundMessage } from "./handle-inbound-message";
import { createDefaultRoadInformation } from "./road-information";
import { createMessagingRoadContext } from "./road-information";
import { createReportRepository } from "@/db/report-conversations";
import { createRateLimiter } from "@/db/request-limits";
import { createReportFlow } from "@/services/reports/report-flow";
import { createOpenAiReportExtractor } from "@/integrations/openai/report-extractor";

export function createZavuWebhook() {
  const config = loadZavuConfiguration();
  const intentConfig = loadOpenAiConfiguration();
  if (!intentConfig)
    logger.warn({ operation: "inbound.setup", provider: "openai", result: "fallback", reason: "intent_parser_not_configured" });
  // Deployed webhooks fail closed without durable completion storage; no cross-instance fallback.
  const processor = createPostgresWebhookProcessor(database());
  const platform = loadPlatformConfiguration();
  const context = createMessagingRoadContext();
  const intentParser = intentConfig ? createOpenAiIntentParser(intentConfig) : null;
  const deps = {
    messaging: createZavuClient({ apiKey: config.apiKey, senderId: config.senderId }),
    information: createDefaultRoadInformation(config.publicAppUrl),
    intentParser,
    reports: createReportFlow({
      repository: createReportRepository(database(), { key: platform.CONTACT_ENCRYPTION_KEY, version: platform.CONTACT_KEY_VERSION }),
      extractor: intentConfig ? createOpenAiReportExtractor(intentConfig) : null,
      intentParser,
      limiter: createRateLimiter(database()),
      context: (input, requestId) => context.execute(input, requestId),
      pepper: platform.PHONE_KEY_PEPPER,
      publicUrl: config.publicAppUrl,
      geometryRevision: loadGeometryRevision(),
      teamPhoneKeys: platform.TEAM_PHONE_KEYS,
      testPhoneKeys: platform.TEST_PHONE_KEYS,
      now: Date.now,
    }),
  };
  return createZavuWebhookHandler({
    webhookSecret: config.webhookSecret,
    processor,
    onInboundMessage: (message, requestId) => handleInboundMessage(message, deps, requestId),
  });
}
