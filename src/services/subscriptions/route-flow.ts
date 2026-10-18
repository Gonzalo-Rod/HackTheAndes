import { randomUUID } from "node:crypto";
import { createCorridorRoute } from "@peruroad/road-data/context";
import { roadContextResponseSchema, type RoadContextRequest, type RoadContextResponse } from "@peruroad/road-data/context/contracts";
import type { InboundMessageData } from "@/integrations/zavu/events";
import type { RouteEndpoint } from "@/contracts/route-subscriptions";
import type { SubscriptionAction, SubscriptionRepository } from "@/db/subscriptions";
import { logger } from "@/lib/logger";
/** Route proposals expire with the existing 30-minute consent window. */
const ROUTE_DRAFT_TTL_MS = 30 * 60_000;
export function createRouteFlow(deps: {
  repository: SubscriptionRepository;
  context: (input: RoadContextRequest, requestId: string) => Promise<RoadContextResponse>;
  revision: string;
  now: () => number;
  newId?: () => string;
}) {
  return async (
    message: InboundMessageData,
    requestId: string,
    sender: { key: string; eventKey: string; isTest: boolean },
    act: (action: SubscriptionAction) => Promise<string>,
  ): Promise<string | null> => {
    const text = message.text.trim();
    const normalized = text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    if (!["text", "location"].includes(message.messageType)) return null;
    if (
      /^(CONFIRMAR|ACTIVAR|PAGAR|PAGO|SEMANAL|PDF|ESTADO|STATUS|EXPOSICION|CLIMA|AYUDA|HELP|SUSCRIBIR|AVISAME|BAJA|STOP|HOLA)\b/.test(
        normalized,
      )
    )
      return null;
    const explicit = /^RUTA(?:\s|$)/.test(normalized);
    try {
      const state = await deps.repository.routeState(sender.key, sender.eventKey, new Date(deps.now()).toISOString());
      if (state.reply) return state.reply;
      if (explicit) {
        if (normalized === "RUTA CANCELAR") return act({ kind: "routeCancel" });
        const activate = /^RUTA ACTIVAR ([A-F0-9]{8})$/.exec(normalized);
        if (activate) return act({ kind: "routeActivate", code: activate[1] ?? "" });
        if (!/^RUTA(?:\s+PRUEBA)?$/.test(normalized))
          return "RUTA elige origen y destino con tu pase vigente. RUTA ACTIVAR <código> confirma el tramo sin otro pago; RUTA CANCELAR descarta la propuesta.";
        return act({
          kind: "routeStart",
          draft: {
            id: (deps.newId ?? randomUUID)(),
            origin: null,
            isTest: sender.isTest || /\bPRUEBA\b/.test(normalized),
            expiresAt: new Date(Math.min(deps.now(), message.providerTimestamp ?? deps.now()) + ROUTE_DRAFT_TTL_MS).toISOString(),
          },
        });
      }
      const draft = state.draft;
      if (!draft) return null;
      if (/^(REPORTE|REPORTAR)\b/.test(normalized))
        return "Estás eligiendo una ruta. Termínala o escribe CANCELAR antes de iniciar REPORTE; aún no se creó ese reporte.";
      if (["CANCELAR", "CANCEL"].includes(normalized)) return act({ kind: "routeCancel" });
      if (draft.proposal)
        return `Revisa el tramo propuesto y escribe RUTA ACTIVAR ${draft.proposal.code}, o RUTA CANCELAR. No se cambió tu ruta.`;
      const bounds = { ...(await deps.repository.bounds(deps.revision)), geometryRevision: deps.revision };
      const value = text.replace(/^(ORIGEN|DESTINO)\s*:?\s*/i, "").trim();
      const km = /^(?:KM|KILOMETRO)\s+(\d+(?:[.,]\d{1,3})?)$/i.exec(value);
      let endpoint: RouteEndpoint;
      if (message.messageType === "text" && km) {
        const distanceKm = Number(km[1]?.replace(",", "."));
        if (distanceKm < bounds.startKm || distanceKm > bounds.endKm)
          return `Solo cubrimos km aprox. ${bounds.startKm.toFixed(1)}–${bounds.endKm.toFixed(1)} del mapa PE-22, no hitos oficiales. Elige otro extremo; tu suscripción no cambió.`;
        endpoint = { distanceKm, label: `Km ${distanceKm.toFixed(1)} del mapa`, geometryRevision: deps.revision };
      } else {
        const pin = message.content;
        if (message.messageType === "location" && (pin?.latitude === undefined || pin.longitude === undefined))
          return "Comparte un pin estático de WhatsApp con latitud y longitud sobre PE-22. No recibimos ubicación continua.";
        const request: RoadContextRequest =
          message.messageType === "location" && pin?.latitude !== undefined && pin.longitude !== undefined
            ? { kind: "pin", latitude: pin.latitude, longitude: pin.longitude }
            : { kind: "place", name: value };
        const result = roadContextResponseSchema.parse(await deps.context(request, requestId));
        if (
          result.kind !== "location" ||
          result.state !== "ready" ||
          result.status !== "matched" ||
          !result.location ||
          result.location.geometryRevision !== deps.revision
        )
          return "No pude ubicar ese extremo sobre PE-22. Comparte un pin a menos de 500 m del eje disponible o un lugar del catálogo. No se activó ni amplió la ruta.";
        endpoint = {
          distanceKm: result.location.distanceFromOriginKm,
          label: `Km ${result.location.distanceFromOriginKm.toFixed(1)} del mapa`,
          geometryRevision: deps.revision,
        };
      }
      if (!draft.origin) return act({ kind: "routeOrigin", draftId: draft.id, endpoint });
      const route = createCorridorRoute(draft.origin, endpoint, bounds);
      if (!route.ok)
        return "Los extremos deben ser distintos y estar en el mismo eje PE-22 disponible. Envía otro destino; tu suscripción no cambió.";
      return act({
        kind: "routeDestination",
        draftId: draft.id,
        origin: draft.origin,
        range: route.value,
        code: (deps.newId ?? randomUUID)().replaceAll("-", "").slice(0, 8).toUpperCase(),
      });
    } catch (error) {
      logger.warn({
        requestId,
        operation: "subscription.route",
        provider: "supabase",
        result: "fallback",
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      return "No puedo verificar la ruta ahora. No cambió tu suscripción. Intenta otra vez o escribe STOP para cancelar las alertas.";
    }
  };
}
