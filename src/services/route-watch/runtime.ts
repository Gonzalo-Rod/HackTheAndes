import { randomUUID } from "node:crypto";
import { loadGeometryRevision, loadPlatformConfiguration, loadZavuConfiguration } from "@/config/env";
import { readAlertLandmarks } from "@/db/alert-landmarks";
import { database } from "@/db/pool";
import { createTripRepository } from "@/db/trips";
import { createZavuClient } from "@/integrations/zavu/client";
import { createZavuVoiceCaller } from "@/integrations/zavu/voice";
import { createMessagingRoadContext } from "@/services/inbound/road-information";
import { authorizeJob } from "@/services/jobs/authorize";
import { platformRoute } from "@/services/platform/http";
import { accessService } from "@/services/platform/runtime";
import { collectRouteIncidents } from "./collect-incidents";
import { createRouteWatchEvaluator } from "./evaluate";
import { createTripRegistration } from "./register-trip";
import { createWatchManagement } from "./manage-watches";

// Production wiring for route watch (F4): the company dashboard registers, lists and stops watches;
// scheduled and source-change jobs evaluate them.

function tripRepository() {
  const platform = loadPlatformConfiguration();
  return createTripRepository(database(), { key: platform.CONTACT_ENCRYPTION_KEY, version: platform.CONTACT_KEY_VERSION });
}

export function createDefaultRouteWatchEvaluator() {
  const trips = tripRepository();
  const revision = loadGeometryRevision();
  const zavu = loadZavuConfiguration();
  const context = createMessagingRoadContext();
  return createRouteWatchEvaluator({
    trips,
    testPhoneKeys: loadPlatformConfiguration().TEST_PHONE_KEYS,
    loadIncidents: (nowMs, requestId) =>
      collectRouteIncidents({ trips, context: (input, id) => context.execute(input, id), revision }, nowMs, requestId),
    landmarks: () => readAlertLandmarks(database(), revision),
    voice: createZavuVoiceCaller(zavu),
    messaging: createZavuClient(zavu),
    now: Date.now,
  });
}

/** POST /api/jobs/route-watch: scheduled every few minutes with the job secret. */
export const evaluateRouteWatch = platformRoute("route_watch.job", async (request) => {
  authorizeJob(request);
  const requestId = randomUUID();
  return Response.json({ requestId, ...(await createDefaultRouteWatchEvaluator()(requestId)) });
});

/** POST /api/company/trips: any active company plan may register monitored trips. */
export const registerTrip = platformRoute("route_watch.register", async (request) => {
  const platform = loadPlatformConfiguration();
  return createTripRegistration({
    trips: tripRepository(),
    requireOrganization: (req) => accessService().requireAccess(req, "dashboard"),
    pepper: platform.PHONE_KEY_PEPPER,
    revision: loadGeometryRevision(),
    now: Date.now,
  })(request);
});

function watchManagement() {
  return createWatchManagement({ trips: tripRepository(), requireOrganization: (req) => accessService().requireAccess(req, "dashboard") });
}

/** GET /api/company/trips: the organization's planned and active watches. */
export const listWatches = platformRoute("route_watch.list", (request) => watchManagement().list(request));

/** DELETE /api/company/trips/:id: stops one of the organization's watches. */
export async function cancelWatch(request: Request, id: string) {
  return platformRoute("route_watch.cancel", (req) => watchManagement().cancel(req, id))(request);
}
