import type { AlertCandidate } from "@/contracts/notifications";
import type { AlertsResponse, RoadStatus } from "@/contracts/road-alerts";
import type { RoadPosition } from "@/db/road-locator";
import { alertLocation, officialAlertText } from "@/domain/alerts/messages";
import { sameRoadCode } from "@/domain/messaging/dashboard-links";

/** Same freshness bound as the pilot's database poll: cached or older data never triggers an alert. */
const OFFICIAL_MAX_AGE_MS = 30 * 60_000;
const STATUS: Record<RoadStatus, { text: "normal" | "restringido" | "interrumpido" | "unknown"; level: number }> = {
  interrumpido: { text: "interrumpido", level: 3 },
  restringido: { text: "restringido", level: 2 },
  desconocido: { text: "unknown", level: 1 },
  normal: { text: "normal", level: 0 },
};

/**
 * Official candidates for a road outside the pilot. Only PE-22 is archived in the database, so other
 * roads use the dashboard's live national feed; each alert is placed on the road within 500 m.
 */
export async function nationalOfficialCandidates(input: {
  response: AlertsResponse | null;
  roadCode: string;
  revision: string;
  locate: (position: { latitude: number; longitude: number }, revisions: readonly string[]) => Promise<RoadPosition | null>;
  nowMs: number;
}): Promise<AlertCandidate[]> {
  const { response } = input;
  if (!response || response.meta.stale) return [];
  const fetchedMs = Date.parse(response.meta.fetchedAt);
  if (fetchedMs > input.nowMs || input.nowMs - fetchedMs >= OFFICIAL_MAX_AGE_MS) return [];
  const candidates: AlertCandidate[] = [];
  for (const alert of response.alerts.filter((item) => sameRoadCode(item.roadCode, input.roadCode))) {
    const placed = await input.locate({ latitude: alert.lat, longitude: alert.lng }, [input.revision]);
    if (!placed || placed.geometryRevision !== input.revision) continue;
    const km = placed.distanceFromOriginKm;
    const status = STATUS[alert.roadStatus];
    candidates.push({
      key: `sutran:${alert.id}`,
      fingerprint: `${status.text}:${alert.title.slice(0, 200)}`,
      kind: "official",
      level: status.level,
      startKm: km,
      endKm: km,
      expiresAt: new Date(fetchedMs + OFFICIAL_MAX_AGE_MS).toISOString(),
      text: officialAlertText(status.text, alert.title, alertLocation(km, km, [])),
      isTest: false,
    });
  }
  return candidates;
}
