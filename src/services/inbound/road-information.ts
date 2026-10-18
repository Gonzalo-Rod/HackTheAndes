import { randomUUID } from "node:crypto";
import { createPostgresRoadContextRepository, createRoadContextService } from "@peruroad/road-data/context";
import { roadContextResponseSchema, type RoadContextRequest, type RoadContextResponse } from "@peruroad/road-data/context/contracts";
import type { ExposureLayer } from "@/contracts/exposure";
import { ExposureLayerSchema } from "@/contracts/exposure";
import type { ForecastRoad } from "@/contracts/forecast-roads";
import { AlertsResponseSchema, type AlertsResponse } from "@/contracts/road-alerts";
import { loadGeometryRevision } from "@/config/env";
import { database } from "@/db/pool";
import { locateOnRoads, type RoadPosition } from "@/db/road-locator";
import { parseRoadCode, sameRoadCode } from "@/domain/messaging/dashboard-links";
import { formatExposureOverview, formatExposureReply, PILOT, type ReplyRoad } from "@/domain/messaging/exposure-reply";
import { formatNationalStatus, formatRoadStatus } from "@/domain/messaging/status-reply";
import { loadExposureView } from "@/services/platform/exposure";
import { loadForecastRoads } from "@/services/platform/forecast-roads";
import { logger } from "@/lib/logger";

