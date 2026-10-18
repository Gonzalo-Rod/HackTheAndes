import { randomUUID } from "node:crypto";
import { readBundledHazardSource } from "@peruroad/road-data/model-inputs";
import { createWarningProvider } from "@peruroad/road-data/official-warnings";
import type { NationalWarnings } from "@/contracts/model-inputs";
import { getArrayBuffer, getJson } from "@/integrations/http/fetch-json";
import { logger } from "@/lib/logger";
import { platformRoute } from "./http";

// SENAMHI publishes quebrada-activation warnings once a day; 10 minutes keeps the map current
// without fetching the WFS and bulletin on every dashboard load.
const WARNINGS_CACHE_MS = 10 * 60_000;
type Layer = { features: NationalWarnings["data"]["features"] };

export function createNationalWarnings(deps: {
  fetchLive: (requestId: string) => Promise<Layer>;
  readSnapshot: () => Promise<{ capturedAt: string; warnings: Layer }>;
  now: () => number;
}) {
  let cached: { layer: Layer; fetchedAtMs: number } | undefined;
  return async function load(requestId: string): Promise<NationalWarnings> {
    const nowMs = deps.now();
    if (cached && nowMs - cached.fetchedAtMs < WARNINGS_CACHE_MS) return view(cached.layer, cached.fetchedAtMs, "live");
    const started = performance.now();
    try {
      const layer = await deps.fetchLive(requestId);
      cached = { layer, fetchedAtMs: nowMs };
      return view(layer, nowMs, "live");
    } catch (error) {
      logger.warn({
        requestId,
        operation: "hazards.national_warnings",
        provider: "senamhi",
        durationMs: performance.now() - started,
        result: "fallback",
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      // A previous live result is newer than the bundled capture.
      if (cached) return view(cached.layer, cached.fetchedAtMs, "cache");
      const snapshot = await deps.readSnapshot();
      return view(snapshot.warnings, Date.parse(snapshot.capturedAt), "snapshot");
    }
  };
}

function view(layer: Layer, fetchedAtMs: number, state: NationalWarnings["meta"]["state"]): NationalWarnings {
  const capturedAt = new Date(fetchedAtMs).toISOString();
  const message =
    state === "live"
      ? "Avisos de activación de quebradas de SENAMHI para todo el Perú. Niveles oficiales, no nuestro pronóstico."
      : `SENAMHI no disponible; avisos guardados del ${capturedAt}. Revisa su vigencia; no implica ausencia de peligro.`;
  return { data: { type: "FeatureCollection", features: layer.features }, meta: { state, capturedAt, message } };
}

const loadNationalWarnings = createNationalWarnings({
  fetchLive: (requestId) =>
    createWarningProvider(
      { getJson: (url, options) => getJson(url, { ...options, provider: "senamhi", operation: "hazards.national_warnings" }) },
      {
        getBytes: async (url, options) =>
          new Uint8Array(await getArrayBuffer(url, { ...options, provider: "senamhi", operation: "hazards.national_warnings" })),
      },
    ).fetchLayer(requestId),
  readSnapshot: async () => {
    const source = await readBundledHazardSource();
    return { capturedAt: source.capturedAt, warnings: source.warnings };
  },
  now: Date.now,
});

/** GET /api/hazards/warnings: nationwide SENAMHI warnings, live with cache and dated fallback. */
export const readNationalWarnings = platformRoute("hazards.national_warnings", async () =>
  Response.json(await loadNationalWarnings(randomUUID())),
);
