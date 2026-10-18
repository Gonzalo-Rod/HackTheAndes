import { randomUUID } from "node:crypto";
import { database } from "@/db/pool";
import { createAlertDeliveryRepository } from "@/db/alert-deliveries";
import { locateOnRoads } from "@/db/road-locator";
import { loadGeometryRevision, loadPlatformConfiguration, loadNotificationConfiguration, loadZavuConfiguration } from "@/config/env";
import type { AlertsResponse } from "@/contracts/road-alerts";
import { createMessagingRoadContext } from "@/services/inbound/road-information";
import { loadExposureView } from "@/services/platform/exposure";
import { loadForecastRoads } from "@/services/platform/forecast-roads";
import { createZavuClient } from "@/integrations/zavu/client";
import { createZavuTemplateSender } from "@/integrations/zavu/templates";
import { logger } from "@/lib/logger";
import { collectAlertCandidates } from "./collect-candidates";
import { createAlertDispatcher } from "./deliver-alerts";
import { nationalOfficialCandidates } from "./national-official";
import { expireAlertPasses } from "@/db/expire-alert-passes";

type Counts = { checked: number; sent: number; pending: number; failed: number };

async function nationalAlerts(requestId: string): Promise<AlertsResponse | null> {
  // Loaded on demand: the shared instance reads SUTRAN configuration, which job tests mock away.
  const { roadAlertsService } = await import("@/services/instances");
  const result = await roadAlertsService.getCurrentAlerts({ requestId });
  return result.ok ? result.value : null;
}

/** The pilot is always evaluated; other registered roads only when someone has an active route on them. */
export async function runAlertEvaluation(requestId: string = randomUUID()) {
  await expireAlertPasses(database(), Date.now());
  const config = loadZavuConfiguration(),
    platform = loadPlatformConfiguration(),
    notification = loadNotificationConfiguration();
  const pilotRevision = loadGeometryRevision();
  const context = createMessagingRoadContext();
  const repository = createAlertDeliveryRepository(database(), {
    key: platform.CONTACT_ENCRYPTION_KEY,
    version: platform.CONTACT_KEY_VERSION,
  });
  const dispatcher = (revision: string) =>
    createAlertDispatcher({
      repository,
      messaging: createZavuClient(config),
      templates: createZavuTemplateSender({ ...config, templateId: notification.templateId }),
      revision,
      now: Date.now,
    });
  const totals: Counts = { checked: 0, sent: 0, pending: 0, failed: 0 };
  const add = (counts: Counts) => {
    for (const key of Object.keys(totals) as (keyof Counts)[]) totals[key] += counts[key];
  };

  const pilotCandidates = await collectAlertCandidates(
    { pool: database(), context: (input, id) => context.execute(input, id), exposure: () => loadExposureView(24), revision: pilotRevision },
    Date.now(),
    requestId,
  );
  add(await dispatcher(pilotRevision)(pilotCandidates, requestId));

  const active = new Set(await repository.activeRevisions());
  const roads = (await loadForecastRoads()).filter((road) => !road.pilot && active.has(road.geometryRevision));
  // Fetched once per run and shared by every road; the dashboard's service caches it as well.
  const feed = roads.length ? await nationalAlerts(requestId) : null;
  const roadResults: { roadCode: string; result: "ok" | "error" }[] = [];
  for (const road of roads) {
    try {
      const candidates = await collectAlertCandidates(
        {
          pool: database(),
          context: (input, id) => context.execute(input, id),
          exposure: () => loadExposureView(24, Date.now(), road),
          revision: road.geometryRevision,
          official: () =>
            nationalOfficialCandidates({
              response: feed,
              roadCode: road.roadCode,
              revision: road.geometryRevision,
              locate: (position, revisions) => locateOnRoads(database(), revisions, position),
              nowMs: Date.now(),
            }),
        },
        Date.now(),
        requestId,
      );
      add(await dispatcher(road.geometryRevision)(candidates, requestId));
      roadResults.push({ roadCode: road.roadCode, result: "ok" });
    } catch (error) {
      // One road's outage must not block alerts on the others; the 5-minute recovery retries it.
      logger.warn({
        requestId,
        operation: "alerts.road",
        provider: "supabase",
        result: "error",
        roadCode: road.roadCode,
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      totals.failed++;
      roadResults.push({ roadCode: road.roadCode, result: "error" });
    }
  }
  return { requestId, ...totals, roads: roadResults };
}
