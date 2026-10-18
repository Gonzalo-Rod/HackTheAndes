import { z } from "zod";
import { loadDashboardCorridor } from "./corridor";
import { loadPlatformConfiguration, loadRealtimeConfiguration } from "@/config/env";
import { IncidentFeedSchema } from "@/contracts/platform";
import { accessService, dashboardRepository, waitlistService } from "./runtime";
import { failure, platformRoute } from "./http";
import { resolveForecastRoad } from "./forecast-roads";

export const readIncidents = platformRoute("dashboard.incidents", async () =>
  Response.json(
    IncidentFeedSchema.parse({
      alerts: await dashboardRepository().incidents(),
      meta: { servedAt: new Date().toISOString(), state: "ready", message: "Reportes comunitarios; no equivalen a confirmación oficial." },
    }),
  ),
);
/** `?road=` selects a forecast road's segments; without it the pilot corridor is returned. */
export const readSegments = platformRoute("dashboard.segments", async (request) => {
  const roads = new URL(request.url).searchParams.getAll("road");
  if (roads.length > 1) failure(400, "invalid_input", "Indica una sola carretera.");
  if (!roads.length) return Response.json(await dashboardRepository().segments());
  const road = await resolveForecastRoad(roads[0] ?? null);
  return Response.json(await dashboardRepository().segments(road.geometryRevision));
});
export const readStats = platformRoute("dashboard.stats", async () =>
  Response.json(
    await dashboardRepository().stats(
      [...loadPlatformConfiguration().TEAM_PHONE_KEYS, ...loadPlatformConfiguration().TEST_PHONE_KEYS],
      new Date().toISOString(),
    ),
  ),
);
export const joinWaitlist = platformRoute("waitlist.join", async (request) => waitlistService()(request));
export const signIn = platformRoute("access.login", async (request) => accessService().login(request));
export const readReports = platformRoute("company.reports", async (request) => accessService().reports(request));
export const readCompany = platformRoute("company.session", async (request) => {
  const { organizationId, pass } = await accessService().requireAccess(request);
  return Response.json({ organizationId, plan: pass.plan, expiresAt: pass.expiresAt });
});
export const readRealtime = platformRoute("dashboard.realtime", async () => {
  const config = loadRealtimeConfiguration();
  if (!config) failure(503, "realtime_unavailable", "Actualización en vivo no disponible. Se actualiza por consulta periódica.");
  return Response.json(config);
});
export const readIncidentDetail = platformRoute("dashboard.incident_detail", async (request) => {
  const id = new URL(request.url).pathname
    .split("/")
    .at(-1)
    ?.replace(/^community:/, "");
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) failure(400, "invalid_input", "Incidente no válido.");
  const detail = await dashboardRepository().incidentDetail(parsed.data);
  if (!detail) failure(404, "not_found", "Incidente no encontrado.");
  return Response.json(detail);
});

// These boundaries deliberately reject requests until C supplies a versioned model
// and dispatch engine. Missing predictions must never become a green road layer.
export const readRisk = platformRoute("risk.read", async (request) => {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = z
    .object({
      horizonHours: z.coerce
        .number()
        .pipe(z.union([z.literal(24), z.literal(72)]))
        .default(24),
    })
    .strict()
    .safeParse(query);
  if (!parsed.success) failure(400, "invalid_input", "El horizonte debe ser 24 o 72 horas.");
  return failure(503, "model_unavailable", "Pronóstico de riesgo no disponible; no implica riesgo bajo.");
});
export const createDispatchDecision = platformRoute("dispatch.create", async (request) => {
  await accessService().requireAccess(request, "predictions");
  return failure(503, "model_unavailable", "La evaluación de salida aún no está disponible.");
});

export const readCorridor = platformRoute("dashboard.corridor", async () => Response.json(await loadDashboardCorridor()));
