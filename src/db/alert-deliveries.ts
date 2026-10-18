import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { alertCandidateSchema, checkpointSchema, type AlertCandidate } from "@/contracts/notifications";
import { ALERT_LEASE_MS, planAlerts } from "@/domain/alerts/policy";
import { EncryptedContactSchema, decryptContact } from "@/integrations/security/contacts";
import { formatAlertBundle } from "@/domain/alerts/messages";
import { transaction } from "./transaction";
const subscriptionSchema = z.object({
  id: z.uuid(),
  startKm: z.number(),
  endKm: z.number(),
  label: z.string(),
  isTest: z.boolean(),
  consentAt: z.date(),
  lastAlertAt: z.date().nullable(),
  lastInboundAt: z.date().nullable(),
});
const deliverySchema = z.object({
  id: z.uuid(),
  body: z.string().max(4096),
  checkpoint: checkpointSchema,
  expiresAt: z.date(),
  consentAt: z.date(),
  leaseId: z.uuid(),
});
export function createAlertDeliveryRepository(pool: Pool, encryption: { key: string; version: string }) {
  return {
    async subscriptions(revision: string) {
      const r = await pool.query(
        "select id from public.subscriptions where opted_out_at is null and route_active and geometry_revision=$1 and alert_expires_at>now() and (alert_payment_id is not null or is_test) order by last_alert_at nulls first,id limit 1000",
        [revision],
      );
      return z
        .array(z.object({ id: z.uuid() }))
        .parse(r.rows)
        .map((x) => x.id);
    },
    async claim(subscriptionId: string, rawCandidates: AlertCandidate[], nowMs: number) {
      const candidates = z.array(alertCandidateSchema).max(5000).parse(rawCandidates);
      return transaction(pool, async (client) => {
        const result = await client.query(
          `select id,km_start::float8 as "startKm",km_end::float8 as "endKm",range_label as label,is_test as "isTest",consent_at as "consentAt",last_alert_at as "lastAlertAt",last_inbound_at as "lastInboundAt" from public.subscriptions where id=$1 and opted_out_at is null and route_active and alert_expires_at>$2 and (alert_payment_id is not null or is_test) for update`,
          [subscriptionId, new Date(nowMs)],
        );
        if (!result.rowCount) return null;
        const sub = subscriptionSchema.parse(result.rows[0]);
        await client.query(
          "update private.alert_deliveries set status='expired',lease_id=null,lease_until=null where subscription_id=$1 and status='pending' and expires_at<=$2",
          [subscriptionId, new Date(nowMs)],
        );
        let pending = await client.query("select id,selected from private.alert_deliveries where subscription_id=$1 and status='pending'", [
          subscriptionId,
        ]);
        if (pending.rowCount) {
          const saved = z.object({ id: z.uuid(), selected: z.record(z.string(), z.string()) }).parse(pending.rows[0]);
          if (
            Object.entries(saved.selected).some(
              ([key, fingerprint]) =>
                !candidates.some((c) => c.key === key && c.fingerprint === fingerprint && Date.parse(c.expiresAt) > nowMs),
            )
          ) {
            await client.query("update private.alert_deliveries set status='cancelled',lease_id=null,lease_until=null where id=$1", [
              saved.id,
            ]);
            pending = await client.query("select id from private.alert_deliveries where false");
          }
        }
        if (!pending.rowCount) {
          const checkpoint = await client.query("select state from private.subscription_checkpoints where subscription_id=$1", [
            subscriptionId,
          ]);
          const plan = planAlerts(candidates, checkpointSchema.parse(checkpoint.rows[0]?.state ?? {}), sub, nowMs);
          if (!plan.selected.length) {
            await client.query(
              "insert into private.subscription_checkpoints(subscription_id,state) values($1,$2::jsonb) on conflict(subscription_id) do update set state=excluded.state",
              [subscriptionId, JSON.stringify(plan.checkpoint)],
            );
            return null;
          }
          const inserted = await client.query(
            `insert into private.alert_deliveries(subscription_id,consent_at,body,checkpoint,expires_at,selected) values($1,$2,$3,$4::jsonb,$5,$6::jsonb) returning id`,
            [
              subscriptionId,
              sub.consentAt,
              formatAlertBundle(plan.selected, sub.isTest),
              JSON.stringify(plan.checkpoint),
              new Date(Math.min(...plan.selected.map((c) => Date.parse(c.expiresAt)))),
              JSON.stringify(Object.fromEntries(plan.selected.map((c) => [c.key, c.fingerprint]))),
            ],
          );
          pending = inserted;
        }
        const deliveryId = z.uuid().parse(pending.rows[0]?.id);
        const leaseId = randomUUID();
        const leased = await client.query(
          `update private.alert_deliveries set lease_id=$2,lease_until=$3::timestamptz+$4::integer*interval '1 millisecond',attempts=attempts+1 where id=$1 and status='pending' and (lease_until is null or lease_until<=$3) returning id,body,checkpoint,expires_at as "expiresAt",consent_at as "consentAt",lease_id as "leaseId"`,
          [deliveryId, leaseId, new Date(nowMs), ALERT_LEASE_MS],
        );
        return leased.rowCount ? { ...deliverySchema.parse(leased.rows[0]), subscriptionId } : null;
      });
    },
    async destination(delivery: { id: string; leaseId: string }, nowMs: number) {
      const result = await pool.query(
        `select c.ciphertext,c.iv,c.auth_tag as "authTag",c.key_version as "keyVersion",s.last_inbound_at as "lastInboundAt" from private.alert_deliveries d join public.subscriptions s on s.id=d.subscription_id join private.delivery_contacts c on c.id=s.contact_ref where d.id=$1 and d.lease_id=$2 and d.status='pending' and d.lease_until>$3 and d.expires_at>$3 and s.opted_out_at is null and s.route_active and s.consent_at=d.consent_at and c.disabled_at is null and s.alert_expires_at>$3 and (s.alert_payment_id is not null or s.is_test)`,
        [delivery.id, delivery.leaseId, new Date(nowMs)],
      );
      if (!result.rowCount) return null;
      const row = EncryptedContactSchema.extend({ lastInboundAt: z.date().nullable() }).parse(result.rows[0]);
      if (row.keyVersion !== encryption.version) throw new Error("Alert contact key version unavailable");
      return {
        to: z.string().min(1).max(200).parse(decryptContact(row, encryption.key)),
        windowOpen:
          row.lastInboundAt !== null && nowMs - row.lastInboundAt.getTime() < 24 * 3_600_000 && nowMs >= row.lastInboundAt.getTime(),
      };
    },
    async finish(delivery: { id: string; leaseId: string; subscriptionId: string }, success: boolean, error: string | null, nowMs: number) {
      await transaction(pool, async (client) => {
        // Serialize with BAJA and new consent; a provider-accepted message is never retried under a new key.
        await client.query("select id from public.subscriptions where id=$1 for update", [delivery.subscriptionId]);
        const saved = await client.query(
          `update private.alert_deliveries set status=case when $3 then 'sent' else status end,sent_at=case when $3 then $4::timestamptz else null end,last_error=$5,lease_id=null,lease_until=null where id=$1 and lease_id=$2 and status='pending' returning checkpoint,subscription_id as "subscriptionId",consent_at as "consentAt"`,
          [delivery.id, delivery.leaseId, success, new Date(nowMs), error],
        );
        if (success && saved.rowCount) {
          const row = z.object({ checkpoint: checkpointSchema, subscriptionId: z.uuid(), consentAt: z.date() }).parse(saved.rows[0]);
          await client.query("update public.subscriptions set last_alert_at=$2 where id=$1 and consent_at=$3", [
            row.subscriptionId,
            new Date(nowMs),
            row.consentAt,
          ]);
          await client.query(
            "insert into private.subscription_checkpoints(subscription_id,state) values($1,$2::jsonb) on conflict(subscription_id) do update set state=excluded.state",
            [row.subscriptionId, JSON.stringify(row.checkpoint)],
          );
        }
      });
    },
  };
}
export type AlertDeliveryRepository = ReturnType<typeof createAlertDeliveryRepository>;
