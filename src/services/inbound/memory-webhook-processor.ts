import type { WebhookProcessor } from "@/contracts/messaging";

const DEFAULT_CAPACITY = 5_000;
/** Local development only; serverless instances require the Postgres processor. */
export function createMemoryWebhookProcessor(capacity = DEFAULT_CAPACITY): WebhookProcessor {
  if (!Number.isInteger(capacity) || capacity < 1) throw new Error("Webhook capacity must be positive");
  const completed = new Set<string>();
  const inflight = new Map<string, Promise<void>>();
  return {
    async processOnce(provider, eventKey, work) {
      const key = `${provider}:${eventKey}`;
      const pending = inflight.get(key);
      if (pending) {
        await pending;
        return false;
      }
      if (completed.has(key)) return false;
      // Reserve before calling work, including when it throws synchronously.
      const task = Promise.resolve().then(work);
      inflight.set(key, task);
      try {
        await task;
        if (completed.size >= capacity) {
          const oldest = completed.values().next().value;
          if (oldest !== undefined) completed.delete(oldest);
        }
        completed.add(key);
        return true;
      } finally {
        inflight.delete(key);
      }
    },
  };
}
