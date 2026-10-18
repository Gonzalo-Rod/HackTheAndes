import { randomUUID } from "node:crypto";
import { createPostgresRoadContextRepository, createRoadContextService } from "@peruroad/road-data/context";
import { roadContextResponseSchema, type RoadContextRequest, type RoadContextResponse } from "@peruroad/road-data/context/contracts";
import type { ExposureLayer } from "@/contracts/exposure";
import { ExposureLayerSchema } from "@/contracts/exposure";
import { loadGeometryRevision } from "@/config/env";
import { database } from "@/db/pool";
import { formatExposureReply } from "@/domain/messaging/exposure-reply";
import { loadExposureView } from "@/services/platform/exposure";
import { logger } from "@/lib/logger";

export interface RoadInformation {
  status(requestId: string): Promise<string>;
  exposure(location: { place: string } | { latitude: number; longitude: number } | null, requestId: string): Promise<string>;
}
export function createRoadInformation(deps: {
  context: (input: RoadContextRequest, requestId: string) => Promise<RoadContextResponse>;
  exposure: () => Promise<ExposureLayer>;
  publicUrl: string;
  geometryRevision: string;
}): RoadInformation {
  const unavailable = `No podemos consultar esta fuente ahora. No implica vía libre ni riesgo bajo. Mapa y antigüedad de datos: ${deps.publicUrl}`;
  return {
    async status(requestId) {
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
        logger.warn({
          requestId,
          operation: "inbound.status",
          provider: "supabase",
          result: "fallback",
          errorType: error instanceof Error ? error.name : "UnknownError",
        });
        return unavailable;
      }
    },
    async exposure(location, requestId) {
      try {
        let segmentId: string | undefined;
        if (location) {
          const input: RoadContextRequest = "place" in location ? { kind: "place", name: location.place } : { kind: "pin", ...location };
          const context = roadContextResponseSchema.parse(await deps.context(input, requestId));
          if (context.kind !== "location" || context.state !== "ready") return unavailable;
          if (context.status === "outside_corridor")
            return "El pin está a más de 500 m del eje PE-22 disponible. Comparte otro pin sobre la Carretera Central.";
          if (context.status !== "matched" || !context.location)
            return "No pude ubicar un tramo único. El catálogo de lugares es limitado; comparte un pin de WhatsApp sobre PE-22.";
          if (context.location.geometryRevision !== deps.geometryRevision) return unavailable;
          segmentId = context.location.segmentId;
        }
        const view = ExposureLayerSchema.parse(await deps.exposure());
        if (view.data.geometryRevision !== deps.geometryRevision) return unavailable;
        return formatExposureReply(view, deps.publicUrl, segmentId);
      } catch (error) {
        logger.warn({
          requestId,
          operation: "inbound.exposure",
          provider: "supabase",
          result: "fallback",
          errorType: error instanceof Error ? error.name : "UnknownError",
        });
        return unavailable;
      }
    },
  };
}
export function createDefaultRoadInformation(publicUrl: string): RoadInformation {
  const geometryRevision = loadGeometryRevision();
  const service = createRoadContextService({
    repository: createPostgresRoadContextRepository(database(), geometryRevision),
    logger: (entry) =>
      logger[entry.result === "repository_failure" ? "warn" : "info"]({
        ...entry,
        result: entry.result === "repository_failure" ? "fallback" : "ok",
        contextState: entry.result,
      }),
  });
  return createRoadInformation({
    context: (input, requestId = randomUUID()) => service.execute(input, requestId),
    exposure: () => loadExposureView(24),
    publicUrl,
    geometryRevision,
  });
}
