import { performance } from "node:perf_hooks";
import {
  roadContextRequestSchema,
  roadContextResponseSchema,
  spatialContextSchema,
  officialContextArchiveSchema,
  type RoadContextRepository,
  type RoadContextLog,
  type RoadContextResponse,
} from "../contracts/road-context.ts";
import { preparePe22Geometry } from "./prepare-pe22.ts";
import { validateGazetteerSnapshot } from "./prepare-pe22-gazetteer.ts";
import { createRoadLocator } from "../domain/road-data/locate-road-position.ts";
import { resolvePlaceName } from "../domain/road-data/build-gazetteer.ts";
import type { Gazetteer } from "../contracts/road-locations.ts";
import { currentOfficialContext } from "../domain/road-data/current-official-context.ts";
type Spatial = {
  gazetteer: Gazetteer;
  locator: Extract<ReturnType<typeof createRoadLocator>, { ok: true }>["value"];
};
type Archive = ReturnType<typeof officialContextArchiveSchema.parse>;

function limaDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function createRoadContextService({
  repository,
  clock = () => new Date(),
  logger = (entry: RoadContextLog) => console.error(JSON.stringify(entry)),
}: {
  repository: RoadContextRepository;
  clock?: () => Date;
  logger?: (entry: RoadContextLog) => void;
}) {
  let spatialCache: Spatial | undefined;
  let officialCache: Archive | undefined;
  return {
    async execute(input: unknown, requestId: string): Promise<RoadContextResponse> {
      const request = roadContextRequestSchema.parse(input);
      const startedAt = performance.now();
      const now = clock();
      let fallback = false;
      const log = (result: string, error?: unknown) =>
        logger({
          requestId,
          operation: "road.context",
          provider: "supabase",
          durationMs: performance.now() - startedAt,
          result,
          ...(error ? { errorType: error instanceof Error ? error.name : "UnknownError" } : {}),
        });
      const metadata = (
        asOf: string | null,
        state: "ready" | "stale" | "unavailable",
        message: string,
      ) => ({
        state,
        servedAt: now.toISOString(),
        asOf,
        dataAgeMs: asOf ? Math.max(0, now.getTime() - Date.parse(asOf)) : null,
        message,
      });
      if (request.kind === "official_alerts") {
        let archive: Archive | undefined;
        try {
          archive = officialContextArchiveSchema.parse(await repository.readOfficial());
          if (
            !officialCache?.poll ||
            (archive.poll &&
              Date.parse(archive.poll.finishedAt) >= Date.parse(officialCache.poll.finishedAt))
          )
            officialCache = archive;
        } catch (error) {
          fallback = true;
          log("repository_failure", error);
          archive = officialCache;
        }
        if (!archive?.poll)
          return roadContextResponseSchema.parse({
            kind: "official_alerts",
            ...metadata(
              null,
              "unavailable",
              "La fuente vial no está disponible. No podemos confirmar el estado de la vía.",
            ),
            alerts: [],
            absenceDoesNotConfirmClearance: true,
          });
        const current = currentOfficialContext(archive, now.getTime(), limaDate(now));
        if (!current) throw new Error("A completed source poll is required");
        const stale = fallback || current.stale;
        const alerts = current.alerts;
        log(stale ? "stale" : "ready");
        return roadContextResponseSchema.parse({
          kind: "official_alerts",
          ...metadata(
            archive.poll.finishedAt,
            stale ? "stale" : "ready",
            stale
              ? "Datos viales guardados; revisa su antigüedad. La ausencia de alertas no confirma vía libre."
              : "Alertas oficiales de la última consulta completa. La ausencia de alertas no confirma vía libre.",
          ),
          alerts,
          absenceDoesNotConfirmClearance: true,
        });
      }
      let spatial: Spatial | undefined;
      try {
        const raw = spatialContextSchema.parse(await repository.readSpatial());
        const geometry = preparePe22Geometry(raw.source);
        if (!geometry.ok) throw new Error("Stored road geometry is invalid");
        const gazetteer = validateGazetteerSnapshot(geometry.value.segments, raw.gazetteer);
        const locator = createRoadLocator(geometry.value.segments);
        if (!gazetteer.ok || !locator.ok) throw new Error("Stored spatial context is incompatible");
        spatial = { gazetteer: gazetteer.value, locator: locator.value };
        if (
          !spatialCache ||
          Date.parse(spatial.gazetteer.source.retrievedAt) >=
            Date.parse(spatialCache.gazetteer.source.retrievedAt)
        )
          spatialCache = spatial;
      } catch (error) {
        fallback = true;
        log("repository_failure", error);
        spatial = spatialCache;
      }
      const base = {
        kind: "location" as const,
        requiresConfirmation: true as const,
        location: null,
        candidates: [],
      };
      if (!spatial)
        return roadContextResponseSchema.parse({
          ...base,
          ...metadata(
            null,
            "unavailable",
            "No podemos ubicar el lugar ahora. Comparte tu ubicación o intenta más tarde.",
          ),
          status: "unavailable",
        });
      const meta = metadata(
        spatial.gazetteer.source.retrievedAt,
        fallback ? "stale" : "ready",
        fallback
          ? "Referencias guardadas; confirma el lugar con el usuario."
          : "Ubicación aproximada sobre PE-22; requiere confirmación. Los kilómetros oficiales no están calibrados.",
      );
      if (request.kind === "pin") {
        const found = spatial.locator.locate([request.longitude, request.latitude]);
        log(found.ok ? "matched" : "outside_corridor");
        return roadContextResponseSchema.parse({
          ...base,
          ...meta,
          status: found.ok ? "matched" : "outside_corridor",
          location: found.ok ? found.value : null,
        });
      }
      const match = resolvePlaceName(spatial.gazetteer, request.name);
      log(match.status);
      return roadContextResponseSchema.parse({
        ...base,
        ...meta,
        status: match.status,
        location: match.status === "matched" ? match.entry.location : null,
        candidates:
          match.status === "matched"
            ? [match.entry]
            : match.status === "ambiguous"
              ? match.candidates
              : [],
      });
    },
  };
}
