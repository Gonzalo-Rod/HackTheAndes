import type { PoolClient } from "pg";
import { z } from "zod";
export type WeeklyPreferenceAction =
  { kind: "weeklyPrepare"; code: string } | { kind: "weeklyActivate"; code: string } | { kind: "weeklyStop" };
export async function actWeeklyPreference(client: PoolClient, key: string, action: WeeklyPreferenceAction, now: string) {
  const rows = await client.query(
    'select id,range_label as label,consent_at as "consentAt" from public.subscriptions where phone_key=$1 and opted_out_at is null and alert_expires_at>$2 and (alert_payment_id is not null or is_test) for update',
    [key, now],
  );
  if (!rows.rowCount)
    return "Primero elige tu tramo con SUSCRIBIR y confirma ACTIVAR. Después escribe SEMANAL para autorizar el PDF por separado.";
  const sub = z.object({ id: z.uuid(), label: z.string(), consentAt: z.date() }).parse(rows.rows[0]);
  if (action.kind === "weeklyStop") {
    await client.query("delete from private.weekly_pdf_preferences where subscription_id=$1", [sub.id]);
    await client.query(
      "update private.weekly_pdf_deliveries set status='cancelled',lease_id=null,lease_until=null where subscription_id=$1 and status='pending'",
      [sub.id],
    );
    return "PDF semanal cancelado. Tus alertas cortas siguen activas. BAJA cancela todas las notificaciones.";
  }
  if (action.kind === "weeklyPrepare") {
    await client.query(
      `insert into private.weekly_pdf_preferences(subscription_id,subscription_consent_at,pending_code,pending_expires_at) values($1,$2,$3,$4::timestamptz+interval '30 minutes') on conflict(subscription_id) do update set subscription_consent_at=excluded.subscription_consent_at,pending_code=excluded.pending_code,pending_expires_at=excluded.pending_expires_at,consent_at=case when weekly_pdf_preferences.subscription_consent_at=excluded.subscription_consent_at then weekly_pdf_preferences.consent_at else null end`,
      [sub.id, sub.consentAt, action.code, now],
    );
    return `PDF ambiental semanal para ${sub.label}, los lunes a las 07:00 (Perú). Incluye lluvia, reportes y exposición estimada; no certifica seguridad. Fuera de 24 h, el aviso requiere plantilla aprobada; responde PDF para recibir el archivo. Autoriza con SEMANAL ACTIVAR ${action.code}. SEMANAL BAJA cancela solo el PDF; BAJA cancela todo.`;
  }
  const result = await client.query(
    `update private.weekly_pdf_preferences set consent_at=$4,pending_code=null,pending_expires_at=null where subscription_id=$1 and subscription_consent_at=$2 and pending_code=$3 and pending_expires_at>$4 returning subscription_id`,
    [sub.id, sub.consentAt, action.code, now],
  );
  return result.rowCount
    ? "PDF semanal activado. Recibirás el informe de tu tramo los lunes a las 07:00 (Perú). Escribe PDF para pedir uno ahora. Si WhatsApp no permite el aviso, la entrega queda pendiente. SEMANAL BAJA cancela solo el PDF; BAJA cancela todo."
    : "El código semanal no corresponde o expiró. Escribe SEMANAL para volver a solicitarlo.";
}
