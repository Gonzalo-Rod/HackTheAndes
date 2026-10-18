import type { Pool } from "pg";
import { z } from "zod";
import { encryptContact, decryptContact, EncryptedContactSchema } from "@/integrations/security/contacts";
import { subscriptionRangeSchema, type SubscriptionRange } from "@/contracts/notifications";
import { transaction } from "./transaction";
import { actRoute, readRouteState } from "./route-intake";
import type { RouteAction } from "@/contracts/route-subscriptions";
import { subscriptionProposal } from "@/domain/subscriptions/messages";
import { actWeeklyPreference, type WeeklyPreferenceAction } from "./weekly-preferences";
export type SubscriptionAction =
  | { kind: "prepare"; range: SubscriptionRange; code: string; isTest: boolean }
  | { kind: "activate"; code: string }
  | { kind: "stop" }
  | RouteAction
  | WeeklyPreferenceAction;
export function createSubscriptionRepository(pool: Pool, encryption: { key: string; version: string }) {
  return {
    routeState: (key: string, eventKey: string, now: string) => readRouteState(pool, encryption, key, eventKey, now),
    async bounds(revision: string) {
      const result = await pool.query(
        'select min(distance_from_origin_start_km)::float8 as "startKm",max(distance_from_origin_end_km)::float8 as "endKm" from public.segments where geometry_revision=$1',
        [revision],
      );
      return z.object({ startKm: z.number().nonnegative(), endKm: z.number().positive() }).parse(result.rows[0]);
    },
    async touch(key: string, at: string) {
      await pool.query(
        "update public.subscriptions set last_inbound_at=greatest(last_inbound_at,$2::timestamptz) where phone_key=$1 and opted_out_at is null",
        [key, at],
      );
    },
    async act(input: {
      key: string;
      eventKey: string;
      destination: string;
      action: SubscriptionAction;
      now: string;
      isTeam: boolean;
      isTest: boolean;
    }): Promise<string> {
      return transaction(pool, async (client) => {
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`subscription:${input.key}`]);
        const replay = await client.query(
          'select ciphertext,iv,auth_tag as "authTag",key_version as "keyVersion" from private.subscription_results where event_key=$1',
          [input.eventKey],
        );
        if (replay.rowCount) {
          const saved = EncryptedContactSchema.parse(replay.rows[0]);
          if (saved.keyVersion !== encryption.version) throw new Error("Subscription key version unavailable");
          return z.string().max(4096).parse(decryptContact(saved, encryption.key));
        }
        let reply: string;
        const action = input.action;
        if (
          action.kind === "routeStart" ||
          action.kind === "routeCancel" ||
          action.kind === "routeOrigin" ||
          action.kind === "routeDestination"
        ) {
          reply = await actRoute(client, encryption, input.key, action, input.now);
        } else if (action.kind === "weeklyPrepare" || action.kind === "weeklyActivate" || action.kind === "weeklyStop") {
          reply = await actWeeklyPreference(client, input.key, action, input.now);
        } else if (action.kind === "stop") {
          await client.query("delete from private.route_intake where phone_key=$1", [input.key]);
          await client.query("update public.subscriptions set opted_out_at=$2 where phone_key=$1 and opted_out_at is null", [
            input.key,
            input.now,
          ]);
          await client.query("delete from private.subscription_intake where phone_key=$1", [input.key]);
          await client.query("update private.delivery_contacts set disabled_at=$2 where phone_key=$1", [input.key, input.now]);
          await client.query(
            "update private.alert_deliveries set status='cancelled',lease_id=null,lease_until=null where status='pending' and subscription_id in(select id from public.subscriptions where phone_key=$1)",
            [input.key],
          );
          await client.query(
            "delete from private.weekly_pdf_preferences where subscription_id in(select id from public.subscriptions where phone_key=$1)",
            [input.key],
          );
          await client.query(
            "update private.weekly_pdf_deliveries set status='cancelled',lease_id=null,lease_until=null where subscription_id in(select id from public.subscriptions where phone_key=$1) and status='pending'",
            [input.key],
          );
          reply =
            "Alertas canceladas. También se canceló el PDF semanal. No recibirás nuevas notificaciones automáticas. Para volver, escribe SUSCRIBIR.";
        } else if (action.kind === "prepare") {
          const range = subscriptionRangeSchema.parse(action.range);
          await client.query("delete from private.route_intake where phone_key=$1", [input.key]);
          await client.query(
            `insert into private.subscription_intake(phone_key,code,range,is_test,expires_at) values($1,$2,$3::jsonb,$4,$5::timestamptz+interval '30 minutes') on conflict(phone_key) do update set code=excluded.code,range=excluded.range,is_test=excluded.is_test,expires_at=excluded.expires_at`,
            [input.key, action.code, JSON.stringify(range), action.isTest, input.now],
          );
          reply = subscriptionProposal(range, action.code, action.isTest);
        } else {
          const pending = await client.query(
            'select code,range,is_test as "isTest",expires_at as "expiresAt" from private.subscription_intake where phone_key=$1',
            [input.key],
          );
          if (!pending.rowCount) reply = "No hay una suscripción pendiente. Escribe SUSCRIBIR para elegir el tramo.";
          else {
            const draft = z
              .object({ code: z.string(), range: subscriptionRangeSchema, isTest: z.boolean(), expiresAt: z.date() })
              .parse(pending.rows[0]);
            if (draft.code !== action.code || draft.expiresAt.getTime() <= Date.parse(input.now))
              reply = "El código no corresponde o expiró. Escribe SUSCRIBIR para volver a elegir el tramo.";
            else {
              const e = encryptContact(input.destination, encryption.key, encryption.version);
              const contact = await client.query(
                `insert into private.delivery_contacts(phone_key,ciphertext,iv,auth_tag,key_version) values($1,$2,$3,$4,$5) on conflict(phone_key) do update set ciphertext=excluded.ciphertext,iv=excluded.iv,auth_tag=excluded.auth_tag,key_version=excluded.key_version,disabled_at=null returning id`,
                [input.key, e.ciphertext, e.iv, e.authTag, e.keyVersion],
              );
              const id = z.uuid().parse(contact.rows[0]?.id);
              // Replacing consent invalidates queued notifications for the old route/consent.
              await client.query(
                "update private.alert_deliveries set status='cancelled',lease_id=null,lease_until=null where status='pending' and subscription_id in(select id from public.subscriptions where phone_key=$1)",
                [input.key],
              );
              const saved = await client.query(
                `insert into public.subscriptions(contact_ref,phone_key,road_code,km_start,km_end,distance_reference,channel,consent_at,is_team,is_test,geometry_revision,range_label,last_inbound_at) values($1,$2,'PE-22',$3,$4,'geometry_distance','whatsapp',$5,$6,$7,$8,$9,$5) on conflict(phone_key,road_code) where opted_out_at is null do update set contact_ref=excluded.contact_ref,km_start=excluded.km_start,km_end=excluded.km_end,consent_at=excluded.consent_at,is_team=excluded.is_team,is_test=excluded.is_test,geometry_revision=excluded.geometry_revision,range_label=excluded.range_label,last_inbound_at=excluded.last_inbound_at returning id`,
                [
                  id,
                  input.key,
                  draft.range.startKm,
                  draft.range.endKm,
                  input.now,
                  input.isTeam,
                  draft.isTest || input.isTest,
                  draft.range.geometryRevision,
                  draft.range.label,
                ],
              );
              await client.query("delete from private.subscription_checkpoints where subscription_id=$1", [
                z.uuid().parse(saved.rows[0]?.id),
              ]);
              await client.query("delete from private.weekly_pdf_preferences where subscription_id=$1", [
                z.uuid().parse(saved.rows[0]?.id),
              ]);
              await client.query("delete from private.subscription_intake where phone_key=$1", [input.key]);
              reply = `${draft.isTest ? "DEMO · " : ""}Suscripción activa: ${draft.range.label}. Avisaremos cuando detectemos novedades en este tramo: reportes SIN CONFIRMAR, cambios SUTRAN y posibles huaicos estimados. Sin novedades no enviamos nada. STOP o BAJA cancela. Los PDF de esta ruta requieren autorizar SEMANAL por separado. No se enviarán fotos ni llamadas. Si WhatsApp no permite enviar, la entrega quedará pendiente; ESTADO y EXPOSICION siguen disponibles.`;
            }
          }
        }
        const e = encryptContact(reply, encryption.key, encryption.version);
        await client.query(
          "insert into private.subscription_results(event_key,ciphertext,iv,auth_tag,key_version) values($1,$2,$3,$4,$5)",
          [input.eventKey, e.ciphertext, e.iv, e.authTag, e.keyVersion],
        );
        return reply;
      });
    },
  };
}
export type SubscriptionRepository = ReturnType<typeof createSubscriptionRepository>;
