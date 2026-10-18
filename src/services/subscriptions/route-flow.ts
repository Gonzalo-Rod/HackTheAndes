import { randomUUID } from "node:crypto";
import { createCorridorRoute } from "@peruroad/road-data/context";
import { roadContextResponseSchema, type RoadContextRequest, type RoadContextResponse } from "@peruroad/road-data/context/contracts";
import type { ForecastRoad } from "@/contracts/forecast-roads";
import type { InboundMessageData } from "@/integrations/zavu/events";
import type { RouteEndpoint, RouteRoad } from "@/contracts/route-subscriptions";
import type { SubscriptionAction, SubscriptionRepository } from "@/db/subscriptions";
import type { RoadPosition } from "@/db/road-locator";
import { parseRoadCode, sameRoadCode } from "@/domain/messaging/dashboard-links";
import {
  routeDestinationPrompt,
  routeOriginPrompt,
  routeRangeLabel,
  routeRoadPrompt,
  type RoutePromptRoad,
} from "@/domain/subscriptions/messages";
import { logger } from "@/lib/logger";
/** Route proposals expire with the existing 30-minute consent window. */
const ROUTE_DRAFT_TTL_MS = 30 * 60_000;
const PILOT_ROAD_CODE = "PE-22";

/** Registered roads and pin matching; without them RUTA keeps its original PE-22-only behavior. */
export interface RouteRoads {
  roads: () => Promise<ForecastRoad[]>;
  locate: (position: { latitude: number; longitude: number }, revisions: readonly string[]) => Promise<RoadPosition | null>;
}

type Located = { road: RouteRoad; endpoint: RouteEndpoint } | { reply: string };

