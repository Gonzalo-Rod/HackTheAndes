import {
  loadGeometryRevision,
  loadNotificationConfiguration,
  loadPlatformConfiguration,
  loadZavuConfiguration,
  loadWeeklyReportConfiguration,
} from "@/config/env";
import { database } from "@/db/pool";
import { createWeeklyPdfRepository } from "@/db/weekly-pdf";
import { createSubscriptionRepository } from "@/db/subscriptions";
import { createRateLimiter } from "@/db/request-limits";
import { createZavuPdfSender } from "@/integrations/zavu/documents";
import { createZavuTemplateSender } from "@/integrations/zavu/templates";
import { createWeeklyDispatcher } from "./deliver";
import { createWeeklyCommands } from "./commands";
import { generateWeeklyReport } from "./generate";
export function weeklyRuntime() {
  const config = loadZavuConfiguration(),
    platform = loadPlatformConfiguration();
  const encryption = { key: platform.CONTACT_ENCRYPTION_KEY, version: platform.CONTACT_KEY_VERSION };
  const repository = createWeeklyPdfRepository(database(), encryption);
  const dispatch = createWeeklyDispatcher({
    repository,
    pdfSender: createZavuPdfSender(config),
    templates: createZavuTemplateSender({ ...config, templateId: loadWeeklyReportConfiguration().templateId, summaryVariable: false }),
    generate: generateWeeklyReport,
    publicUrl: config.publicAppUrl,
    signingSecret: platform.SESSION_SIGNING_SECRET,
    now: Date.now,
  });
  // Job authorization uses the existing scoped credential; no PDF-recipient data enters n8n.
  loadNotificationConfiguration();
  return {
    repository,
    dispatch,
    commands: createWeeklyCommands({
      preferences: createSubscriptionRepository(database(), encryption),
      repository,
      dispatch,
      limiter: createRateLimiter(database()),
      pepper: platform.PHONE_KEY_PEPPER,
      revision: loadGeometryRevision(),
      now: Date.now,
    }),
  };
}
