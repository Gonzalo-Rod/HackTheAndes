import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import type { WebhookProcessor } from "@/contracts/messaging";

/** Function maxDuration is 60 s; retain 30 s for clock/termination margin. DB owns the clock. */
export const WEBHOOK_LEASE_MS = 90_000;
export function createPostgresWebhookProcessor(pool: Pick<Pool, "query">): WebhookProcessor {
  return {
    async processOnce(provider, eventKey, work) {
      z.string().min(1).max(64).parse(provider);
      z.string().min(1).max(256).parse(eventKey);
      const messageKey = createHash("sha256").update(eventKey).digest("hex");
      const leaseId = randomUUID();
      const parameters = [provider, messageKey, leaseId];
      const claimed = await pool.query(
        `insert into private.messaging_deliveries(provider,message_key,lease_id,lease_until)
         values($1,$2,$3,clock_timestamp()+$4::integer*interval '1 millisecond')
         on conflict(provider,message_key) do update set lease_id=excluded.lease_id,lease_until=excluded.lease_until
         where messaging_deliveries.completed_at is null and messaging_deliveries.lease_until<=clock_timestamp()
         returning lease_id`,
        [...parameters, WEBHOOK_LEASE_MS],
      );
      if (claimed.rowCount !== 1) {
        const existing = await pool.query(
          "select completed_at is not null as completed from private.messaging_deliveries where provider=$1 and message_key=$2",
          parameters.slice(0, 2),
        );
        const row = z.object({ completed: z.boolean() }).optional().parse(existing.rows[0]);
        if (row?.completed) return false;
        // In-flight work is not complete: tell the provider to retry, including after a crash.
        throw new Error("Webhook processing already in progress");
      }
      try {
        await work();
        const completed = await pool.query(
          "update private.messaging_deliveries set completed_at=clock_timestamp() where provider=$1 and message_key=$2 and lease_id=$3 and completed_at is null",
          parameters,
        );
        if (completed.rowCount !== 1) throw new Error("Webhook lease lost");
        return true;
      } catch (error) {
        // Ownership predicate prevents a timed-out invocation deleting a replacement lease.
        try {
          await pool.query(
            "delete from private.messaging_deliveries where provider=$1 and message_key=$2 and lease_id=$3 and completed_at is null",
            parameters,
          );
        } catch (releaseError) {
          throw new AggregateError([error, releaseError], "Webhook lease release failed");
        }
        throw error;
      }
    },
  };
}
