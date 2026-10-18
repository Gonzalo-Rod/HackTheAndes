import type { PoolClient } from "pg";
import { z } from "zod";

const activePassSchema = z.object({
  id: z.uuid(),
  expiresAt: z.date(),
  paymentId: z.uuid().nullable(),
  isTeam: z.boolean(),
  isTest: z.boolean(),
});

/** Serialize pass checks with subscription commands and expiry reconciliation. */
export async function readActiveAlertPass(client: PoolClient, key: string, now: string) {
  const result = await client.query(
    `select id,alert_expires_at as "expiresAt",alert_payment_id as "paymentId",is_team as "isTeam",is_test as "isTest"
     from public.subscriptions where phone_key=$1 and opted_out_at is null
     and alert_expires_at>$2 and (alert_payment_id is not null or is_test) for update`,
    [key, now],
  );
  return result.rowCount ? activePassSchema.parse(result.rows[0]) : null;
}
