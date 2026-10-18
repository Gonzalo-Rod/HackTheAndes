// Confidence v1 for community incidents (Team Plan section 5). Deterministic and auditable:
// every point of the score comes from a named reason, so the incident panel can show what it
// is based on. The score ranks evidence; it is not a probability and never turns community
// evidence into an official road status.

export interface CommunityEvidence {
  /** Distinct reporter identities (HMAC phone keys) that reported the incident as active. */
  independentReporters: number;
  /** Reporters whose earlier reports were later corroborated by others or by an official source. */
  reputableReporters: number;
  /** At least one report placed with a shared WhatsApp pin rather than a gazetteer match. */
  hasSharedPin: boolean;
  hasPhoto: boolean;
  /** A subscriber confirmed the incident during a confirmation call. */
  confirmedByCall: boolean;
  /** An active official (SUTRAN) incident matches by type, distance and time. */
  officialMatch: boolean;
  /** The segment's fresh climate-exposure assessment is high or very high. */
  exposureAgrees: boolean;
  /** Latest active report or confirmation, ISO 8601. */
  lastConfirmedAt: string;
}

export type ConfidenceReason =
  | "first_report"
  | "independent_reporters"
  | "reputable_reporters"
  | "shared_pin"
  | "photo"
  | "call_confirmation"
  | "exposure_agreement"
  | "official_match"
  | "decay";

export type ConfidenceLevel = "unconfirmed" | "corroborated" | "official";

export interface Confidence {
  score: number;
  level: ConfidenceLevel;
  /** Signed contribution of each reason, in the order applied. */
  reasons: Array<{ reason: ConfidenceReason; points: number }>;
}

/** One unverified report keeps the score the publication flow already uses. */
export const FIRST_REPORT_POINTS = 0.2;
export const EXTRA_REPORTER_POINTS = 0.15;
/** More reporters stop adding confidence after this many extra identities. */
export const MAX_EXTRA_REPORTERS = 3;
export const REPUTABLE_REPORTER_POINTS = 0.05;
export const MAX_REPUTABLE_REPORTERS = 2;
export const SHARED_PIN_POINTS = 0.05;
export const PHOTO_POINTS = 0.05;
export const CALL_CONFIRMATION_POINTS = 0.15;
export const EXPOSURE_AGREEMENT_POINTS = 0.05;
/** Community evidence alone never reaches the official band. */
export const COMMUNITY_SCORE_CAP = 0.75;
export const OFFICIAL_MATCH_SCORE = 0.9;
/** Community evidence loses half its weight every 3 hours without a new confirmation (the dedupe window). */
export const CONFIDENCE_HALF_LIFE_MS = 3 * 60 * 60_000;
/** Two independent reporters with a shared pin reach the alert threshold; one reporter never does. */
export const CORROBORATED_THRESHOLD = 0.4;

const round = (value: number) => Math.round(value * 1000) / 1000;

export function computeConfidence(evidence: CommunityEvidence, nowMs: number): Confidence {
  const reasons: Confidence["reasons"] = [];
  const add = (reason: ConfidenceReason, points: number) => {
    if (points !== 0) reasons.push({ reason, points: round(points) });
  };

  const reporters = Math.max(1, Math.floor(evidence.independentReporters));
  add("first_report", FIRST_REPORT_POINTS);
  add("independent_reporters", Math.min(reporters - 1, MAX_EXTRA_REPORTERS) * EXTRA_REPORTER_POINTS);
  add(
    "reputable_reporters",
    Math.min(Math.max(0, evidence.reputableReporters), MAX_REPUTABLE_REPORTERS, reporters) * REPUTABLE_REPORTER_POINTS,
  );
  if (evidence.hasSharedPin) add("shared_pin", SHARED_PIN_POINTS);
  if (evidence.hasPhoto) add("photo", PHOTO_POINTS);
  if (evidence.confirmedByCall) add("call_confirmation", CALL_CONFIRMATION_POINTS);
  if (evidence.exposureAgrees) add("exposure_agreement", EXPOSURE_AGREEMENT_POINTS);

  const community = Math.min(
    reasons.reduce((sum, item) => sum + item.points, 0),
    COMMUNITY_SCORE_CAP,
  );
  // A future timestamp (clock skew) counts as fresh rather than raising the score.
  const ageMs = Math.max(0, nowMs - Date.parse(evidence.lastConfirmedAt));
  const decayed = Number.isFinite(ageMs) ? community * 0.5 ** (ageMs / CONFIDENCE_HALF_LIFE_MS) : community;
  add("decay", decayed - community);

  if (evidence.officialMatch) {
    const score = Math.max(decayed, OFFICIAL_MATCH_SCORE);
    add("official_match", score - decayed);
    return { score: round(score), level: "official", reasons };
  }
  const score = round(decayed);
  return { score, level: score >= CORROBORATED_THRESHOLD ? "corroborated" : "unconfirmed", reasons };
}

// Clearing (Team Plan F1): "ya limpiaron" / "ya pasa" marks an incident as clearing; it becomes
// cleared after 2 independent clearing reports, an official source, or decay. A new active
// report reopens it. An official record's absence never clears anything.

export type IncidentStatus = "active" | "clearing" | "cleared";

export interface ClearingState {
  status: IncidentStatus;
  /** Distinct reporter identities that said the road is passable again, since the last active report. */
  clearingReporters: readonly string[];
  lastConfirmedAt: string;
}

export type ClearingEvent =
  | { kind: "active_report"; reporterKey: string; at: string }
  | { kind: "clearing_report"; reporterKey: string; at: string }
  | { kind: "official_cleared"; at: string }
  | { kind: "tick"; at: string };

export const CLEARING_REPORTERS_REQUIRED = 2;
/** Community evidence with no confirmation for this long is retired from the map. */
export const COMMUNITY_EXPIRY_MS = 6 * 60 * 60_000;

export function applyClearingEvent(state: ClearingState, event: ClearingEvent): ClearingState {
  if (state.status === "cleared") return state;

  switch (event.kind) {
    case "active_report":
      return { status: "active", clearingReporters: [], lastConfirmedAt: latest(state.lastConfirmedAt, event.at) };
    case "clearing_report": {
      const clearingReporters = state.clearingReporters.includes(event.reporterKey)
        ? state.clearingReporters
        : [...state.clearingReporters, event.reporterKey];
      const status = clearingReporters.length >= CLEARING_REPORTERS_REQUIRED ? "cleared" : "clearing";
      return { ...state, status, clearingReporters };
    }
    case "official_cleared":
      return { ...state, status: "cleared" };
    case "tick":
      return Date.parse(event.at) - Date.parse(state.lastConfirmedAt) >= COMMUNITY_EXPIRY_MS ? { ...state, status: "cleared" } : state;
  }
}

function latest(a: string, b: string): string {
  return Date.parse(b) > Date.parse(a) ? b : a;
}
