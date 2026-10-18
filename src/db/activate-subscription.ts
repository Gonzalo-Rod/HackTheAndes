import type { PoolClient } from "pg";
import { z } from "zod";
import type { SubscriptionRange } from "@/contracts/notifications";
import { encryptContact } from "@/integrations/security/contacts";

export async function activateSubscription(
  client: PoolClient,
  input: {
    key: string;
    destination: string;
    now: string;
    isTeam: boolean;
    isTest: boolean;
    range: SubscriptionRange;
    expiresAt: string;
    paymentId: string | null;
  },
  encryption: { key: string; version: string },
) {
  const contact = encryptContact(input.destination, encryption.key, encryption.version);
  const savedContact = await client.query(
    `insert into private.delivery_contacts(phone_key,ciphertext,iv,auth_tag,key_version) values($1,$2,$3,$4,$5)
     on conflict(phone_key) do update set ciphertext=excluded.ciphertext,iv=excluded.iv,auth_tag=excluded.auth_tag,key_version=excluded.key_version,disabled_at=null returning id`,
    [input.key, contact.ciphertext, contact.iv, contact.authTag, contact.keyVersion],
  );
  await client.query(
    "update private.alert_deliveries set status='cancelled',lease_id=null,lease_until=null where status='pending' and subscription_id in(select id from public.subscriptions where phone_key=$1)",
    [input.key],
  );
  const saved = await client.query(
    `insert into public.subscriptions(contact_ref,phone_key,road_code,km_start,km_end,distance_reference,channel,consent_at,is_team,is_test,geometry_revision,range_label,last_inbound_at,alert_expires_at,alert_payment_id)
     values($1,$2,'PE-22',$3,$4,'geometry_distance','whatsapp',$5,$6,$7,$8,$9,$5,$10,$11)
     on conflict(phone_key,road_code) where opted_out_at is null do update set contact_ref=excluded.contact_ref,km_start=excluded.km_start,km_end=excluded.km_end,consent_at=excluded.consent_at,is_team=excluded.is_team,is_test=excluded.is_test,geometry_revision=excluded.geometry_revision,range_label=excluded.range_label,last_inbound_at=excluded.last_inbound_at,alert_expires_at=excluded.alert_expires_at,alert_payment_id=excluded.alert_payment_id returning id`,
    [
      z.uuid().parse(savedContact.rows[0]?.id),
      input.key,
      input.range.startKm,
      input.range.endKm,
      input.now,
      input.isTeam,
      input.isTest,
      input.range.geometryRevision,
      input.range.label,
      input.expiresAt,
      input.paymentId,
    ],
  );
  const id = z.uuid().parse(saved.rows[0]?.id);
  await client.query("delete from private.subscription_checkpoints where subscription_id=$1", [id]);
  await client.query("delete from private.weekly_pdf_preferences where subscription_id=$1", [id]);
  await client.query(
    "update private.weekly_pdf_deliveries set status='cancelled',lease_id=null,lease_until=null where subscription_id=$1 and status='pending'",
    [id],
  );
  return id;
}
