import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { normalizePhone } from "@/domain/access/phone";
export { normalizePhone } from "@/domain/access/phone";

export const EncryptedContactSchema = z.object({
  ciphertext: z.instanceof(Buffer),
  iv: z.instanceof(Buffer).refine((value) => value.length === 12),
  authTag: z.instanceof(Buffer).refine((value) => value.length === 16),
  keyVersion: z.string().min(1),
});
export type EncryptedContact = z.infer<typeof EncryptedContactSchema>;

export function keyedDigest(value: string, secret: string, purpose: string): string {
  return createHmac("sha256", secret).update(`${purpose}\0${value}`).digest("hex");
}

export function phoneKey(phone: string, pepper: string): string | null {
  const normalized = normalizePhone(phone);
  return normalized ? keyedDigest(normalized, pepper, "phone-v1") : null;
}

export function equalDigest(actual: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(actual) || !/^[a-f0-9]{64}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function decodeKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64url");
  if (key.length !== 32) throw new Error("CONTACT_ENCRYPTION_KEY must encode 32 bytes");
  return key;
}

export function encryptContact(value: string, encodedKey: string, keyVersion: string): EncryptedContact {
  // Each encryption, including re-encryption of an existing contact, needs a new IV.
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", decodeKey(encodedKey), iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(`peruroad-contact:${keyVersion}`));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion };
}

export function decryptContact(input: EncryptedContact, encodedKey: string): string {
  const envelope = EncryptedContactSchema.parse(input);
  const decipher = createDecipheriv("aes-256-gcm", decodeKey(encodedKey), envelope.iv, { authTagLength: 16 });
  decipher.setAAD(Buffer.from(`peruroad-contact:${envelope.keyVersion}`));
  decipher.setAuthTag(envelope.authTag);
  return Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]).toString("utf8");
}
