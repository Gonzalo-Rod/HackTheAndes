// Route watch (Team Plan F4, trip watch and call alerts).
//
// A transport monitor at a company such as a mining operation registers the PE-22 stretch a
// truck will drive, or a stretch to watch continuously for a period. While the watch is active, every incident on that stretch and on the roads
// just beyond it is ranked by relevance to the truck, and the most urgent one (for example a
// recent huaico ahead of the truck) triggers a phone call to the monitor. This module is the
// pure ranking: no I/O and no clock, so every decision is reproducible from its inputs.
//
// Estimated climate exposure is deliberately not an input: an estimate alone never authorizes
// an urgent call (docs/team-plan.md, F4 trigger).

export const INCIDENT_TYPES = ["huaico", "derrumbe", "inundación", "bloqueo", "accidente", "obra", "otro"] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];
export type RoadStatus = "interrumpido" | "restringido" | "normal" | "unknown";

export interface RouteIncident {
  /** Stable identity across evaluations, e.g. `sutran:<uuid>` or `community:<uuid>`. */
  key: string;
  source: "official" | "community";
  type: IncidentType;
  roadStatus: RoadStatus;
  /** Distances along the captured PE-22 axis (not official kilometer posts). */
  startKm: number;
  endKm: number;
  /** When the source last reported or confirmed the incident, ISO 8601 UTC. */
  observedAt: string;
  /** Official, or community evidence that meets the alert confidence policy. Others are ranked but never called about. */
  corroborated: boolean;
  /** Demonstration incidents only ever reach demonstration trips. */
  isTest: boolean;
}

export interface WatchedTrip {
  id: string;
  originKm: number;
  destinationKm: number;
  departAt: string;
  avgSpeedKmh: number;
  isTest: boolean;
  /** Set for a continuous route watch: the whole stretch is watched until then, without a truck position. */
  watchUntil?: string | null;
}

/** Trip placements are relative to the estimated truck; route-watch placements to the stretch. */
export type Placement = "ahead" | "beyond_destination" | "on_route" | "near_route";

export type PriorityReason =
  | `type:${IncidentType}`
  | `road_status:${RoadStatus}`
  | "placement:ahead"
  | "placement:beyond_destination"
  | "placement:on_route"
  | "placement:near_route"
  | "arrival_within_1h"
  | "arrival_within_3h"
  | "observed_within_3h"
  | "observed_within_12h"
  | "official_source";

export interface PrioritizedIncident<T extends RouteIncident = RouteIncident> {
  incident: T;
  placement: Placement;
  /** Trip: from the truck's estimated position to the incident. Route watch: from the stretch (0 on it). */
  distanceAheadKm: number;
  /** Estimated minutes until the truck reaches the incident; null for a route watch, which has no truck. */
  etaMinutes: number | null;
  score: number;
  reasons: Array<{ reason: PriorityReason; points: number }>;
  /** True when the incident is urgent enough to interrupt the monitor with a call. */
  callWorthy: boolean;
}

/**
 * Community confidence needed before a report can trigger a call. WhatsApp alerts also relay
 * unconfirmed reports with a label, but a call interrupts the monitor, so a single unconfirmed
 * report never does; 0.7 is the corroborated band of the original alert policy.
 */
export const CALL_COMMUNITY_CONFIDENCE = 0.7;
/** Roads just past the destination (or either end of a watched route) still matter: trucks continue or need a detour. */
export const NEARBY_BUFFER_KM = 5;
/** An incident older than this without a new report is not "recent" enough to call about. */
export const RECENT_INCIDENT_MAX_AGE_MS = 12 * 60 * 60_000;
const VERY_RECENT_MS = 3 * 60 * 60_000;
/** Huaicos and landslides block the road for hours on PE-22; they outrank traffic events. */
const TYPE_POINTS: Record<IncidentType, number> = {
  huaico: 5,
  derrumbe: 4,
  inundación: 3.5,
  bloqueo: 3,
  accidente: 2,
  obra: 1,
  otro: 1,
};
const STATUS_POINTS: Record<RoadStatus, number> = { interrumpido: 3, restringido: 1.5, unknown: 0.5, normal: 0 };
const PLACEMENT_POINTS: Record<Placement, number> = { ahead: 3, beyond_destination: 1, on_route: 3, near_route: 1 };
/** Types that can trap a truck on a mountain road even when the source has not closed it yet. */
const HAZARD_TYPES: ReadonlySet<IncidentType> = new Set(["huaico", "derrumbe", "inundación"]);

export function isRouteWatch(trip: WatchedTrip): boolean {
  return Boolean(trip.watchUntil);
}

/** When watching ends: the route-watch deadline, or the estimated arrival plus a grace period for late trucks. */
export function watchEndsAt(trip: WatchedTrip, tripGraceMs: number): string {
  if (trip.watchUntil) return new Date(trip.watchUntil).toISOString();
  return new Date(Date.parse(estimatedArrival(trip)) + tripGraceMs).toISOString();
}

/** Estimated truck position from departure time and average speed; GPS is not integrated. */
export function estimatePositionKm(trip: WatchedTrip, nowMs: number): number {
  const routeLengthKm = Math.abs(trip.destinationKm - trip.originKm);
  const elapsedHours = Math.max(0, nowMs - Date.parse(trip.departAt)) / 3_600_000;
  const traveledKm = Math.min(routeLengthKm, elapsedHours * trip.avgSpeedKmh);
  return trip.originKm + Math.sign(trip.destinationKm - trip.originKm) * traveledKm;
}