export function createRouteFlow(deps: {
  repository: SubscriptionRepository;
  context: (input: RoadContextRequest, requestId: string) => Promise<RoadContextResponse>;
  revision: string;
  now: () => number;
  newId?: () => string;
  national?: RouteRoads;
}) {
  const pilot: RouteRoad = { roadCode: PILOT_ROAD_CODE, geometryRevision: deps.revision };
  const isPilot = (road: RouteRoad) => road.geometryRevision === deps.revision;
  const kmLabel = (distanceKm: number) => `Km ${distanceKm.toFixed(1)} del mapa`;

  async function promptRoad(road: RouteRoad): Promise<RoutePromptRoad & { geometryRevision: string }> {
    const bounds = await deps.repository.bounds(road.geometryRevision);
    return { ...road, ...bounds, pilot: isPilot(road) };
  }
  async function registeredRoads(): Promise<RouteRoad[]> {
    if (!deps.national) return [pilot];
    return (await deps.national.roads()).map((road) =>
      road.pilot ? pilot : { roadCode: road.roadCode, geometryRevision: road.geometryRevision },
    );
  }
  /** A registered road for the code, or the reply listing the roads users can choose. */
  async function resolveRoad(code: string): Promise<RouteRoad | string> {
    const roads = await registeredRoads();
    return (
      roads.find((road) => sameRoadCode(road.roadCode, code)) ??
      `${code} aún no está disponible para rutas. Carreteras disponibles: ${roads.map((road) => road.roadCode).join(", ")}. Tu suscripción no cambió.`
    );
  }
  /** Pilot pins and places use the PE-22 gazetteer; other roads match pins within 500 m. */
  async function locatePilot(request: RoadContextRequest, requestId: string): Promise<Located | null> {
    const result = roadContextResponseSchema.parse(await deps.context(request, requestId));
    if (
      result.kind !== "location" ||
      result.state !== "ready" ||
      result.status !== "matched" ||
      !result.location ||
      result.location.geometryRevision !== deps.revision
    )
      return null;
    const distanceKm = result.location.distanceFromOriginKm;
    return { road: pilot, endpoint: { distanceKm, label: kmLabel(distanceKm), geometryRevision: deps.revision } };
  }
  async function locatePin(position: { latitude: number; longitude: number }, road: RouteRoad | null, requestId: string): Promise<Located> {
    if (!road || isPilot(road)) {
      const onPilot = await locatePilot({ kind: "pin", ...position }, requestId);
      if (onPilot) return onPilot;
      if (road)
        return {
          reply:
            "No pude ubicar ese pin sobre PE-22. Comparte uno a menos de 500 m de la vía o envía KM del mapa. No se activó ni amplió la ruta.",
        };
    }
    const candidates = road ? [road] : (await registeredRoads()).filter((item) => !isPilot(item));
    const found = deps.national
      ? await deps.national.locate(
          position,
          candidates.map((item) => item.geometryRevision),
        )
      : null;
    const match = found && candidates.find((item) => item.geometryRevision === found.geometryRevision);
    if (!found || !match)
      return {
        reply: road
          ? `No pude ubicar ese pin sobre ${road.roadCode}. Comparte uno a menos de 500 m de la vía o envía KM del mapa. No se activó ni amplió la ruta.`
          : `El pin está a más de 500 m de las carreteras disponibles. Escribe el código de la carretera (por ejemplo PE-22) o comparte otro pin sobre la vía.`,
      };
    return {
      road: match,
      endpoint: {
        distanceKm: found.distanceFromOriginKm,
        label: kmLabel(found.distanceFromOriginKm),
        geometryRevision: match.geometryRevision,
      },
    };
  }

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
        const start = /^RUTA(\s+PRUEBA)?(?:\s+(.+))?$/.exec(normalized);
        const code = start?.[2] ? parseRoadCode(start[2]) : null;
        if (!start || (start[2] && !code))
          return "RUTA elige carretera, origen y destino con tu pase vigente (por ejemplo RUTA PE-22). RUTA ACTIVAR <código> confirma el tramo sin otro pago; RUTA CANCELAR descarta la propuesta.";
        const road = code ? await resolveRoad(code) : deps.national ? null : pilot;
        if (typeof road === "string") return road;
        return act({
          kind: "routeStart",
          draft: {
            id: (deps.newId ?? randomUUID)(),
            road,
            origin: null,
            isTest: sender.isTest || Boolean(start[1]),
            expiresAt: new Date(Math.min(deps.now(), message.providerTimestamp ?? deps.now()) + ROUTE_DRAFT_TTL_MS).toISOString(),
          },
          prompt: road
            ? routeOriginPrompt(await promptRoad(road))
            : routeRoadPrompt((await registeredRoads()).map((item) => item.roadCode)),
        });
      }
      const draft = state.draft;
      if (!draft) return null;
      if (/^(REPORTE|REPORTAR)\b/.test(normalized))
        return "Estás eligiendo una ruta. Termínala o escribe CANCELAR antes de iniciar REPORTE; aún no se creó ese reporte.";
      if (["CANCELAR", "CANCEL"].includes(normalized)) return act({ kind: "routeCancel" });
      if (draft.proposal)
        return `Revisa el tramo propuesto y escribe RUTA ACTIVAR ${draft.proposal.code}, o RUTA CANCELAR. No se cambió tu ruta.`;
      // Drafts saved before national routes have no road field; they were PE-22.
      const road = draft.road === undefined ? pilot : draft.road;
      const value = text.replace(/^(ORIGEN|DESTINO)\s*:?\s*/i, "").trim();

      const code = message.messageType === "text" ? parseRoadCode(value) : null;
      if (code) {
        if (draft.origin)
          return `Ya elegiste el origen en ${road?.roadCode ?? PILOT_ROAD_CODE}. Envía el destino o escribe RUTA ${code} para empezar de nuevo con esa carretera.`;
        const selected = await resolveRoad(code);
        if (typeof selected === "string") return selected;
        return act({ kind: "routeRoad", draftId: draft.id, road: selected, prompt: routeOriginPrompt(await promptRoad(selected)) });
      }

      let located: Located;
      const km = /^(?:KM|KILOMETRO)\s+(\d+(?:[.,]\d{1,3})?)$/i.exec(value);
      if (message.messageType === "text" && km) {
        if (!road)
          return `Primero elige la carretera: escribe su código, por ejemplo PE-22. Disponibles: ${(await registeredRoads()).map((item) => item.roadCode).join(", ")}.`;
        const bounds = await deps.repository.bounds(road.geometryRevision);
        const distanceKm = Number(km[1]?.replace(",", "."));
        if (distanceKm < bounds.startKm || distanceKm > bounds.endKm)
          return `Solo cubrimos km aprox. ${bounds.startKm.toFixed(1)}–${bounds.endKm.toFixed(1)} del mapa ${road.roadCode}, no hitos oficiales. Elige otro extremo; tu suscripción no cambió.`;
        located = { road, endpoint: { distanceKm, label: kmLabel(distanceKm), geometryRevision: road.geometryRevision } };
      } else if (message.messageType === "location") {
        const pin = message.content;
        if (pin?.latitude === undefined || pin.longitude === undefined)
          return "Comparte un pin estático de WhatsApp con latitud y longitud sobre la vía. No recibimos ubicación continua.";
        located = await locatePin({ latitude: pin.latitude, longitude: pin.longitude }, road, requestId);
      } else {
        if (road && !isPilot(road))
          return `El catálogo de lugares cubre solo PE-22. En ${road.roadCode} envía KM del mapa o un pin de WhatsApp sobre la vía.`;
        located = (await locatePilot({ kind: "place", name: value }, requestId)) ?? {
          reply:
            "No pude ubicar ese extremo sobre PE-22. Comparte un pin a menos de 500 m del eje disponible o un lugar del catálogo. No se activó ni amplió la ruta.",
        };
      }
      if ("reply" in located) return located.reply;

      if (!draft.origin) {
        const promptRoadValue = await promptRoad(located.road);
        return act({
          kind: "routeOrigin",
          draftId: draft.id,
          endpoint: located.endpoint,
          road: located.road,
          prompt: routeDestinationPrompt(located.endpoint.label, promptRoadValue),
        });
      }
      const bounds = { ...(await deps.repository.bounds(located.road.geometryRevision)), geometryRevision: located.road.geometryRevision };
      const route = createCorridorRoute(draft.origin, located.endpoint, bounds);
      if (!route.ok)
        return `Los extremos deben ser distintos y estar en la misma carretera (${located.road.roadCode}). Envía otro destino; tu suscripción no cambió.`;
      return act({
        kind: "routeDestination",
        draftId: draft.id,
        origin: draft.origin,
        range: {
          ...route.value,
          label: routeRangeLabel(located.road.roadCode, isPilot(located.road), route.value.label),
          roadCode: located.road.roadCode,
        },
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
