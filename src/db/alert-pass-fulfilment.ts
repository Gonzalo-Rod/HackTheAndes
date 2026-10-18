import type { Pool } from "pg";
import { z } from "zod";
import type { SettledPurchase } from "@/contracts/alert-passes";
import { subscriptionRangeSchema } from "@/contracts/notifications";
import { validAlertPurchase } from "@/domain/subscriptions/alert-pass";
import { EncryptedContactSchema, decryptContact } from "@/integrations/security/contacts";
import { activateSubscription } from "./activate-subscription";
import { transaction } from "./transaction";

const storedRequestSchema = EncryptedContactSchema.extend({
  id: z.uuid(),
  key: z.string(),
  range: subscriptionRangeSchema,
  requestedAt: z.date(),
  expiresAt: z.date(),
  consentAt: z.date(),
  isTeam: z.boolean(),
  isTest: z.boolean(),
  status: z.string(),
  transactionId: z.uuid().nullable(),
});
export function createAlertPassFulfilment(
  pool: Pool,
  encryption: { key: string; version: string },
  expected: {
    itemId: number;
    digitalQuantity: string;
  },
) {
  return async (requestId: string, transactionId: string, purchase: SettledPurchase, now: number) =>
    transaction(pool, async (client) => {
      const owner = await client.query("select phone_key from private.alert_pass_requests where id=$1", [requestId]);
      if (!owner.rowCount) return { ok: false, status: "request_not_found", summary: "Solicita el pase desde WhatsApp antes de pagar." };
      const key = z.string().parse(owner.rows[0]?.phone_key);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`subscription:${key}`]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`qatom-sale:${transactionId}`]);
      const result = await client.query(
        `select id,phone_key as key,range,ciphertext,iv,auth_tag as "authTag",key_version as "keyVersion",requested_at as "requestedAt",
       expires_at as "expiresAt",consent_at as "consentAt",is_team as "isTeam",is_test as "isTest",status,transaction_id as "transactionId"
       from private.alert_pass_requests where id=$1 for update`,
        [requestId],
      );
      const row = storedRequestSchema.parse(result.rows[0]);
      if (row.transactionId === transactionId)
        return {
          ok: true,
          status: "already_processed",
          expires_at: row.expiresAt.toISOString(),
          summary: "Pago ya procesado; el vencimiento no cambia.",
        };
      if (row.status !== "pending" || row.expiresAt.getTime() <= now)
        return {
          ok: false,
          status: "request_unavailable",
          summary: "La solicitud fue cancelada, pagada o expiró. No se activaron alertas; contacta al vendedor si se cobró.",
        };
      if (
        !validAlertPurchase(purchase, {
          ...expected,
          transactionId,
          requestedAt: row.requestedAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
          now,
        })
      )
        return { ok: false, status: "invalid_purchase", summary: "No se pudo verificar un pago válido para este pase." };
      const used = await client.query("select id from private.alert_pass_requests where transaction_id=$1", [transactionId]);
      if (used.rowCount) return { ok: false, status: "transaction_already_used", summary: "Este pago ya fue usado en otra solicitud." };
      if (row.keyVersion !== encryption.version) throw new Error("Alert pass contact key version unavailable");
      const subscriptionId = await activateSubscription(
        client,
        {
          key,
          destination: decryptContact(row, encryption.key),
          now: row.consentAt.toISOString(),
          isTeam: row.isTeam,
          isTest: row.isTest,
          range: row.range,
          expiresAt: row.expiresAt.toISOString(),
          paymentId: row.id,
        },
        encryption,
      );
      await client.query(
        "update private.alert_pass_requests set status='paid',transaction_id=$2,settled_at=$3,subscription_id=$4,checkout_lease_id=null,checkout_lease_until=null where id=$1",
        [requestId, transactionId, purchase.settled_at, subscriptionId],
      );
      return {
        ok: true,
        status: "active",
        expires_at: row.expiresAt.toISOString(),
        summary:
          "Alertas activadas hasta el vencimiento indicado, sin renovación automática. Escribe PAGO en WhatsApp para consultar el estado.",
      };
    });
}
