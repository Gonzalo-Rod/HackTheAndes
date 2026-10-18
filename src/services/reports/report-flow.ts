import { createHash, randomUUID } from "node:crypto";
import type { RoadContextRequest, RoadContextResponse } from "@peruroad/road-data/context/contracts";
import {
  reportDraftSchema,
  parsedReportContextSchema,
  type ReportDraft,
  type ReportExtractor,
  type ReportRepository,
  type ReportRouter,
  type ReportRouting,
} from "@/contracts/reports";
import type { IntentParser } from "@/contracts/messaging";
import type { RateLimiter } from "@/db/request-limits";
import { keyedDigest, phoneKey } from "@/integrations/security/contacts";
import { parseCommand } from "@/domain/messaging/commands";
import {
  draftPrompt,
  mergeExtraction,
  publicationReply,
  REPORT_DRAFT_TTL_MS,
  REPORT_MESSAGE_LIMIT,
  REPORT_RATE_WINDOW_MS,
} from "@/domain/reports/policy";
import { logger } from "@/lib/logger";

export interface ReportFlowDependencies {
  repository: ReportRepository;
  extractor: ReportExtractor | null;
  intentParser: IntentParser | null;
  limiter: RateLimiter;
  context: (input: RoadContextRequest, requestId: string) => Promise<RoadContextResponse>;
  pepper: string;
  publicUrl: string;
  geometryRevision: string;
  teamPhoneKeys: readonly string[];
  testPhoneKeys: readonly string[];
  now: () => number;
  newId?: () => string;
  onPublication?: (requestId: string) => void;
}
const reply = (text: string): ReportRouting => ({ kind: "reply", text });
const normalize = (text: string) =>
  text
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
const NO_DRAFT = "No hay un reporte pendiente. Envía REPORTE seguido de lo que estás observando en PE-22.";
const EXTRACTION_FAILED =
  "No pude interpretar los detalles. No se publicó ningún reporte nuevo. Describe el incidente en texto; puedes escribir CANCELAR para descartar el borrador.";
