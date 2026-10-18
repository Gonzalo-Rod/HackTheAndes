import { CorridorDataSchema, type CorridorData } from "@/contracts/corridor";
import { AlertDetailResponseSchema, AlertsResponseSchema, type AlertDetailResponse, type AlertsResponse } from "@/contracts/road-alerts";
import { CorridorRainResponseSchema, type CorridorRainResponse } from "@/contracts/weather";
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
  const body = await getJson(`/api/sutran/alerts/${encodeURIComponent(id)}`, {
    provider: PROVIDER,
    operation: "dashboard.alertDetail",
    timeoutMs: API_TIMEOUT_MS,
    retries: 0,
  });
  return parseOrThrow(AlertDetailResponseSchema, body, "detalle");
}

export async function fetchCorridor(): Promise<CorridorData> {
  const body = await getJson("/data/pe22.json", { provider: PROVIDER, operation: "dashboard.corridor", retries: 1 });
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
