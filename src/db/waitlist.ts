import type { Pool } from "pg";
import type { WaitlistInput } from "@/contracts/platform";
import type { EncryptedContact } from "@/integrations/security/contacts";

export interface WaitlistRecord {
  input: WaitlistInput;
  phoneKey: string;
  envelope: EncryptedContact;
  now: string;
  isTeam: boolean;
  isTest: boolean;
}
export function createWaitlistRepository(pool: Pool) {
  return {
    async save(record: WaitlistRecord): Promise<void> {
      const client = await pool.connect();
      let discard = false;
      try {
        await client.query("begin");
        // Serialize the request key before creating its private delivery contact.
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [record.input.requestId]);
        const previous = await client.query("select id from public.waitlist where request_id=$1", [record.input.requestId]);
        if (previous.rowCount) {
          await client.query("commit");
          return;
        }
        const { envelope, input } = record;
        const contact = await client.query(
          `insert into private.delivery_contacts(phone_key,ciphertext,iv,auth_tag,key_version) values($1,$2,$3,$4,$5)
        on conflict(phone_key) do update set phone_key=excluded.phone_key returning id`,
          [record.phoneKey, envelope.ciphertext, envelope.iv, envelope.authTag, envelope.keyVersion],
        );
        await client.query(
          `insert into public.waitlist(company,contact_name,role,fleet_size,routes,contact_ref,consent_at,is_team,is_test,request_id)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            input.company,
            input.contactName,
            input.role,
            input.fleetSize,
            JSON.stringify(input.routes),
            contact.rows[0]?.id,
            record.now,
            record.isTeam,
            record.isTest,
            input.requestId,
          ],
        );
        await client.query("commit");
      } catch (error) {
        try {
          await client.query("rollback");
        } catch {
          discard = true;
        }
        throw new Error("Waitlist transaction failed", { cause: error });
      } finally {
        client.release(discard);
      }
    },
  };
}
export type WaitlistRepository = ReturnType<typeof createWaitlistRepository>;
