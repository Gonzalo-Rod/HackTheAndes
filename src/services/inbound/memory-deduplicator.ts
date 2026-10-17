import type { WebhookDeduplicator } from "@/integrations/security/webhook";

/** Enough to cover a provider's retry window on one warm instance. */
const DEFAULT_CAPACITY = 5_000;

/**
 * Per-instance fallback used only when the database is not configured (local runs,
 * previews without DATABASE_URL). Retries that reach another instance are not caught,
 * so production uses the Postgres deduplicator.
 */
export function createMemoryDeduplicator(capacity = DEFAULT_CAPACITY): WebhookDeduplicator {
  const seen = new Set<string>();
  return {
    async claim(provider, eventId) {
      const key = `${provider}:${eventId}`;
      if (seen.has(key)) return false;
      if (seen.size >= capacity) {
        // Sets iterate in insertion order, so this drops the oldest claim.
        const oldest = seen.values().next().value;
        if (oldest !== undefined) seen.delete(oldest);
      }
      seen.add(key);
      return true;
    },
  };
}
