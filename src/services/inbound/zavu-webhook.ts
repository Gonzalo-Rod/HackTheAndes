import { loadDatabaseConfiguration, loadZavuConfiguration } from "@/config/env";
import { database } from "@/db/pool";
import { createWebhookDeduplicator } from "@/db/request-limits";
import type { WebhookDeduplicator } from "@/integrations/security/webhook";
import { createZavuClient } from "@/integrations/zavu/client";
import { createZavuWebhookHandler } from "@/integrations/zavu/webhook-handler";
import { logger } from "@/lib/logger";
import { handleInboundMessage } from "./handle-inbound-message";
import { createMemoryDeduplicator } from "./memory-deduplicator";

function selectDeduplicator(): WebhookDeduplicator {
  try {
    loadDatabaseConfiguration();
  } catch {
    // Visible fallback: local runs and previews without DATABASE_URL still dedupe per instance.
    logger.warn({ operation: "zavu.webhook.setup", result: "fallback", reason: "database_not_configured" });
    return createMemoryDeduplicator();
  }
  return createWebhookDeduplicator(database());
}

/** Wires the Zavu webhook to configuration, storage and the inbound pipeline. */
export function createZavuWebhook(defer: (task: () => Promise<void>) => void) {
  const config = loadZavuConfiguration();
  const messaging = createZavuClient({ apiKey: config.apiKey, senderId: config.senderId });
  return createZavuWebhookHandler({
    webhookSecret: config.webhookSecret,
    deduplicator: selectDeduplicator(),
    onInboundMessage: (message) => handleInboundMessage(message, messaging),
    defer,
  });
}
