import type { Pool } from "pg";
import { z } from "zod";
import type { WebhookDeduplicator } from "@/integrations/security/webhook";

export interface RateLimiter {
  consume(key: string, limit: number, windowMs: number, nowMs: number): Promise<boolean>;
}
export function createRateLimiter(pool: Pool): RateLimiter {
  return {
    async consume(key, limit, windowMs, nowMs) {
      const windowStart = new Date(Math.floor(nowMs / windowMs) * windowMs).toISOString();
      const result = await pool.query(
        `insert into private.request_buckets(bucket_key,window_start,attempts) values($1,$2,1)
      on conflict(bucket_key) do update set window_start=excluded.window_start,
      attempts=case when request_buckets.window_start=excluded.window_start then request_buckets.attempts+1 else 1 end
      returning attempts`,
        [key, windowStart],
      );
      const { attempts } = z.object({ attempts: z.number().int().positive() }).parse(result.rows[0]);
      return attempts <= limit;
    },
  };
}
export function createWebhookDeduplicator(pool: Pool): WebhookDeduplicator {
  return {
    async claim(provider, eventId) {
      z.string().min(1).max(64).parse(provider);
      z.string().min(1).max(256).parse(eventId);
      const result = await pool.query("insert into private.webhook_claims(provider,event_id) values($1,$2) on conflict do nothing", [
        provider,
        eventId,
      ]);
      return result.rowCount === 1;
    },
  };
}
