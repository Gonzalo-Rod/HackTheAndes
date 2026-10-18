import { evaluateAlertsAfterChange } from "@/services/alerts/after-change";
import { weeklyRuntime } from "@/services/weekly-reports/runtime";
import { loadNotificationConfiguration } from "@/config/env";
import { createZavuAudioSource } from "@/integrations/zavu/audio";
import { createOpenAiTranscriber } from "@/integrations/openai/transcriber";
import { createAudioCache } from "@/db/audio-transcripts";
import { createVoiceInput } from "@/services/audio/voice-input";
import { createSubscriptionRepository } from "@/db/subscriptions";
import { createSubscriptionFlow, senderKey } from "@/services/subscriptions/subscription-flow";
import { keyedDigest } from "@/integrations/security/contacts";
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
  const notification = loadNotificationConfiguration();
  const encryption = { key: platform.CONTACT_ENCRYPTION_KEY, version: platform.CONTACT_KEY_VERSION };
  const limiter = createRateLimiter(database());
  const intentParser = intentConfig ? createOpenAiIntentParser(intentConfig) : null;
  const deps = {
    weekly: weeklyRuntime().commands,
    subscriptions: createSubscriptionFlow({
      repository: createSubscriptionRepository(database(), encryption),
      context: (input, id) => context.execute(input, id),
      pepper: platform.PHONE_KEY_PEPPER,
      revision: loadGeometryRevision(),
      teamKeys: platform.TEAM_PHONE_KEYS,
      testKeys: platform.TEST_PHONE_KEYS,
      now: Date.now,
    }),
    voice: intentConfig
      ? createVoiceInput({
          source: createZavuAudioSource(config.apiKey),
          transcriber: createOpenAiTranscriber({ apiKey: intentConfig.apiKey, model: notification.transcriptionModel }),
          cache: createAudioCache(database(), encryption),
          quota: (from) =>
            limiter.consume(
              keyedDigest(senderKey(from, platform.PHONE_KEY_PEPPER), platform.PHONE_KEY_PEPPER, "audio-rate"),
              5,
              15 * 60_000,
              Date.now(),
            ),
        })
      : undefined,
    messaging: createZavuClient({ apiKey: config.apiKey, senderId: config.senderId }),
    information: createDefaultRoadInformation(config.publicAppUrl),
    intentParser,
    reports: createReportFlow({
      onPublication: evaluateAlertsAfterChange,
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
