import type { RoadAlert } from "@/contracts/road-alerts";

/** Trust level of an alert's source: official SUTRAN records versus unconfirmed community reports. */
export const ALERT_ORIGINS = ["oficial", "comunidad"] as const;
export type AlertOrigin = (typeof ALERT_ORIGINS)[number];

// The platform feed prefixes community incident ids; SUTRAN ids are bare UUIDs.
const COMMUNITY_ID_PREFIX = "community:";

export function alertOrigin(alert: Pick<RoadAlert, "id">): AlertOrigin {
  return alert.id.startsWith(COMMUNITY_ID_PREFIX) ? "comunidad" : "oficial";
}
