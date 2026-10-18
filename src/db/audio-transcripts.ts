import type { Pool } from "pg";
import { z } from "zod";
import { encryptContact, decryptContact, EncryptedContactSchema } from "@/integrations/security/contacts";
export function createAudioCache(pool: Pool, encryption: { key: string; version: string }) {
  return {
    async read(eventKey: string) {
      const result = await pool.query(
        'select ciphertext,iv,auth_tag as "authTag",key_version as "keyVersion" from private.audio_transcripts where event_key=$1',
        [eventKey],
      );
      if (!result.rowCount) return null;
      const row = EncryptedContactSchema.parse(result.rows[0]);
      if (row.keyVersion !== encryption.version) throw new Error("Audio key version unavailable");
      return z.string().min(1).max(4096).parse(decryptContact(row, encryption.key));
    },
    async save(eventKey: string, text: string) {
      const e = encryptContact(z.string().min(1).max(4096).parse(text), encryption.key, encryption.version);
      await pool.query(
        "insert into private.audio_transcripts(event_key,ciphertext,iv,auth_tag,key_version) values($1,$2,$3,$4,$5) on conflict(event_key) do nothing",
        [eventKey, e.ciphertext, e.iv, e.authTag, e.keyVersion],
      );
    },
  };
}
