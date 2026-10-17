import { randomUUID } from "node:crypto";
import { z } from "zod";
import { readBundledHazards, readBundledHistoricalEvents } from "@peruroad/road-data/model-inputs";
import { readBundledWeather, summarizeOperationalWeather } from "@peruroad/road-data/weather";
import { catchmentWeatherViewSchema } from "@peruroad/road-data/weather/contracts";
import { readHazards, readHistoricalEvents, readWeather } from "@/db/model-inputs";
import { logger } from "@/lib/logger";
import { platformRoute, failure } from "./http";

// The API labels the capture's actual hour window; age never moves old forecasts into the future.
const LIVE_WEATHER_STALE_SECONDS = 90 * 60;
async function loadInput<T extends { capturedAt: string }>(
  operation: string,
  read: () => Promise<T | null>,
  fallback: () => Promise<T>,
  message: string,
  staleAfterSeconds = Infinity,
) {
  const start = performance.now();
  let state: "database" | "snapshot" = "database";
  let data: T;
  try {
    const stored = await read();
    if (!stored) throw new Error("Snapshot unavailable");
    data = stored;
  } catch (error) {
    state = "snapshot";
    logger.warn({
      requestId: randomUUID(),
      operation,
      provider: "supabase",
      durationMs: performance.now() - start,
      result: "fallback",
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    data = await fallback();
  }
  const ageSeconds = Math.max(0, (Date.now() - Date.parse(data.capturedAt)) / 1000);
  return {
    data,
    meta: {
      state,
      servedAt: new Date().toISOString(),
      capturedAt: data.capturedAt,
      ageSeconds,
      stale: ageSeconds > staleAfterSeconds,
      message: state === "snapshot" ? `Instantánea del ${data.capturedAt}. ${message}` : message,
    },
  };
}
const bundledWeather = readBundledWeather;
export const readHazardInputs = platformRoute("hazards.read", async () =>
  Response.json(
    await loadInput(
      "hazards.read",
      readHazards,
      readBundledHazards,
      "Susceptibilidad estática y avisos oficiales; no son nuestro pronóstico de riesgo.",
      LIVE_WEATHER_STALE_SECONDS,
    ),
  ),
);
export const readEventHistory = platformRoute("history.events", async () =>
  Response.json(
    await loadInput(
      "history.events",
      readHistoricalEvents,
      readBundledHistoricalEvents,
      "Registros candidatos con cobertura incompleta; no son un conjunto de evaluación validado.",
    ),
  ),
);
export const readCatchmentRain = platformRoute("weather.catchments", async () => {
  const capture = await loadInput(
    "weather.catchments",
    () => readWeather("operational", "live.json.gz"),
    () => bundledWeather("live.json.gz"),
    "Lluvia de modelo por cuenca; no observaciones de estación ni riesgo calculado.",
    LIVE_WEATHER_STALE_SECONDS,
  );
  const { data } = capture;
  const view = catchmentWeatherViewSchema.parse({
    schemaVersion: 1,
    geometryRevision: data.geometryRevision,
    capturedAt: data.capturedAt,
    model: data.model,
    nominalGridResolutionKm: data.nominalGridResolutionKm,
    forecastIssuedAt: null,
    anchorAt: new Date(Math.floor(Date.parse(data.capturedAt) / 3_600_000) * 3_600_000).toISOString(),
    grids: data.grids.map((grid) => ({ id: grid.id, position: grid.position })),
    catchments: summarizeOperationalWeather(data, Date.parse(data.capturedAt)),
    limitations: data.limitations,
  });
  return Response.json({ data: view, meta: capture.meta });
});
const historyDatasets = {
  "reference-2024": { kind: "reanalysis", file: "reanalysis-2023-12-24-2024-04-30.json.gz" },
  "reference-2025": { kind: "reanalysis", file: "reanalysis-2024-12-24-2025-04-30.json.gz" },
  "yaku-2023": { kind: "reanalysis", file: "reanalysis-2023-02-01-2023-03-31.json.gz" },
  "forecast-2024": { kind: "previous_runs", file: "previous_runs-2024-01-01-2024-04-30.json.gz" },
  "forecast-2025": { kind: "previous_runs", file: "previous_runs-2025-01-01-2025-04-30.json.gz" },
} as const;
export const readWeatherHistory = platformRoute("history.weather", async (request) => {
  const query = z
    .object({ dataset: z.enum(["yaku-2023", "forecast-2024", "forecast-2025", "reference-2024", "reference-2025"]) })
    .strict()
    .safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) failure(400, "invalid_dataset", "Selecciona un conjunto histórico disponible.");
  const dataset = historyDatasets[query.data.dataset];
  return Response.json(
    await loadInput(
      "history.weather",
      () => readWeather(dataset.kind, dataset.file),
      () => bundledWeather(dataset.file),
      dataset.kind === "reanalysis"
        ? "Reconstrucción con reanálisis; no prueba anticipación."
        : "Archivo de plazos fijos por hora; no es una corrida única ni prueba de habilidad.",
    ),
  );
});
