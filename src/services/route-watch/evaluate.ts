import type { AlertLandmark } from "@/domain/alerts/messages";
import { alertLocation } from "@/domain/alerts/messages";
import { composeRouteWatchCall } from "@/domain/route-watch/call-script";
import { estimatedArrival, prioritizeRouteIncidents } from "@/domain/route-watch/prioritize";
import type { TripRepository } from "@/db/trips";
import type { MessagingProvider, VoiceCaller } from "@/integrations/messaging/types";
import { logger } from "@/lib/logger";
import type { OfficialState, WatchIncident } from "./collect-incidents";

// Route watch evaluation (F4). Runs from a scheduled job: for each consenting trip it ranks the
// incidents on and just beyond the remaining route and calls the monitor about the most
// relevant urgent one that has not been called about yet.

/** A trip keeps being watched for a while after its estimated arrival, since trucks run late. */
export const TRIP_COMPLETION_GRACE_MS = 2 * 60 * 60_000;
/** Synthesis language for Peruvian Spanish listeners. */
export const CALL_LANGUAGE = "es-ES";
/** Ranked incidents returned per trip for inspection; the call only uses the first eligible one. */
const SUMMARY_INCIDENTS_PER_TRIP = 5;

/** Spoken name of the watched stretch, from the nearest landmarks to its ends when available. */
function routeLabel(trip: { originKm: number; destinationKm: number }, landmarks: readonly AlertLandmark[]): string {
  const end = (km: number) => {
    const label = alertLocation(km, km, landmarks);
    return label.startsWith("cerca") ? label : `el kilómetro ${Math.round(km)} del mapa`;
  };
  return `desde ${end(trip.originKm)} hasta ${end(trip.destinationKm)}`;
}

export interface TripOutcome {
  tripId: string;
  state: "not_departed" | "completed" | "no_urgent_incident" | "would_call" | "called" | "call_failed";
  ranked: Array<{ key: string; type: string; score: number; callWorthy: boolean; placement: string; distanceAheadKm: number }>;
  calledIncidentKey?: string;
  providerCallId?: string;
  error?: string;
}

export interface RouteWatchDeps {
  trips: Pick<TripRepository, "watched" | "setStatus" | "calledIncidentKeys" | "recordCall">;
  testPhoneKeys: readonly string[];
  loadIncidents: (nowMs: number, requestId: string) => Promise<{ incidents: WatchIncident[]; officialState: OfficialState }>;
  landmarks: () => Promise<AlertLandmark[]>;
  voice: VoiceCaller;
  messaging: MessagingProvider;
  now: () => number;
}

export function createRouteWatchEvaluator(deps: RouteWatchDeps) {
  /** `rankOnly` reports what would be called without dialing or changing any trip. */
  return async function evaluate(requestId: string, options: { tripId?: string; rankOnly?: boolean } = {}) {
    const nowMs = deps.now();
    const trips = (await deps.trips.watched(deps.testPhoneKeys)).filter((trip) => !options.tripId || trip.id === options.tripId);
    if (!trips.length) return { officialState: null, trips: [] as TripOutcome[] };
    const [{ incidents, officialState }, landmarks] = await Promise.all([deps.loadIncidents(nowMs, requestId), deps.landmarks()]);
    if (officialState !== "ready")
      logger.warn({ requestId, operation: "route_watch.evaluate", provider: "sutran", result: "fallback", officialState });

    const outcomes: TripOutcome[] = [];
    for (const trip of trips) {
      if (Date.parse(trip.departAt) > nowMs) {
        outcomes.push({ tripId: trip.id, state: "not_departed", ranked: [] });
        continue;
      }
      if (nowMs > Date.parse(estimatedArrival(trip)) + TRIP_COMPLETION_GRACE_MS) {
        if (!options.rankOnly) await deps.trips.setStatus(trip.id, "completed");
        outcomes.push({ tripId: trip.id, state: "completed", ranked: [] });
        continue;
      }
      if (trip.status === "planned" && !options.rankOnly) await deps.trips.setStatus(trip.id, "active");

      const ranked = prioritizeRouteIncidents(trip, incidents, nowMs);
      const summary = ranked.slice(0, SUMMARY_INCIDENTS_PER_TRIP).map((item) => ({
        key: item.incident.key,
        type: item.incident.type,
        score: item.score,
        callWorthy: item.callWorthy,
        placement: item.placement,
        distanceAheadKm: Number(item.distanceAheadKm.toFixed(1)),
      }));
      const alreadyCalled = await deps.trips.calledIncidentKeys(trip.id);
      // One call per trip per run: a monitor interrupted repeatedly stops listening.
      const target = ranked.find((item) => item.callWorthy && !alreadyCalled.has(item.incident.key));
      if (!target) {
        outcomes.push({ tripId: trip.id, state: "no_urgent_incident", ranked: summary });
        continue;
      }
      if (options.rankOnly) {
        outcomes.push({ tripId: trip.id, state: "would_call", ranked: summary, calledIncidentKey: target.incident.key });
        continue;
      }

      const script = composeRouteWatchCall(target, {
        routeLabel: routeLabel(trip, landmarks),
        location: alertLocation(target.incident.startKm, target.incident.endKm, landmarks),
        nowMs,
      });
      const idempotencyKey = `route-watch:${trip.id}:${target.incident.key}`;
      const placed = await deps.voice.placeTextToSpeechCall({
        to: trip.destination,
        text: script.spokenText,
        language: CALL_LANGUAGE,
        idempotencyKey,
        requestId,
      });
      if (!placed.ok) {
        logger.error({
          requestId,
          operation: "route_watch.call",
          provider: "zavu",
          result: "error",
          tripId: trip.id,
          errorType: placed.error,
        });
        outcomes.push({
          tripId: trip.id,
          state: "call_failed",
          ranked: summary,
          calledIncidentKey: target.incident.key,
          error: placed.error,
        });
        continue;
      }
      await deps.trips.recordCall({
        tripId: trip.id,
        incidentKey: target.incident.key,
        incidentId: target.incident.incidentId,
        providerCallId: placed.value.providerMessageId,
        outcome: {
          score: target.score,
          reasons: target.reasons,
          placement: target.placement,
          distanceAheadKm: target.distanceAheadKm,
          etaMinutes: target.etaMinutes,
          isTest: target.incident.isTest,
        },
      });
      // The written follow-up is best effort: outside the 24-hour WhatsApp window it is rejected,
      // and the call itself already delivered the alert.
      const followUp = await deps.messaging.sendText({
        to: trip.destination,
        text: script.followUpText,
        channel: "whatsapp",
        idempotencyKey: `${idempotencyKey}:whatsapp`,
        requestId,
      });
      logger.info({
        requestId,
        operation: "route_watch.call",
        provider: "zavu",
        result: "ok",
        tripId: trip.id,
        incidentKey: target.incident.key,
        followUp: followUp.ok ? "sent" : followUp.error,
      });
      outcomes.push({
        tripId: trip.id,
        state: "called",
        ranked: summary,
        calledIncidentKey: target.incident.key,
        providerCallId: placed.value.providerMessageId,
      });
    }
    return { officialState, trips: outcomes };
  };
}