export function createReportFlow(deps: ReportFlowDependencies): ReportRouter {
  const newId = deps.newId ?? randomUUID;
  async function locate(
    draft: ReportDraft,
    input: RoadContextRequest,
    requestId: string,
  ): Promise<{ draft: ReportDraft; notice?: string }> {
    try {
      const context = parsedReportContextSchema.parse(await deps.context(input, requestId));
      if (context.kind !== "location" || context.state !== "ready")
        return {
          draft: { ...draft, location: null },
          notice: "No puedo verificar el lugar ahora. Intenta compartir el pin más tarde; aún no se publicó el reporte.",
        };
      if (context.status !== "matched" || !context.location || context.location.geometryRevision !== deps.geometryRevision)
        return {
          draft: { ...draft, location: null },
          notice:
            context.status === "outside_corridor"
              ? "El pin está a más de 500 m del eje PE-22 disponible. Envía el pin del incidente sobre la vía; aún no se publicó."
              : undefined,
        };
      return { draft: { ...draft, location: context.location } };
    } catch (error) {
      logger.warn({
        requestId,
        operation: "report.locate",
        provider: "supabase",
        result: "fallback",
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      return {
        draft: { ...draft, location: null },
        notice: "La ubicación no está disponible ahora; no se publicó el reporte. Intenta compartir el pin más tarde.",
      };
    }
  }
  return {
    async route(message, requestId) {
      const senderKey = phoneKey(message.from, deps.pepper) ?? keyedDigest(message.from, deps.pepper, "zavu-contact-v1");
      const eventKey = createHash("sha256").update(`zavu:${message.messageId}`).digest("hex");
      let published = false;
      const result = await deps.repository.run(senderKey, async (session) => {
        const replay = await session.replay(eventKey);
        if (replay) return replay;
        const nowMs = deps.now();
        const now = new Date(nowMs).toISOString();
        let draft = await session.readDraft();
        const expired = draft !== null && Date.parse(draft.expiresAt) <= nowMs;
        if (expired) draft = null;
        const save = (result: ReportRouting, next = draft) => session.commit({ eventKey, nextDraft: next, now, reply: () => result });
        const text = normalize(message.text);
        // Query commands bypass extraction and preserve the active report. Pins only become
        // report locations while a draft is active; otherwise they retain exposure-query behavior.
        if (message.messageType === "text" && parseCommand(message.text)) return save({ kind: "unhandled" });
        if (!["text", "location"].includes(message.messageType)) return save({ kind: "unhandled" });
        if (message.messageType === "text" && ["CANCELAR", "CANCEL"].includes(text))
          return save(reply("Borrador descartado. No se publicó un reporte nuevo."), null);
        if (message.messageType === "text" && /^CONFIRMAR(?:\s|$)/.test(text)) {
          if (!draft)
            return save(
              reply(expired ? "El borrador expiró después de 30 minutos. Envía un reporte nuevo; no se publicó este mensaje." : NO_DRAFT),
              null,
            );
          if (text !== `CONFIRMAR ${draft.confirmationCode}`)
            return save(reply(`El código no corresponde al borrador actual. ${draftPrompt(draft)}`));
          if (!draft.location || !draft.extraction.type || draft.extraction.stillActive !== true) return save(reply(draftPrompt(draft)));
          const confirmed = draft;
          return session.commit({
            eventKey,
            nextDraft: null,
            publication: confirmed,
            now,
            reply: (publication) => {
              if (!publication) throw new Error("Publication result missing");
              published = true;
              return reply(publicationReply(publication, confirmed, deps.publicUrl));
            },
          });
        }
        if (message.messageType === "location") {
          if (!draft)
            return save(
              expired ? reply("El reporte anterior expiró. Envía un reporte nuevo antes de compartir su pin.") : { kind: "unhandled" },
              null,
            );
          const pin = message.content;
          if (pin?.latitude === undefined || pin.longitude === undefined)
            return save(reply("Comparte una ubicación de WhatsApp con latitud y longitud."));
          const located = await locate(
            { ...draft, confirmationCode: newId().replaceAll("-", "").slice(0, 8).toUpperCase() },
            { kind: "pin", latitude: pin.latitude, longitude: pin.longitude },
            requestId,
          );
          return save(reply(located.notice ?? draftPrompt(located.draft)), located.draft);
        }
        if (!message.text.trim()) return save({ kind: "unhandled" });
        if (
          !(await deps.limiter.consume(
            keyedDigest(senderKey, deps.pepper, "report-rate"),
            REPORT_MESSAGE_LIMIT,
            REPORT_RATE_WINDOW_MS,
            nowMs,
          ))
        )
          return save(
            reply("Llegaste al límite de mensajes de reporte. Espera 15 minutos antes de continuar. No se publicó este mensaje."),
          );
        const explicit = /^(REPORTE|REPORTAR)(\s|$)/.test(text);
        if (explicit) draft = null;
        if (!explicit) {
          const intent = (await deps.intentParser?.parse(message.text, requestId)) ?? null;
          if ((!draft && intent?.kind !== "report") || (intent && !["report", "help"].includes(intent.kind)))
            return save({ kind: "intent", intent });
        }
        if (!deps.extractor)
          return save(reply("El registro de reportes no está disponible ahora. No se publicó tu mensaje. Intenta más tarde."));
        const raw = draft ? `${draft.rawText}\n${message.text}` : message.text;
        if (raw.length > 12000)
          return save(
            reply(
              "El borrador es demasiado largo. Escribe CANCELAR y luego REPORTE con una descripción breve; no se publicó este mensaje.",
            ),
          );
        const extracted = await deps.extractor.extract(message.text, requestId);
        if (!extracted) return save(reply(EXTRACTION_FAILED));
        const isTest =
          (draft?.isTest ?? false) || /^(REPORTE|REPORTAR)\s+(?:DE\s+)?PRUEBA\b/.test(text) || deps.testPhoneKeys.includes(senderKey);
        if (draft?.extraction.type && extracted.type && draft.extraction.type !== extracted.type)
          return save(
            reply("Hay un borrador de otro tipo de incidente. Usa REPORTE para iniciar uno nuevo, o CANCELAR para descartar el anterior."),
          );
        const extraction = draft ? mergeExtraction(draft.extraction, extracted) : extracted;
        if (extraction.stillActive === false)
          return save(
            reply(
              "Recibimos que el hecho ya no está activo o es histórico. Este flujo no reabre vías ni confirma despejes; no se publicará un incidente activo. Para otro hecho, envía un nuevo REPORTE.",
            ),
            null,
          );
        let next = reportDraftSchema.parse({
          id: draft?.id ?? newId(),
          confirmationCode: newId().replaceAll("-", "").slice(0, 8).toUpperCase(),
          sourceMessageId: draft?.sourceMessageId ?? message.messageId,
          receivedAt: draft?.receivedAt ?? now,
          expiresAt: draft?.expiresAt ?? new Date(nowMs + REPORT_DRAFT_TTL_MS).toISOString(),
          rawText: raw,
          extraction,
          location: extracted.placeText && extracted.placeText !== draft?.extraction.placeText ? null : (draft?.location ?? null),
          isTest,
          isTeam: draft?.isTeam ?? deps.teamPhoneKeys.includes(senderKey),
        });
        let notice: string | undefined;
        if (!next.location && next.extraction.placeText) {
          const located = await locate(next, { kind: "place", name: next.extraction.placeText }, requestId);
          next = located.draft;
          notice = located.notice;
        }
        return save(reply(notice ?? draftPrompt(next)), next);
      });
      // Notification work starts only after the report transaction commits.
      if (published) deps.onPublication?.(requestId);
      return result;
    },
  };
}
