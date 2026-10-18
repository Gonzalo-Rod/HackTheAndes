import { CatchmentLayerSchema } from "@/contracts/catchments";
import {
  IncidentFeedSchema,
  SegmentsSchema,
  StatsSchema,
  type IncidentFeed,
  type PublicStats,
  type SegmentCollection,
} from "@/contracts/platform";
import { CorridorDataSchema, type CorridorData } from "@/contracts/corridor";
import { AlertDetailResponseSchema, AlertsResponseSchema, type AlertDetailResponse, type AlertsResponse } from "@/contracts/road-alerts";
import {
  CorridorRainResponseSchema,
  NationalRainResponseSchema,
  type CorridorRainResponse,
  type NationalRainResponse,
} from "@/contracts/weather";
import { getJson, UpstreamError } from "@/integrations/http/fetch-json";

// Browser adapter for this app's own API and static data. Responses are validated
// against the shared contracts before the UI uses them.

const PROVIDER = "dashboard-api";
/**
 * The server already retries SUTRAN (8 s per attempt, up to 3 attempts plus backoff ≈ 26 s worst case),
 * so the browser makes a single attempt that outlasts it instead of stacking duplicate requests.
 */
const API_TIMEOUT_MS = 30_000;

function parseOrThrow<T>(
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } },
  body: unknown,
  what: string,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new UpstreamError(`Respuesta inválida (${what})`, "invalid_body", PROVIDER);
  return parsed.data;
}

export async function fetchRoadAlerts({ fresh = false }: { fresh?: boolean } = {}): Promise<AlertsResponse> {
  const body = await getJson(`/api/sutran/alerts${fresh ? "?fresh=1" : ""}`, {
    provider: PROVIDER,
    operation: "dashboard.alerts",
    timeoutMs: API_TIMEOUT_MS,
    retries: 0,
  });
  return parseOrThrow(AlertsResponseSchema, body, "alertas");
}

export async function fetchAlertDetail(id: string): Promise<AlertDetailResponse> {
  const body = await getJson(
    id.startsWith("community:") ? `/api/incidents/${encodeURIComponent(id.slice(10))}` : `/api/sutran/alerts/${encodeURIComponent(id)}`,
    {
      provider: PROVIDER,
      operation: "dashboard.alertDetail",
      timeoutMs: API_TIMEOUT_MS,
      retries: 0,
    },
  );
  return parseOrThrow(AlertDetailResponseSchema, body, "detalle");
}

export async function fetchCorridor(): Promise<CorridorData> {
  const body = await getJson("/api/corridor", { provider: PROVIDER, operation: "dashboard.corridor", retries: 1 });
  return parseOrThrow(CorridorDataSchema, body, "corredor");
}

export async function fetchCorridorRain(): Promise<CorridorRainResponse> {
  const body = await getJson("/api/weather/pe22", {
    provider: PROVIDER,
    operation: "dashboard.corridorRain",
    timeoutMs: API_TIMEOUT_MS,
    retries: 0,
  });
  return parseOrThrow(CorridorRainResponseSchema, body, "lluvia");
}

/** User-facing (Spanish) explanation of a failed request. */
export async function fetchNationalRain(): Promise<NationalRainResponse> {
  const body = await getJson("/api/weather/national", {
    provider: PROVIDER,
    operation: "dashboard.nationalRain",
    retries: 0,
    timeoutMs: API_TIMEOUT_MS,
  });
  return parseOrThrow(NationalRainResponseSchema, body, "lluvia nacional");
}

export async function fetchRoadNetwork() {
  const { RoadNetworkSchema } = await import("@/contracts/road-network");
  return parseOrThrow(
    RoadNetworkSchema,
    await getJson("/data/red-vial-nacional.geojson", { provider: PROVIDER, operation: "dashboard.roadNetwork", retries: 1 }),
    "red vial nacional",
  );
}

export function describeFetchError(error: unknown): string {
  if (error instanceof UpstreamError) {
    if (error.kind === "timeout") return "La consulta tardó demasiado.";
    if (error.kind === "network") return "Sin conexión con el servidor.";
    if (error.kind === "invalid_body") return "La respuesta llegó con un formato inesperado.";
    if (error.status === 404) return "El recurso ya no está disponible.";
    if (error.status === 503 || error.status === 502) return "La fuente de datos no está respondiendo.";
    return `Error del servidor (${error.status ?? "?"}).`;
  }
  return "Error inesperado.";
}

