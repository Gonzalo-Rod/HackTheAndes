import { randomUUID } from "node:crypto";
import type { SubscriptionAction } from "@/db/subscriptions";
import type { SubscriptionRange } from "@/contracts/notifications";

/** Exercise the real route-consent actions when arranging a subscribed test driver. */
export async function confirmTestRoute(act: (action: SubscriptionAction) => Promise<string>, range: SubscriptionRange, now: number) {
  const draftId = randomUUID();
  const origin = { distanceKm: range.startKm, label: "Synthetic origin", geometryRevision: range.geometryRevision };
  await act({
    kind: "routeStart",
    draft: { id: draftId, origin: null, isTest: false, expiresAt: new Date(now + 30 * 60_000).toISOString() },
  });
  await act({ kind: "routeOrigin", draftId, endpoint: origin });
  await act({ kind: "routeDestination", draftId, origin, range, code: "ABCDEF99" });
  return act({ kind: "routeActivate", code: "ABCDEF99" });
}
