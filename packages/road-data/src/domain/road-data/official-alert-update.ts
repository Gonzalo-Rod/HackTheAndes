import type { OfficialRoadAlert } from "../../contracts/road-alerts.ts";
import type { StoredOfficialAlert } from "../../contracts/ingestion.ts";

export type OfficialAlertUpdate =
  | { kind: "inserted" | "updated" | "unchanged"; state: StoredOfficialAlert }
  | { kind: "stale" }
  | { kind: "conflict"; reason: "missing_source_timestamp" | "revision_conflict" };

function sameContent(left: OfficialRoadAlert, right: OfficialRoadAlert): boolean {
  // Both records pass the shared Zod schema first, which fixes property order.
  const { retrievedAt: _leftRetrieval, ...leftContent } = left;
  const { retrievedAt: _rightRetrieval, ...rightContent } = right;
  const canonical = (content: typeof leftContent) => ({
    ...content,
    sourceUpdatedAt:
      content.sourceUpdatedAt === null ? null : new Date(content.sourceUpdatedAt).toISOString(),
  });
  return JSON.stringify(canonical(leftContent)) === JSON.stringify(canonical(rightContent));
}

export function decideOfficialAlertUpdate(
  current: StoredOfficialAlert | null,
  incoming: OfficialRoadAlert,
): OfficialAlertUpdate {
  if (current === null) {
    return {
      kind: "inserted",
      state: {
        alert: incoming,
        firstObservedAt: incoming.retrievedAt,
        lastObservedAt: incoming.retrievedAt,
        historySynced: false,
      },
    };
  }
  const previousRevision = current.alert.sourceUpdatedAt;
  const nextRevision = incoming.sourceUpdatedAt;
  if (previousRevision !== null && nextRevision === null) {
    return { kind: "conflict", reason: "missing_source_timestamp" };
  }
  if (
    previousRevision !== null &&
    nextRevision !== null &&
    Date.parse(nextRevision) < Date.parse(previousRevision)
  )
    return { kind: "stale" };

  const sameRevision =
    previousRevision === nextRevision ||
    (previousRevision !== null &&
      nextRevision !== null &&
      Date.parse(previousRevision) === Date.parse(nextRevision));
  if (sameRevision) {
    if (!sameContent(current.alert, incoming))
      return { kind: "conflict", reason: "revision_conflict" };
    // A delayed poll must not move freshness backwards.
    const newerObservation = Date.parse(incoming.retrievedAt) > Date.parse(current.lastObservedAt);
    return {
      kind: "unchanged",
      state: {
        ...current,
        alert: newerObservation ? incoming : current.alert,
        lastObservedAt: newerObservation ? incoming.retrievedAt : current.lastObservedAt,
      },
    };
  }
  return {
    kind: "updated",
    state: {
      ...current,
      alert: incoming,
      historySynced: false,
      lastObservedAt:
        Date.parse(incoming.retrievedAt) > Date.parse(current.lastObservedAt)
          ? incoming.retrievedAt
          : current.lastObservedAt,
    },
  };
}

/** Natural key for source facts, not an invented database ID or event timestamp. */
export function sourceHistoryKey(entry: {
  source: string;
  externalId: string;
  occurredAt: string;
  eventType: string;
  sourceRoadStatus: string | null;
}): string {
  return JSON.stringify([
    entry.source,
    entry.externalId,
    new Date(entry.occurredAt).toISOString(),
    entry.eventType,
    entry.sourceRoadStatus,
  ]);
}
