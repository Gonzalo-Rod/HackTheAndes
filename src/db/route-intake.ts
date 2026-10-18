import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { decryptContact, encryptContact, EncryptedContactSchema } from "@/integrations/security/contacts";
import { routeDraftSchema, type RouteAction, type RouteDraft } from "@/contracts/route-subscriptions";
import { subscriptionRangeSchema } from "@/contracts/notifications";
import { ROUTE_ORIGIN_PROMPT, routeDestinationPrompt, routeProposal } from "@/domain/subscriptions/messages";
import { readActiveAlertPass } from "./active-alert-pass";
import { activateSubscription } from "./activate-subscription";
import { passDeadline } from "@/domain/subscriptions/alert-pass";
type Encryption = { key: string; version: string };
export async function readRouteState(db: Pick<Pool, "query">, encryption: Encryption, key: string, eventKey: string, now: string) {
  const replay = await db.query(
    'select ciphertext,iv,auth_tag as "authTag",key_version as "keyVersion" from private.subscription_results where event_key=$1',
    [eventKey],
  );
  function decode(row: unknown) {
    const value = EncryptedContactSchema.parse(row);
    if (value.keyVersion !== encryption.version) throw new Error("Route key version unavailable");
    return decryptContact(value, encryption.key);
  }
  if (replay.rowCount) return { reply: z.string().max(4096).parse(decode(replay.rows[0])), draft: null };
  const result = await db.query(
    'select ciphertext,iv,auth_tag as "authTag",key_version as "keyVersion" from private.route_intake where phone_key=$1 and expires_at>$2',
    [key, now],
  );
  return { reply: null, draft: result.rowCount ? routeDraftSchema.parse(JSON.parse(decode(result.rows[0]))) : null };
}
async function saveDraft(db: PoolClient, encryption: Encryption, key: string, draft: RouteDraft) {
  const value = encryptContact(JSON.stringify(routeDraftSchema.parse(draft)), encryption.key, encryption.version);
  await db.query(
    "insert into private.route_intake(phone_key,ciphertext,iv,auth_tag,key_version,expires_at) values($1,$2,$3,$4,$5,$6) on conflict(phone_key) do update set ciphertext=excluded.ciphertext,iv=excluded.iv,auth_tag=excluded.auth_tag,key_version=excluded.key_version,expires_at=excluded.expires_at",
    [key, value.ciphertext, value.iv, value.authTag, value.keyVersion, draft.expiresAt],
  );
}
export async function actRoute(
  db: PoolClient,
  encryption: Encryption,
  input: { key: string; destination: string; now: string },
  action: RouteAction,
) {
  const { key, now } = input;
  if (action.kind === "routeCancel") {
    await db.query("delete from private.route_intake where phone_key=$1", [key]);
    return "Propuesta de ruta descartada. No cambió tu suscripción actual. RUTA inicia otra; STOP cancela las alertas.";
  }
  const pass = await readActiveAlertPass(db, key, now);
  if (!pass) return "Necesitas un pase vigente. Escribe SUSCRIBIR para comprar 7 días; después RUTA elige tu tramo sin otro pago.";
  if (action.kind === "routeStart") {
    if (action.draft.isTest && !pass.isTest)
      return "RUTA PRUEBA requiere un pase DEMO de un número de prueba configurado. Usa RUTA para tu pase actual.";
    await saveDraft(db, encryption, key, action.draft);
    return ROUTE_ORIGIN_PROMPT;
  }
  const { draft } = await readRouteState(db, encryption, key, "", now);
  if (action.kind === "routeActivate") {
    if (!draft?.proposal || draft.proposal.code !== action.code)
      return "El código de ruta no corresponde o expiró. Escribe RUTA para elegirla de nuevo; no se hizo ningún cobro.";
    await activateSubscription(
      db,
      {
        ...input,
        isTeam: pass.isTeam,
        isTest: pass.isTest,
        expiresAt: pass.expiresAt.toISOString(),
        paymentId: pass.paymentId,
        range: draft.proposal.range,
        routeActive: true,
      },
      encryption,
    );
    await db.query("delete from private.route_intake where phone_key=$1", [key]);
    return `${pass.isTest ? "DEMO · " : ""}Ruta activa: ${draft.proposal.range.label}. Sin otro pago; tu pase vence ${passDeadline(pass.expiresAt.toISOString())} (Perú). Avisaremos de reportes SIN CONFIRMAR, cambios SUTRAN y posibles huaicos estimados. STOP o BAJA detiene las notificaciones sin perder el tiempo restante del pase. Los PDF requieren autorizar SEMANAL por separado.`;
  }
  if (!draft || draft.id !== action.draftId) return "La propuesta de ruta cambió o expiró. Escribe RUTA para comenzar de nuevo.";
  if (draft.proposal) return routeProposal(draft.proposal.range, draft.proposal.code);
  if (action.kind === "routeOrigin") {
    if (draft.origin) return "Ya elegiste un origen. Envía el destino o escribe RUTA para reiniciar.";
    await saveDraft(db, encryption, key, { ...draft, origin: action.endpoint });
    return routeDestinationPrompt(action.endpoint.label);
  }
  if (!draft.origin || JSON.stringify(draft.origin) !== JSON.stringify(action.origin))
    return "El origen cambió. Escribe RUTA para revisar la propuesta.";
  const range = subscriptionRangeSchema.parse(action.range);
  await saveDraft(db, encryption, key, { ...draft, proposal: { range, code: action.code } });
  return routeProposal(range, action.code);
}
