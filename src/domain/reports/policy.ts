import type { ReportDraft, ReportExtraction, ReportPublication } from "@/contracts/reports";

/** Team Plan F1: same incident type within 2 km and 3 hours. */
export const REPORT_DEDUPE_DISTANCE_M = 2000;
export const REPORT_DEDUPE_WINDOW_MS = 3 * 60 * 60_000;
/** An explicit confirmation expires after 30 min; this is a conversational UX policy. */
export const REPORT_DRAFT_TTL_MS = 30 * 60_000;
/** Bound signed report/conversation intake per sender to control write and LLM costs. */
export const REPORT_MESSAGE_LIMIT = 30;
export const REPORT_RATE_WINDOW_MS = 15 * 60_000;
/** Unverified evidence remains at a conservative placeholder score pending B's full confidence policy. */
export const UNCONFIRMED_REPORT_CONFIDENCE = 0.2;
export function normalizeExtraction(text: string, value: ReportExtraction): ReportExtraction {
  return {
    ...value,
    placeText: value.placeText && text.toLocaleLowerCase("es").includes(value.placeText.toLocaleLowerCase("es")) ? value.placeText : null,
  };
}
export function mergeExtraction(previous: ReportExtraction, current: ReportExtraction): ReportExtraction {
  return Object.fromEntries(
    Object.entries(previous).map(([key, value]) => [key, current[key as keyof ReportExtraction] ?? value]),
  ) as ReportExtraction;
}
export function draftPrompt(draft: ReportDraft): string {
  if (!draft.extraction.type)
    return "¿Qué ocurre: huaico, derrumbe, inundación u otro incidente? Describe lo que estás observando. Aún no se publicó el reporte.";
  if (draft.extraction.stillActive !== true)
    return "¿El incidente sigue activo ahora? Responde con una frase, por ejemplo: ‘El derrumbe sigue activo’. Aún no se publicó el reporte.";
  if (!draft.location)
    return "Comparte un pin de WhatsApp del lugar del incidente sobre PE-22. No puedo verificar el lugar solo con una referencia de kilómetro. Aún no se publicó el reporte.";
  const [longitude, latitude] = draft.location.snappedPosition;
  const pinUrl = `https://www.openstreetmap.org/?mlat=${latitude.toFixed(5)}&mlon=${longitude.toFixed(5)}#map=16/${latitude.toFixed(5)}/${longitude.toFixed(5)}`;
  return `${draft.isTest ? "PRUEBA · " : ""}Reporte de ${draft.extraction.type} en PE-22. Revisa el pin aproximado: ${pinUrl}\nConfirma que corresponde al incidente, sigue activo y autorizas publicar esta ubicación como reporte comunitario NO CONFIRMADO. Responde CONFIRMAR ${draft.confirmationCode}, o CANCELAR. No se mostrará tu identidad.`;
}
export function publicationReply(publication: ReportPublication, draft: ReportDraft, publicUrl: string): string {
  return `${draft.isTest ? "PRUEBA · " : ""}Gracias. ${publication.merged ? "Vinculamos tu reporte a un incidente comunitario existente" : "Registramos tu reporte de " + draft.extraction.type}. Estado: NO CONFIRMADO por una autoridad; ${publication.independentReporters} reportante(s) independiente(s). No confirma un cierre oficial ni vía segura. Mapa: ${publicUrl}/?alerta=community:${publication.incidentId}`;
}
export function selectDuplicate(candidates: Array<{ id: string; distanceM: number; firstSeenAt: string }>, nowMs: number): string | null {
  return (
    candidates
      .filter(
        (item) =>
          item.distanceM <= REPORT_DEDUPE_DISTANCE_M &&
          Date.parse(item.firstSeenAt) <= nowMs &&
          nowMs - Date.parse(item.firstSeenAt) <= REPORT_DEDUPE_WINDOW_MS,
      )
      .sort((a, b) => a.distanceM - b.distanceM || a.id.localeCompare(b.id))[0]?.id ?? null
  );
}
