import type { MemorySubject, SavedRoadRecall, SavedRoadRecord, SavedRoadRouter, SavedRoadStore } from "@/contracts/saved-roads";
import { SAVED_ROAD_REPLIES, savedReply, showReply, staleKeptReply, unchangedReply } from "@/domain/messaging/saved-road";
import { keyedDigest } from "@/integrations/security/contacts";
import { logger } from "@/lib/logger";
import { senderKey } from "@/services/subscriptions/subscription-flow";

/** A separate HMAC purpose keeps the memory subject unlinkable to phone_key values in our database. */
export function memorySubject(from: string, pepper: string): MemorySubject {
  // The only constructor of the brand: the value is always this server-side digest.
  return keyedDigest(senderKey(from, pepper), pepper, "atomic-memory-subject-v1") as MemorySubject;
}

function newest(records: readonly SavedRoadRecord[]): SavedRoadRecord | null {
  return records.reduce<SavedRoadRecord | null>(
    (best, record) => (!best || Date.parse(record.createdAt) > Date.parse(best.createdAt) ? record : best),
    null,
  );
}

export function createSavedRoadFlow(deps: { store: SavedRoadStore; pepper: string }): SavedRoadRouter {
  const unavailable = (operation: string, requestId: string, error: unknown) =>
    logger.warn({
      requestId,
      operation,
      provider: "atomicmemory",
      result: "fallback",
      errorType: error instanceof Error ? error.name : "UnknownError",
    });

  /** True only when a readback shows every record gone; a 2xx DELETE alone never claims erasure. */
  async function removeConfirmed(subject: MemorySubject, records: readonly SavedRoadRecord[], requestId: string): Promise<boolean> {
    const results = await Promise.allSettled(records.map((record) => deps.store.remove(subject, record.id, requestId)));
    const failed = results.find((result) => result.status === "rejected");
    if (failed) {
      unavailable("saved_road.remove", requestId, failed.reason);
      return false;
    }
    try {
      const remaining = new Set((await deps.store.list(subject, requestId)).map((record) => record.id));
      if (records.every((record) => !remaining.has(record.id))) return true;
      logger.warn({ requestId, operation: "saved_road.remove", provider: "atomicmemory", result: "error", errorType: "RecordRetained" });
      return false;
    } catch (error) {
      unavailable("saved_road.remove_confirm", requestId, error);
      return false;
    }
  }

  async function save(subject: MemorySubject, roadCode: string, requestId: string): Promise<string> {
    let existing: SavedRoadRecord[];
    try {
      existing = await deps.store.list(subject, requestId);
    } catch (error) {
      unavailable("saved_road.list", requestId, error);
      return SAVED_ROAD_REPLIES.saveFailed;
    }
    const current = newest(existing);
    if (current?.roadCode === roadCode && existing.length === 1) return unchangedReply(roadCode);
    let ids: string[];
    try {
      ids = await deps.store.save(subject, roadCode, requestId);
    } catch (error) {
      // A lost connection or timeout may still have stored it; read back rather than claim either outcome.
      unavailable("saved_road.save", requestId, error);
      ids = [];
    }
    // An empty ID list is not a confirmation: only a matching readback is.
    let others = existing;
    if (!ids.length) {
      const confirmed = await readBack(subject, roadCode, requestId);
      if (!confirmed) return SAVED_ROAD_REPLIES.saveFailed;
      ids = [confirmed.saved.id];
      others = confirmed.records;
    }
    // Cleanup runs only after the new value is confirmed, so a failed save never loses the old one.
    const stale = others.filter((record) => !ids.includes(record.id));
    const previous = current && current.roadCode !== roadCode ? current.roadCode : null;
    if (stale.length && !(await removeConfirmed(subject, stale, requestId)) && previous) return staleKeptReply(roadCode, previous);
    return savedReply(roadCode, previous);
  }

  async function readBack(
    subject: MemorySubject,
    roadCode: string,
    requestId: string,
  ): Promise<{ saved: SavedRoadRecord; records: SavedRoadRecord[] } | null> {
    try {
      const records = await deps.store.list(subject, requestId);
      const saved = newest(records);
      return saved?.roadCode === roadCode ? { saved, records } : null;
    } catch (error) {
      unavailable("saved_road.confirm", requestId, error);
      return null;
    }
  }

  async function recall(subject: MemorySubject, requestId: string): Promise<SavedRoadRecall> {
    try {
      const record = newest(await deps.store.list(subject, requestId));
      return record ? { kind: "saved", roadCode: record.roadCode } : { kind: "none" };
    } catch (error) {
      unavailable("saved_road.recall", requestId, error);
      return { kind: "unavailable" };
    }
  }

  return {
    async handle(command, message, requestId) {
      const subject = memorySubject(message.from, deps.pepper);
      switch (command.kind) {
        case "save_invalid":
          return SAVED_ROAD_REPLIES.saveInvalid;
        case "save":
          return save(subject, command.roadCode, requestId);
        case "show": {
          const recalled = await recall(subject, requestId);
          if (recalled.kind === "unavailable") return SAVED_ROAD_REPLIES.readFailed;
          return recalled.kind === "saved" ? showReply(recalled.roadCode) : SAVED_ROAD_REPLIES.none;
        }
        case "forget": {
          let records: SavedRoadRecord[];
          try {
            records = await deps.store.list(subject, requestId);
          } catch (error) {
            unavailable("saved_road.list", requestId, error);
            return SAVED_ROAD_REPLIES.forgetFailed;
          }
          if (!records.length) return SAVED_ROAD_REPLIES.none;
          return (await removeConfirmed(subject, records, requestId)) ? SAVED_ROAD_REPLIES.forgotten : SAVED_ROAD_REPLIES.forgetFailed;
        }
        default: {
          const exhaustive: never = command;
          return exhaustive;
        }
      }
    },
    recall: (message, requestId) => recall(memorySubject(message.from, deps.pepper), requestId),
  };
}
