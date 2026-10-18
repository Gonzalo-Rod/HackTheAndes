import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { reportDraftSchema, reportRoutingSchema, type ReportRepository } from "@/contracts/reports";
import { encryptContact, decryptContact, EncryptedContactSchema } from "@/integrations/security/contacts";
import { WEBHOOK_LEASE_MS } from "./webhook-processor";
import { publishCommunityReport } from "./report-publication";

const rowSchema = z.object({
  ciphertext: z.instanceof(Buffer).nullable(),
  iv: z.instanceof(Buffer).nullable(),
  authTag: z.instanceof(Buffer).nullable(),
  keyVersion: z.string().nullable(),
});
export function createReportRepository(pool: Pool, encryption: { key: string; version: string }): ReportRepository {
  function encode(value: unknown) {
    return encryptContact(JSON.stringify(value), encryption.key, encryption.version);
  }
  function decode(value: unknown): unknown {
    const row = EncryptedContactSchema.parse(value);
    if (row.keyVersion !== encryption.version) throw new Error("Report encryption key version unavailable");
    return JSON.parse(decryptContact(row, encryption.key)) as unknown;
  }
  return {
    async run(phoneKey, work) {
      z.string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(phoneKey);
      const leaseId = randomUUID();
      const acquired = await pool.query(
        `insert into private.report_conversations(phone_key,lease_id,lease_until)
      values($1,$2,clock_timestamp()+$3::integer*interval '1 millisecond')
      on conflict(phone_key) do update set lease_id=excluded.lease_id,lease_until=excluded.lease_until
      where report_conversations.lease_until is null or report_conversations.lease_until<=clock_timestamp() returning phone_key`,
        [phoneKey, leaseId, WEBHOOK_LEASE_MS],
      );
      if (acquired.rowCount !== 1) throw new Error("Report conversation busy; retry delivery");
      try {
        return await work({
          async replay(eventKey) {
            const saved = await pool.query(
              'select ciphertext,iv,auth_tag as "authTag",key_version as "keyVersion" from private.report_message_results where event_key=$1 and phone_key=$2',
              [eventKey, phoneKey],
            );
            return saved.rowCount ? reportRoutingSchema.parse(decode(saved.rows[0])) : null;
          },
          async readDraft() {
            const result = await pool.query(
              'select ciphertext,iv,auth_tag as "authTag",key_version as "keyVersion" from private.report_conversations where phone_key=$1 and lease_id=$2',
              [phoneKey, leaseId],
            );
            const row = rowSchema.parse(result.rows[0]);
            return row.ciphertext === null ? null : reportDraftSchema.parse(decode(row));
          },
          async commit(input) {
            const client = await pool.connect();
            let discard = false;
            try {
              await client.query("begin");
              const owner = await client.query(
                "select phone_key from private.report_conversations where phone_key=$1 and lease_id=$2 and lease_until>clock_timestamp() for update",
                [phoneKey, leaseId],
              );
              if (owner.rowCount !== 1) throw new Error("Report conversation lease expired");
              const result = await client.query(
                'select ciphertext,iv,auth_tag as "authTag",key_version as "keyVersion" from private.report_message_results where event_key=$1 and phone_key=$2',
                [input.eventKey, phoneKey],
              );
              if (result.rowCount) {
                await client.query("commit");
                return reportRoutingSchema.parse(decode(result.rows[0]));
              }
              const publication = input.publication
                ? await publishCommunityReport(client, input.publication, phoneKey, input.now, encryption)
                : null;
              const response = reportRoutingSchema.parse(input.reply(publication));
              const next = input.nextDraft ? reportDraftSchema.parse(input.nextDraft) : null;
              const encoded = next ? encode(next) : null;
              await client.query(
                "update private.report_conversations set ciphertext=$3,iv=$4,auth_tag=$5,key_version=$6,expires_at=$7 where phone_key=$1 and lease_id=$2",
                [
                  phoneKey,
                  leaseId,
                  encoded?.ciphertext ?? null,
                  encoded?.iv ?? null,
                  encoded?.authTag ?? null,
                  encoded?.keyVersion ?? null,
                  next?.expiresAt ?? null,
                ],
              );
              const responseEnvelope = encode(response);
              await client.query(
                "insert into private.report_message_results(event_key,phone_key,ciphertext,iv,auth_tag,key_version) values($1,$2,$3,$4,$5,$6)",
                [
                  input.eventKey,
                  phoneKey,
                  responseEnvelope.ciphertext,
                  responseEnvelope.iv,
                  responseEnvelope.authTag,
                  responseEnvelope.keyVersion,
                ],
              );
              await client.query("commit");
              return response;
            } catch (error) {
              try {
                await client.query("rollback");
              } catch (rollbackError) {
                discard = true;
                throw new AggregateError([error, rollbackError], "Report transaction rollback failed");
              }
              throw error;
            } finally {
              client.release(discard);
            }
          },
        });
      } finally {
        await pool.query("update private.report_conversations set lease_id=null,lease_until=null where phone_key=$1 and lease_id=$2", [
          phoneKey,
          leaseId,
        ]);
      }
    },
  };
}
