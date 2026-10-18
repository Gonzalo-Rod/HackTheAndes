import type { ExposureLayer } from "@/contracts/exposure";

export interface ForecastEvent {
  id: string;
  type: "possible_huaico";
  category: "priority" | "high_attention";
  validFrom: string;
  validUntil: string;
  startKm: number;
  endKm: number;
  segmentIds: string[];
  rainMm: number;
  highSusceptibilityFraction: number;
  reasons: string[];
}
export interface ForecastWindow {
  id: string;
  validFrom: string;
  validUntil: string;
  events: ForecastEvent[];
  assessedSegments: number;
  unknownSegments: number;
}
export interface ForecastProjection {
  state: "ready" | "unavailable";
  message: string;
  geometryRevision: string | null;
  capturedAt: string | null;
  windows: ForecastWindow[];
}
/** Floating point tolerance only; never bridge an unassessed road segment. */
const CONTIGUOUS_TOLERANCE_KM = 0.000001;
export function projectForecastEvents(view: ExposureLayer | null, nowMs: number, horizonHours: 24 | 72): ForecastProjection {
  const base = { geometryRevision: view?.data.geometryRevision ?? null, capturedAt: view?.data.sources.weatherCapturedAt ?? null };
  const unavailable = (message: string): ForecastProjection => ({ ...base, state: "unavailable", message, windows: [] });
  if (!view) return unavailable("Pronóstico no disponible. No implica ausencia de peligro.");
  const ageMs = nowMs - Date.parse(view.data.sources.weatherCapturedAt);
  if (
    view.meta.state !== "ready" ||
    !view.meta.operationallyUsable ||
    view.meta.storage !== "database" ||
    ageMs < 0 ||
    Date.parse(view.data.assessedAt) > nowMs ||
    ageMs >= view.data.policy.weatherMaxAgeMs
  )
    return unavailable("Evaluación desactualizada o no utilizable. No se muestran posibles eventos vigentes; no implica riesgo bajo.");
  const catchments = new Map(view.data.catchments.map((c) => [c.catchmentId, c]));
  const segments = [...view.data.segments].sort((a, b) => a.distanceFromOriginStartKm - b.distanceFromOriginStartKm);
  const horizonEndMs = Date.parse(view.data.anchorAt) + horizonHours * 3_600_000;
  const windows: ForecastWindow[] = [];
  for (let index = 0; index < 12; index++) {
    const reference = segments[0]?.windows.sixHourly[index];
    if (!reference || Date.parse(reference.validUntil) <= nowMs || Date.parse(reference.validFrom) >= horizonEndMs) continue;
    const window: ForecastWindow = {
      id: reference.validFrom,
      validFrom: reference.validFrom,
      validUntil: reference.validUntil,
      events: [],
      assessedSegments: 0,
      unknownSegments: 0,
    };
    for (const segment of segments) {
      const assessment = segment.windows.sixHourly[index];
      if (assessment.state !== "assessed" || !assessment.category || !assessment.forecastRain.ok) {
        window.unknownSegments++;
        continue;
      }
      window.assessedSegments++;
      if (assessment.category !== "priority" && assessment.category !== "high_attention") continue;
      const susceptible = Math.max(0, ...segment.catchmentIds.map((id) => catchments.get(id)?.highSusceptibilityFraction ?? 0));
      const previous = window.events.at(-1);
      if (
        previous &&
        previous.category === assessment.category &&
        Math.abs(previous.endKm - segment.distanceFromOriginStartKm) <= CONTIGUOUS_TOLERANCE_KM
      ) {
        previous.endKm = segment.distanceFromOriginEndKm;
        previous.segmentIds.push(segment.segmentId);
        previous.rainMm = Math.max(previous.rainMm, assessment.forecastRain.precipitationMm);
        previous.highSusceptibilityFraction = Math.max(previous.highSusceptibilityFraction, susceptible);
        previous.reasons = [...new Set([...previous.reasons, ...assessment.reasons])];
        continue;
      }
      window.events.push({
        id: `forecast:${reference.validFrom}:${segment.segmentId}:${assessment.category}`,
        type: "possible_huaico",
        category: assessment.category,
        validFrom: reference.validFrom,
        validUntil: reference.validUntil,
        startKm: segment.distanceFromOriginStartKm,
        endKm: segment.distanceFromOriginEndKm,
        segmentIds: [segment.segmentId],
        rainMm: assessment.forecastRain.precipitationMm,
        highSusceptibilityFraction: susceptible,
        reasons: [...assessment.reasons],
      });
    }
    windows.push(window);
  }
  if (!windows.length) return unavailable("Las ventanas del pronóstico terminaron. No implica vía libre.");
  return {
    ...base,
    state: "ready",
    message: "Condiciones previstas en ventanas de 6 h; no indican la hora de ocurrencia de un huaico.",
    windows,
  };
}
export function chooseForecastWindow(projection: ForecastProjection, selectedId: string | null): ForecastWindow | null {
  return (
    projection.windows.find((w) => w.id === selectedId) ??
    projection.windows.find((w) => w.events.length > 0) ??
    projection.windows[0] ??
    null
  );
}
const peruDate = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export function formatForecastWindow(window: Pick<ForecastWindow, "validFrom" | "validUntil">): string {
  return `${peruDate.format(new Date(window.validFrom))} – ${peruDate.format(new Date(window.validUntil))} (Perú)`;
}
