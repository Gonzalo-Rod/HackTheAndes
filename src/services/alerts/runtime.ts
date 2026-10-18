import { randomUUID } from "node:crypto";
import { database } from "@/db/pool";
import { createAlertDeliveryRepository } from "@/db/alert-deliveries";
import { loadGeometryRevision, loadPlatformConfiguration, loadNotificationConfiguration, loadZavuConfiguration } from "@/config/env";
import { createMessagingRoadContext } from "@/services/inbound/road-information";
import { loadExposureView } from "@/services/platform/exposure";
import { createZavuClient } from "@/integrations/zavu/client";
import { createZavuTemplateSender } from "@/integrations/zavu/templates";
import { collectAlertCandidates } from "./collect-candidates";
import { createAlertDispatcher } from "./deliver-alerts";
import { expireAlertPasses } from "@/db/expire-alert-passes";
export async function runAlertEvaluation(requestId: string = randomUUID()) {
  await expireAlertPasses(database(), Date.now());
  const config = loadZavuConfiguration(),
    platform = loadPlatformConfiguration(),
    notification = loadNotificationConfiguration();
  const context = createMessagingRoadContext();
  const candidates = await collectAlertCandidates(
    {
      pool: database(),
      context: (input, id) => context.execute(input, id),
      exposure: () => loadExposureView(24),
      revision: loadGeometryRevision(),
    },
    Date.now(),
    requestId,
  );
  const dispatch = createAlertDispatcher({
    repository: createAlertDeliveryRepository(database(), { key: platform.CONTACT_ENCRYPTION_KEY, version: platform.CONTACT_KEY_VERSION }),
    messaging: createZavuClient(config),
    templates: createZavuTemplateSender({ ...config, templateId: notification.templateId }),
    revision: loadGeometryRevision(),
    now: Date.now,
  });
  return { requestId, ...(await dispatch(candidates, requestId)) };
}