export type ExposureQuery = { place: string } | { latitude: number; longitude: number } | null;
export interface RoadInformation {
  /** `query` is the text after ESTADO: a road code narrows the national feed. */
  status(requestId: string, query?: string | null): Promise<string>;
  exposure(location: ExposureQuery, requestId: string): Promise<string>;
}
/** National sources shared with the dashboard. Without them, replies keep the pilot-only behavior. */
export interface NationalSources {
  /** The dashboard's live SUTRAN feed (cache and bundled snapshot included); null when unavailable. */
  alerts: (requestId: string) => Promise<AlertsResponse | null>;
  roads: () => Promise<ForecastRoad[]>;
  locate: (position: { latitude: number; longitude: number }, revisions: readonly string[]) => Promise<RoadPosition | null>;
}
export function createRoadInformation(deps: {
  context: (input: RoadContextRequest, requestId: string) => Promise<RoadContextResponse>;
  exposure: (road?: ForecastRoad) => Promise<ExposureLayer>;
  publicUrl: string;
  geometryRevision: string;
  national?: NationalSources;
}): RoadInformation {
  const unavailable = `No podemos consultar esta fuente ahora. No implica vía libre ni riesgo bajo. Mapa y antigüedad de datos: ${deps.publicUrl}`;
  const fallback = (operation: string, requestId: string, error: unknown) => {
    logger.warn({
      requestId,
      operation,
      provider: "supabase",
      result: "fallback",
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return unavailable;
  };
  const replyRoad = (road: ForecastRoad): ReplyRoad => (road.pilot ? PILOT : { roadCode: road.roadCode, name: road.name.trim() });
  async function roadExposure(national: NationalSources, roadCode: string, segmentId?: string): Promise<string> {
    const roads = await national.roads();
    const road = roads.find((item) => sameRoadCode(item.roadCode, roadCode));
    if (!road)
      return `${roadCode} aún no tiene estimación de exposición climática. Carreteras con estimación: ${roads.map((item) => item.roadCode).join(", ")}. Escribe ESTADO ${roadCode} para sus alertas oficiales.`;
    const view = ExposureLayerSchema.parse(await deps.exposure(road));
    if (view.data.geometryRevision !== road.geometryRevision) return unavailable;
    return formatExposureReply(view, deps.publicUrl, segmentId, replyRoad(road));
  }
  async function overview(national: NationalSources): Promise<string> {
    const roads = await national.roads();
    const views = await Promise.allSettled(roads.map((road) => deps.exposure(road)));
    return formatExposureOverview(
      roads.map((road, index) => {
        const result = views[index];
        const parsed = result?.status === "fulfilled" ? ExposureLayerSchema.safeParse(result.value) : null;
        const view = parsed?.success && parsed.data.data.geometryRevision === road.geometryRevision ? parsed.data : null;
        return { road: replyRoad(road), view };
      }),
      deps.publicUrl,
    );
  }
  /** Pins off the pilot corridor are matched against the other registered roads, with the same 500 m rule. */
  async function pinOnOtherRoad(national: NationalSources, position: { latitude: number; longitude: number }): Promise<string> {
    const roads = (await national.roads()).filter((road) => !road.pilot);
    const found = await national.locate(
      position,
      roads.map((road) => road.geometryRevision),
    );
    if (!found)
      return `El pin está a más de 500 m de las carreteras con estimación (PE-22, ${roads.map((road) => road.roadCode).join(", ")}). Comparte un pin sobre la vía o escribe EXPOSICION PE-22.`;
    return roadExposure(national, found.roadCode, found.segmentId);
  }
  return {
    async status(requestId, query = null) {
      const national = deps.national;
      if (!national) return pilotStatus(requestId);
      const roadCode = query ? parseRoadCode(query) : null;
      try {
        const response = await national.alerts(requestId);
        if (!response) return unavailable;
        const alerts = AlertsResponseSchema.parse(response);
        if (roadCode) return formatRoadStatus(alerts, roadCode, deps.publicUrl);
        const note = query ? `No reconozco "${query.slice(0, 40)}" como código de carretera (por ejemplo PE-22). Resumen nacional:\n` : "";
        return note + formatNationalStatus(alerts, deps.publicUrl);
      } catch (error) {
        return fallback("inbound.status", requestId, error);
      }
    },
    async exposure(location, requestId) {
      const national = deps.national;
      try {
        if (national && location === null) return await overview(national);
        const roadCode = location && "place" in location ? parseRoadCode(location.place) : null;
        if (national && roadCode) return await roadExposure(national, roadCode);
        return await pilotExposure(location, requestId);
      } catch (error) {
        return fallback("inbound.exposure", requestId, error);
      }
    },
  };
  async function pilotStatus(requestId: string): Promise<string> {
    try {
      const context = roadContextResponseSchema.parse(await deps.context({ kind: "official_alerts" }, requestId));
      if (context.kind !== "official_alerts" || context.state === "unavailable") return unavailable;
      const heading = context.state === "stale" ? "SUTRAN · datos guardados, pueden haber cambiado" : "SUTRAN · última consulta completa";
      const lines = context.alerts
        .slice(0, 5)
        .map(
          (item) =>
            `${item.alert.title.slice(0, 100)}: ${item.alert.roadStatus === "unknown" ? "estado desconocido" : item.alert.roadStatus}${item.alert.kilometerLabel ? ` (${item.alert.kilometerLabel.slice(0, 60)})` : ""}.`,
        );
      return `${heading} (${context.asOf}, UTC).\n${lines.length ? lines.join("\n") : "Sin alertas vigentes en esta consulta."}${context.alerts.length > 5 ? `\n${context.alerts.length - 5} alertas adicionales en el mapa.` : ""}\nLa ausencia de alertas no confirma vía libre. Exposición estimada y reportes no confirmados son información separada.\n${deps.publicUrl}`;
    } catch (error) {
      return fallback("inbound.status", requestId, error);
    }
  }
  /** Pilot gazetteer and pin matching; pins off PE-22 continue to the other registered roads. */
  async function pilotExposure(location: ExposureQuery, requestId: string): Promise<string> {
    let segmentId: string | undefined;
    if (location) {
      const input: RoadContextRequest = "place" in location ? { kind: "place", name: location.place } : { kind: "pin", ...location };
      const context = roadContextResponseSchema.parse(await deps.context(input, requestId));
      if (context.kind !== "location" || context.state !== "ready") return unavailable;
      if (context.status === "outside_corridor")
        return deps.national && "latitude" in location
          ? pinOnOtherRoad(deps.national, location)
          : "El pin está a más de 500 m del eje PE-22 disponible. Comparte otro pin sobre la Carretera Central.";
      if (context.status !== "matched" || !context.location)
        return deps.national
          ? "No pude ubicar un tramo único. El catálogo de lugares cubre PE-22; comparte un pin de WhatsApp o escribe el código de la carretera (EXPOSICION PE-32)."
          : "No pude ubicar un tramo único. El catálogo de lugares es limitado; comparte un pin de WhatsApp sobre PE-22.";
      if (context.location.geometryRevision !== deps.geometryRevision) return unavailable;
      segmentId = context.location.segmentId;
    }
    const view = ExposureLayerSchema.parse(await deps.exposure());
    if (view.data.geometryRevision !== deps.geometryRevision) return unavailable;
    return formatExposureReply(view, deps.publicUrl, segmentId);
  }
}
export function createMessagingRoadContext() {
  const geometryRevision = loadGeometryRevision();
  return createRoadContextService({
    repository: createPostgresRoadContextRepository(database(), geometryRevision),
    logger: (entry) =>
      logger[entry.result === "repository_failure" ? "warn" : "info"]({
        ...entry,
        result: entry.result === "repository_failure" ? "fallback" : "ok",
        contextState: entry.result,
      }),
  });
}
export function createDefaultRoadInformation(publicUrl: string): RoadInformation {
  const geometryRevision = loadGeometryRevision();
  const service = createMessagingRoadContext();
  return createRoadInformation({
    context: (input, requestId = randomUUID()) => service.execute(input, requestId),
    exposure: (road) => loadExposureView(24, Date.now(), road),
    publicUrl,
    geometryRevision,
    national: {
      async alerts(requestId) {
        // Loaded on demand: the shared instance reads SUTRAN configuration, which job modules mock away.
        const { roadAlertsService } = await import("@/services/instances");
        const result = await roadAlertsService.getCurrentAlerts({ requestId });
        return result.ok ? result.value : null;
      },
      roads: loadForecastRoads,
      locate: (position, revisions) => locateOnRoads(database(), revisions, position),
    },
  });
}