/** Estimated arrival at the destination, ISO 8601 UTC. */
export function estimatedArrival(trip: WatchedTrip): string {
  const hours = Math.abs(trip.destinationKm - trip.originKm) / trip.avgSpeedKmh;
  return new Date(Date.parse(trip.departAt) + hours * 3_600_000).toISOString();
}

function place(trip: WatchedTrip, incident: RouteIncident, positionKm: number): { placement: Placement; distanceAheadKm: number } | null {
  const direction = Math.sign(trip.destinationKm - trip.originKm);
  const remainingKm = Math.abs(trip.destinationKm - positionKm);
  const edges = [direction * (incident.startKm - positionKm), direction * (incident.endKm - positionKm)];
  const nearKm = Math.min(...edges);
  const farKm = Math.max(...edges);
  if (farKm < 0) return null; // Entirely behind the truck: already passed.
  if (nearKm <= remainingKm) return { placement: "ahead", distanceAheadKm: Math.max(0, nearKm) };
  if (nearKm <= remainingKm + NEARBY_BUFFER_KM) return { placement: "beyond_destination", distanceAheadKm: nearKm };
  return null;
}

function placeOnRoute(trip: WatchedTrip, incident: RouteIncident): { placement: Placement; distanceAheadKm: number } | null {
  const routeLow = Math.min(trip.originKm, trip.destinationKm);
  const routeHigh = Math.max(trip.originKm, trip.destinationKm);
  const incidentLow = Math.min(incident.startKm, incident.endKm);
  const incidentHigh = Math.max(incident.startKm, incident.endKm);
  const gapKm = incidentHigh < routeLow ? routeLow - incidentHigh : incidentLow > routeHigh ? incidentLow - routeHigh : 0;
  if (gapKm === 0) return { placement: "on_route", distanceAheadKm: 0 };
  if (gapKm <= NEARBY_BUFFER_KM) return { placement: "near_route", distanceAheadKm: gapKm };
  return null;
}

export function prioritizeRouteIncidents<T extends RouteIncident>(
  trip: WatchedTrip,
  incidents: readonly T[],
  nowMs: number,
): PrioritizedIncident<T>[] {
  const routeWatch = isRouteWatch(trip);
  const positionKm = estimatePositionKm(trip, nowMs);
  const ranked: PrioritizedIncident<T>[] = [];
  for (const incident of incidents) {
    if (incident.isTest && !trip.isTest) continue;
    const ageMs = nowMs - Date.parse(incident.observedAt);
    // Future timestamps are source errors; they must not look like the most recent evidence.
    if (!Number.isFinite(ageMs) || ageMs < 0) continue;
    const placed = routeWatch ? placeOnRoute(trip, incident) : place(trip, incident, positionKm);
    if (!placed) continue;

    const etaMinutes = routeWatch ? null : Math.round((placed.distanceAheadKm / trip.avgSpeedKmh) * 60);
    const reasons: PrioritizedIncident<T>["reasons"] = [
      { reason: `type:${incident.type}`, points: TYPE_POINTS[incident.type] },
      { reason: `road_status:${incident.roadStatus}`, points: STATUS_POINTS[incident.roadStatus] },
      { reason: `placement:${placed.placement}`, points: PLACEMENT_POINTS[placed.placement] },
    ];
    if (etaMinutes !== null && placed.placement === "ahead" && etaMinutes <= 60) reasons.push({ reason: "arrival_within_1h", points: 2 });
    else if (etaMinutes !== null && placed.placement === "ahead" && etaMinutes <= 180)
      reasons.push({ reason: "arrival_within_3h", points: 1 });
    if (ageMs <= VERY_RECENT_MS) reasons.push({ reason: "observed_within_3h", points: 2 });
    else if (ageMs <= RECENT_INCIDENT_MAX_AGE_MS) reasons.push({ reason: "observed_within_12h", points: 1 });
    if (incident.source === "official") reasons.push({ reason: "official_source", points: 1 });

    const callWorthy =
      (incident.corroborated || incident.isTest) &&
      ageMs <= RECENT_INCIDENT_MAX_AGE_MS &&
      incident.roadStatus !== "normal" &&
      (HAZARD_TYPES.has(incident.type) || incident.roadStatus === "interrumpido");
    ranked.push({
      incident,
      ...placed,
      etaMinutes,
      score: reasons.reduce((total, item) => total + item.points, 0),
      reasons,
      callWorthy,
    });
  }
  return ranked.sort((a, b) => b.score - a.score || a.distanceAheadKm - b.distanceAheadKm || a.incident.key.localeCompare(b.incident.key));
}

const ACCENTS = /[\u0300-\u036f]/g;
const OFFICIAL_TYPE_KEYWORDS: Array<[IncidentType, RegExp]> = [
  ["huaico", /\bhua[iy]cos?\b/],
  ["derrumbe", /\b(derrumbes?|deslizamientos?|caida de rocas|desprendimientos?)\b/],
  ["inundación", /\b(inundacion|desborde|crecida)\b/],
  ["bloqueo", /\b(bloqueo|paro|manifestacion|protesta)\b/],
  ["accidente", /\b(accidente|despiste|volcadura|choque|colision)\b/],
  ["obra", /\b(obras?|mantenimiento|trabajos)\b/],
];

/** SUTRAN has no incident-type field; its cause and title text name the event. */
export function classifyOfficialIncident(cause: string, title: string): IncidentType {
  const text = `${cause} ${title}`.normalize("NFD").replace(ACCENTS, "").toLowerCase();
  return OFFICIAL_TYPE_KEYWORDS.find(([, pattern]) => pattern.test(text))?.[0] ?? "otro";
}
