import type { InboundMessageData } from "@/integrations/zavu/events";
import type { SavedRoadCommand } from "@/domain/messaging/saved-road";

/** Server-derived, non-reversible memory subject; never a phone number or a value from the message. */
export type MemorySubject = string & { readonly __brand: "MemorySubject" };

export interface SavedRoadRecord {
  id: string;
  roadCode: string;
  /** ISO 8601 creation time reported by the memory provider; the newest record wins. */
  createdAt: string;
}

/** Throws when the provider is unavailable or answers with an invalid body. */
export interface SavedRoadStore {
  list(subject: MemorySubject, requestId: string): Promise<SavedRoadRecord[]>;
  /** IDs the provider reports as stored or updated; empty means the outcome is unconfirmed. */
  save(subject: MemorySubject, roadCode: string, requestId: string): Promise<string[]>;
  remove(subject: MemorySubject, id: string, requestId: string): Promise<void>;
}

export type SavedRoadRecall = { kind: "none" } | { kind: "saved"; roadCode: string } | { kind: "unavailable" };

export interface SavedRoadRouter {
  handle(command: Exclude<SavedRoadCommand, { kind: "national" }>, message: InboundMessageData, requestId: string): Promise<string>;
  recall(message: InboundMessageData, requestId: string): Promise<SavedRoadRecall>;
}
