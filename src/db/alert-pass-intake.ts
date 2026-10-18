import type { PoolClient } from "pg";
import type { SubscriptionRange } from "@/contracts/notifications";
import { alertPassWindow, passDeadline } from "@/domain/subscriptions/alert-pass";
import { encryptContact } from "@/integrations/security/contacts";

export async function prepareAlertPass(
  client: PoolClient,
  input: {
    key: string;
    eventKey: string;
    destination: string;
    now: string;
    isTeam: boolean;
    isTest: boolean;
  },
  draft: { range: SubscriptionRange; requestedAt: Date; isTest: boolean },
  encryption: { key: string; version: string },
) {
  const window = alertPassWindow(draft.requestedAt.toISOString());
  if (Date.parse(window.expiresAt) <= Date.parse(input.now)) return "La solicitud de 7 días expiró. Escribe SUSCRIBIR para iniciar otra.";
  await client.query("update private.alert_pass_requests set status='cancelled' where phone_key=$1 and status='pending'", [input.key]);
  const contact = encryptContact(input.destination, encryption.key, encryption.version);
  await client.query(
    `insert into private.alert_pass_requests(phone_key,event_key,range,ciphertext,iv,auth_tag,key_version,requested_at,expires_at,consent_at,is_team,is_test)
     values($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      input.key,
      input.eventKey,
      JSON.stringify(draft.range),
      contact.ciphertext,
      contact.iv,
      contact.authTag,
      contact.keyVersion,
      window.requestedAt,
      window.expiresAt,
      input.now,
      input.isTeam,
      input.isTest || draft.isTest,
    ],
  );
  await client.query("delete from private.subscription_intake where phone_key=$1", [input.key]);
  return `Solicitud de alertas por 7 días: USD 0,001, pago único con Qatom. Vence el ${passDeadline(window.expiresAt)} (Perú), contando desde tu solicitud, sin renovación automática. Aún no está activa. Escribe PAGAR para obtener el enlace o BAJA para cancelar.`;
}
