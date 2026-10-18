import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { environmentalReportSchema, reportPeriodSchema, type EnvironmentalReport, type ReportPeriod } from "@peruroad/road-data/reports";
import { weeklyDeliverySchema, weeklyTargetSchema, type WeeklyDelivery } from "@/contracts/weekly-pdf";
import { EncryptedContactSchema, decryptContact } from "@/integrations/security/contacts";
import { transaction } from "./transaction";
const TARGET_SQL = `select s.id,jsonb_build_object('startKm',s.km_start,'endKm',s.km_end,'label',s.range_label,'geometryRevision',s.geometry_revision) as range,p.consent_at as "consentAt",s.is_test as "isTest" from public.subscriptions s join private.weekly_pdf_preferences p on p.subscription_id=s.id where s.opted_out_at is null and p.consent_at is not null and p.subscription_consent_at=s.consent_at and s.alert_expires_at>now() and (s.alert_payment_id is not null or s.is_test)`;
/** A two-minute worker lease fits the job's bounded execution; file access survives provider fetches for three days. */
const LEASE_MS = 120_000,
  DELIVERY_LIFETIME_MS = 72 * 3_600_000;
export function createWeeklyPdfRepository(pool: Pool, encryption: { key: string; version: string }) {
  return {
    async targets(revision: string, phoneKey: string | null = null, demoOnly = false) {
      const r = await pool.query(
        `${TARGET_SQL} and s.geometry_revision=$1 and ($2::text is null or s.phone_key=$2) and (not $3::boolean or s.is_test) order by (select max(d.created_at) from private.weekly_pdf_deliveries d where d.subscription_id=s.id) nulls first,s.id limit 500`,
        [revision, phoneKey, demoOnly],
      );
      return z.array(weeklyTargetSchema).parse(r.rows);
    },
    async latestPending(subscriptionId: string, nowMs: number) {
      const r = await pool.query(
        "select d.period from private.weekly_pdf_deliveries d join public.subscriptions s on s.id=d.subscription_id join private.weekly_pdf_preferences p on p.subscription_id=s.id where d.subscription_id=$1 and d.status='pending' and d.expires_at>$2 and s.opted_out_at is null and p.consent_at=d.consent_at and p.subscription_consent_at=s.consent_at and s.alert_expires_at>$2 and (s.alert_payment_id is not null or s.is_test) order by d.created_at desc limit 1",
        [subscriptionId, new Date(nowMs)],
      );
      return r.rowCount ? reportPeriodSchema.parse(r.rows[0]?.period) : null;
    },
    async claim(subscriptionId: string, period: ReportPeriod, nowMs: number, expectedConsentAt: Date) {
      reportPeriodSchema.parse(period);
      return transaction(pool, async (db) => {
        await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`weekly:${subscriptionId}`]);
        const target = await db.query(`${TARGET_SQL} and s.id=$1 and s.alert_expires_at>$2 for update of s`, [
          subscriptionId,
          new Date(nowMs),
        ]);
        if (!target.rowCount) return null;
        const sub = weeklyTargetSchema.parse(target.rows[0]);
        if (sub.consentAt.getTime() !== expectedConsentAt.getTime()) return null;
        await db.query(
          `insert into private.weekly_pdf_deliveries(subscription_id,consent_at,period_key,period,created_at,expires_at) values($1,$2,$3,$4::jsonb,$5,$6) on conflict(subscription_id,period_key,consent_at) do nothing`,
          [sub.id, sub.consentAt, period.key, JSON.stringify(period), new Date(nowMs), new Date(nowMs + DELIVERY_LIFETIME_MS)],
        );
        const r = await db.query(
          `update private.weekly_pdf_deliveries set lease_id=$4,lease_until=$5,attempts=attempts+1 where subscription_id=$1 and period_key=$2 and consent_at=$3 and status='pending' and expires_at>$6 and (lease_until is null or lease_until<=$6) returning id,lease_id as "leaseId",period,expires_at as "expiresAt",notified_at as "notifiedAt",report`,
          [sub.id, period.key, sub.consentAt, randomUUID(), new Date(nowMs + LEASE_MS), new Date(nowMs)],
        );
        return r.rowCount ? weeklyDeliverySchema.parse(r.rows[0]) : null;
      });
    },
    async save(delivery: WeeklyDelivery, report: EnvironmentalReport, pdf: Uint8Array) {
      environmentalReportSchema.parse(report);
      if (pdf.byteLength > 1_048_576 || !Buffer.from(pdf).subarray(0, 5).equals(Buffer.from("%PDF-")))
        throw new Error("Invalid PDF artifact");
      const r = await pool.query(
        "update private.weekly_pdf_deliveries set report=$3::jsonb,pdf=$4 where id=$1 and lease_id=$2 and status='pending' and report is null",
        [delivery.id, delivery.leaseId, JSON.stringify(report), Buffer.from(pdf)],
      );
      if (!r.rowCount) throw new Error("Weekly report lease lost");
    },
    async destination(delivery: WeeklyDelivery, nowMs: number) {
      const r = await pool.query(
        `select c.ciphertext,c.iv,c.auth_tag as "authTag",c.key_version as "keyVersion",s.last_inbound_at as "lastInboundAt" from private.weekly_pdf_deliveries d join public.subscriptions s on s.id=d.subscription_id join private.weekly_pdf_preferences p on p.subscription_id=s.id join private.delivery_contacts c on c.id=s.contact_ref where d.id=$1 and d.lease_id=$2 and d.lease_until>$3 and d.expires_at>$4 and d.status='pending' and s.opted_out_at is null and c.disabled_at is null and p.consent_at=d.consent_at and p.subscription_consent_at=s.consent_at and s.alert_expires_at>$3 and (s.alert_payment_id is not null or s.is_test)`,
        [delivery.id, delivery.leaseId, new Date(nowMs), new Date(nowMs + 24 * 3_600_000)],
      );
      if (!r.rowCount) return null;
      const row = z.object({ ...EncryptedContactSchema.shape, lastInboundAt: z.date().nullable() }).parse(r.rows[0]);
      if (row.keyVersion !== encryption.version) throw new Error("Weekly contact key unavailable");
      const ageMs = row.lastInboundAt ? nowMs - row.lastInboundAt.getTime() : Infinity;
      return { to: decryptContact(row, encryption.key), windowOpen: ageMs >= 0 && ageMs < 24 * 3_600_000 };
    },
    async finish(
      delivery: WeeklyDelivery,
      state: "sent" | "notified" | "pending" | "cancelled",
      error: string | null,
      nowMs: number,
      providerId: string | null = null,
    ) {
      await pool.query(
        `update private.weekly_pdf_deliveries set status=$3,last_error=$4,lease_id=null,lease_until=null,notified_at=case when $5='notified' then $6 else notified_at end,sent_at=case when $5='sent' then $6 else sent_at end,provider_message_id=coalesce($7,provider_message_id) where id=$1 and lease_id=$2`,
        [delivery.id, delivery.leaseId, state === "notified" ? "pending" : state, error, state, new Date(nowMs), providerId],
      );
    },
    async pdf(id: string, nowMs: number) {
      const r = await pool.query(
        `select d.pdf from private.weekly_pdf_deliveries d join public.subscriptions s on s.id=d.subscription_id join private.weekly_pdf_preferences p on p.subscription_id=s.id where d.id=$1 and d.expires_at>$2 and d.status in ('pending','sent') and s.opted_out_at is null and p.consent_at=d.consent_at and p.subscription_consent_at=s.consent_at and s.alert_expires_at>$2 and (s.alert_payment_id is not null or s.is_test)`,
        [id, new Date(nowMs)],
      );
      return r.rows[0]?.pdf ? z.instanceof(Buffer).parse(r.rows[0].pdf) : null;
    },
  };
}
export type WeeklyPdfRepository = ReturnType<typeof createWeeklyPdfRepository>;
