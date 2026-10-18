import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { checkoutUrlSchema } from "@/contracts/alert-passes";
import { EncryptedContactSchema, decryptContact, encryptContact } from "@/integrations/security/contacts";
import { transaction } from "./transaction";

const requestSchema = z.object({
  id: z.uuid(),
  expiresAt: z.date(),
  status: z.enum(["pending", "paid", "cancelled", "expired"]),
  checkoutUrl: z.unknown().nullable(),
  leaseUntil: z.date().nullable(),
  active: z.boolean(),
});
const savedCheckoutSchema = z.object({ ciphertext: z.string(), iv: z.string(), authTag: z.string(), keyVersion: z.string() });
export type CheckoutRequest = z.infer<typeof requestSchema>;
export function createAlertPassRequestRepository(pool: Pool, encryption: { key: string; version: string }) {
  return {
    async claim(key: string, now: number, eventKey?: string) {
      return transaction(pool, async (client) => {
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`subscription:${key}`]);
        const result = await client.query(
          `select p.id,p.expires_at as "expiresAt",p.status,p.checkout_url as "checkoutUrl",p.checkout_lease_until as "leaseUntil",
           coalesce(s.opted_out_at is null and s.alert_expires_at>$2 and s.alert_payment_id=p.id,false) as active
           from private.alert_pass_requests p left join public.subscriptions s on s.id=p.subscription_id
           where p.phone_key=$1 and ($3::text is null or p.event_key=$3) order by p.consent_at desc,p.id desc limit 1 for update of p`,
          [key, new Date(now), eventKey ?? null],
        );
        if (!result.rowCount) return null;
        const row = requestSchema.parse(result.rows[0]);
        if (row.status !== "pending" || row.expiresAt.getTime() <= now) return { ...row, url: null, leaseId: null };
        if (row.checkoutUrl !== null) {
          const encoded = savedCheckoutSchema.parse(row.checkoutUrl);
          const envelope = EncryptedContactSchema.parse({
            ...encoded,
            ciphertext: Buffer.from(encoded.ciphertext, "base64url"),
            iv: Buffer.from(encoded.iv, "base64url"),
            authTag: Buffer.from(encoded.authTag, "base64url"),
          });
          if (envelope.keyVersion !== encryption.version) throw new Error("Checkout key version unavailable");
          return { ...row, url: checkoutUrlSchema.parse(decryptContact(envelope, encryption.key)), leaseId: null };
        }
        if (row.leaseUntil && row.leaseUntil.getTime() > now) return { ...row, url: null, leaseId: null };
        const leaseId: string = randomUUID();
        // Longer than the bounded OpenAI call, preventing concurrent webhook retries from creating links.
        await client.query(
          "update private.alert_pass_requests set checkout_lease_id=$2,checkout_lease_until=$3::timestamptz+interval '90 seconds' where id=$1",
          [row.id, leaseId, new Date(now)],
        );
        return { ...row, url: null, leaseId };
      });
    },
    async save(id: string, leaseId: string, url: string, now: number) {
      const value = encryptContact(checkoutUrlSchema.parse(url), encryption.key, encryption.version);
      const result = await pool.query(
        `update private.alert_pass_requests set checkout_url=$3::jsonb,checkout_lease_id=null,checkout_lease_until=null
         where id=$1 and checkout_lease_id=$2 and status='pending' and expires_at>$4 returning id`,
        [
          id,
          leaseId,
          JSON.stringify({
            ciphertext: value.ciphertext.toString("base64url"),
            iv: value.iv.toString("base64url"),
            authTag: value.authTag.toString("base64url"),
            keyVersion: value.keyVersion,
          }),
          new Date(now),
        ],
      );
      return result.rowCount === 1;
    },
    async release(id: string, leaseId: string) {
      await pool.query(
        "update private.alert_pass_requests set checkout_lease_id=null,checkout_lease_until=null where id=$1 and checkout_lease_id=$2",
        [id, leaseId],
      );
    },
  };
}
export type AlertPassRequestRepository = ReturnType<typeof createAlertPassRequestRepository>;