export async function fetchCommunityIncidents(): Promise<IncidentFeed> {
  return parseOrThrow(
    IncidentFeedSchema,
    await getJson("/api/incidents", { provider: PROVIDER, operation: "dashboard.community", retries: 0 }),
    "reportes comunitarios",
  );
}
/** Without a road code the pilot corridor is returned. */
export async function fetchSegments(roadCode?: string): Promise<SegmentCollection> {
  const url = roadCode ? `/api/segments?${new URLSearchParams({ road: roadCode })}` : "/api/segments";
  return parseOrThrow(SegmentsSchema, await getJson(url, { provider: PROVIDER, operation: "dashboard.segments", retries: 0 }), "segmentos");
}
export async function fetchStats(): Promise<PublicStats> {
  return parseOrThrow(
    StatsSchema,
    await getJson("/api/stats", { provider: PROVIDER, operation: "dashboard.stats", retries: 0 }),
    "impacto",
  );
}

export async function fetchCatchments() {
  return parseOrThrow(
    CatchmentLayerSchema,
    await getJson("/api/catchments", { provider: PROVIDER, operation: "dashboard.catchments", retries: 0 }),
    "cuencas",
  );
}

export async function fetchHazardLayer() {
  const { HazardLayerSchema } = await import("@/contracts/model-inputs");
  return parseOrThrow(
    HazardLayerSchema,
    await getJson("/api/hazards", { provider: PROVIDER, operation: "dashboard.hazards", retries: 0 }),
    "capas oficiales",
  );
}
export async function fetchNationalWarnings() {
  const { NationalWarningsSchema } = await import("@/contracts/model-inputs");
  return parseOrThrow(
    NationalWarningsSchema,
    await getJson("/api/hazards/warnings", { provider: PROVIDER, operation: "dashboard.nationalWarnings", retries: 0 }),
    "avisos SENAMHI",
  );
}
export async function fetchCatchmentWeather() {
  const { CatchmentWeatherLayerSchema } = await import("@/contracts/model-inputs");
  return parseOrThrow(
    CatchmentWeatherLayerSchema,
    await getJson("/api/weather/catchments", { provider: PROVIDER, operation: "dashboard.catchmentWeather", retries: 0 }),
    "lluvia por cuenca",
  );
}

export async function fetchExposure(roadCode: string) {
  const { ExposureLayerSchema } = await import("@/contracts/exposure");
  const query = new URLSearchParams({ horizonHours: "72", road: roadCode });
  return parseOrThrow(
    ExposureLayerSchema,
    await getJson(`/api/exposure?${query}`, { provider: PROVIDER, operation: "dashboard.exposure", retries: 0 }),
    `exposición climática ${roadCode}`,
  );
}

export async function fetchForecastRoads() {
  const { ForecastRoadsResponseSchema } = await import("@/contracts/forecast-roads");
  return parseOrThrow(
    ForecastRoadsResponseSchema,
    await getJson("/api/exposure/roads", { provider: PROVIDER, operation: "dashboard.forecastRoads", retries: 1 }),
    "carreteras con estimación",
  );
}

export async function fetchRoadHistory() {
  const { RoadHistoryResponseSchema } = await import("@/contracts/road-history");
  return parseOrThrow(
    RoadHistoryResponseSchema,
    await getJson("/api/history/road-events", { provider: PROVIDER, operation: "dashboard.roadHistory", retries: 1 }),
    "emergencias históricas",
  );
}

/** Null when the server has no bot number configured (503); other failures still throw. */
export async function fetchWhatsAppContact() {
  const { WhatsAppContactSchema } = await import("@/contracts/platform");
  try {
    return parseOrThrow(
      WhatsAppContactSchema,
      await getJson("/api/whatsapp", { provider: PROVIDER, operation: "dashboard.whatsapp", retries: 1 }),
      "contacto de WhatsApp",
    );
  } catch (error) {
    if (error instanceof UpstreamError && error.status === 503) return null;
    throw error;
  }
}
