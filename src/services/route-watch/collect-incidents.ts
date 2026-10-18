import type { RoadContextRequest, RoadContextResponse } from "@peruroad/road-data/context/contracts";
import { roadContextResponseSchema } from "@peruroad/road-data/context/contracts";
import {
  CALL_COMMUNITY_CONFIDENCE,
  classifyOfficialIncident,
  RECENT_INCIDENT_MAX_AGE_MS,
  type RouteIncident,
} from "@/domain/route-watch/prioritize";
import type { TripRepository } from "@/db/trips";

/** Matches the 30-minute complete-poll freshness boundary used by driver alerts. */
const OFFICIAL_MAX_AGE_MS = 30 * 60_000;

export type WatchIncident = RouteIncident & { incidentId: string | null };
export type OfficialState = "ready" | "stale" | "unavailable";

/**
 * Gathers the incidents route watch can rank: current SUTRAN alerts placed on the captured
 * axis, and active community incidents. A stale or unavailable SUTRAN poll is reported to the
 * caller and contributes nothing; it never reads as "no incidents".
 */
export async function collectRouteIncidents(
  deps: {
    trips: Pick<TripRepository, "communityIncidents">;
    context: (input: RoadContextRequest, requestId: string) => Promise<RoadContextResponse>;
    revision: string;
  },
  nowMs: number,
  requestId: string,
): Promise<{ incidents: WatchIncident[]; officialState: OfficialState }> {
  const incidents: WatchIncident[] = [];
  const official = roadContextResponseSchema.parse(await deps.context({ kind: "official_alerts" }, requestId));
  let officialState: OfficialState = "unavailable";
  if (official.kind === "official_alerts" && official.state !== "unavailable" && official.asOf) {
    const ageMs = nowMs - Date.parse(official.asOf);
    officialState = official.state === "ready" && ageMs >= 0 && ageMs < OFFICIAL_MAX_AGE_MS ? "ready" : "stale";
  }
  if (official.kind === "official_alerts" && officialState === "ready") {
    for (const item of official.alerts) {
      const alert = item.alert;
      if (!alert.location || alert.expired || alert.notYetValid) continue;
      const located = roadContextResponseSchema.parse(await deps.context({ kind: "pin", ...alert.location }, requestId));
      if (
        located.kind !== "location" ||
        located.state !== "ready" ||
        located.status !== "matched" ||
        !located.location ||
        located.location.geometryRevision !== deps.revision
      )
        continue;
      const km = located.location.distanceFromOriginKm;
      incidents.push({
        key: `sutran:${alert.externalId}`,
        incidentId: null,
        source: "official",
        type: classifyOfficialIncident(alert.cause, alert.title),
        roadStatus: alert.roadStatus,
        startKm: km,
        endKm: km,
        // The last poll time only says the alert still exists; the source update says when it happened.
        observedAt: alert.sourceUpdatedAt ?? item.firstObservedAt,
        corroborated: true,
        isTest: false,
      });
    }
  }

  const since = new Date(nowMs - RECENT_INCIDENT_MAX_AGE_MS).toISOString();
  for (const row of await deps.trips.communityIncidents(deps.revision, since, new Date(nowMs).toISOString())) {
    incidents.push({
      key: `community:${row.id}`,
      incidentId: row.id,
      source: "community",
      type: row.type,
      roadStatus: row.roadStatus,
      startKm: row.startKm,
      endKm: row.endKm,
      observedAt: row.lastConfirmed,
      corroborated: row.confidence >= CALL_COMMUNITY_CONFIDENCE,
      isTest: row.isTest,
    });
  }
  return { incidents, officialState };
}
