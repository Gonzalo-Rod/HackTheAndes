import { exposureViewSchema, type ExposureView } from "../../contracts/exposure-view.ts";
import { type ExposureWindow, type ExposureAssessment } from "../../contracts/exposure.ts";
export function createExposureView(
  assessment: ExposureAssessment,
  nowMs: number,
  storage: "database" | "snapshot",
  selectedHorizonHours: 24 | 72 = 24,
): ExposureView {
  if (!Number.isFinite(nowMs)) throw new Error("Invalid exposure read time");
  const ageMs = nowMs - Date.parse(assessment.sources.weatherCapturedAt);
  const future = ageMs < 0 || Date.parse(assessment.assessedAt) > nowMs;
  const stale = ageMs >= assessment.policy.weatherMaxAgeMs;
  const mask = (window: ExposureWindow): ExposureWindow => {
    const reason = future
      ? "future_source"
      : stale
        ? "stale_weather"
        : Date.parse(window.validUntil) <= nowMs
          ? "expired_window"
          : null;
    return reason ? { ...window, state: "unknown", category: null, reasons: [reason] } : window;
  };
  const project = <T extends { windows: ExposureAssessment["catchments"][number]["windows"] }>(
    row: T,
  ): T => ({
    ...row,
    windows: {
      next24h: mask(row.windows.next24h),
      next72h: mask(row.windows.next72h),
      sixHourly: row.windows.sixHourly.map(mask),
    },
  });
  const data = {
    ...assessment,
    catchments: assessment.catchments.map(project),
    segments: assessment.segments.map(project),
  };
  const selected = (row: (typeof data.catchments)[number]) =>
    selectedHorizonHours === 24 ? row.windows.next24h : row.windows.next72h;
  const operationallyUsable =
    !future && !stale && data.catchments.some((c) => selected(c).state === "assessed");
  const state = future
    ? "unavailable"
    : stale
      ? "stale"
      : operationallyUsable
        ? "ready"
        : "unavailable";
  return exposureViewSchema.parse({
    data,
    meta: {
      state,
      storage,
      servedAt: new Date(nowMs).toISOString(),
      ageSeconds: Math.max(0, ageMs / 1000),
      selectedHorizonHours,
      operationallyUsable,
      automatedAlertUse: false,
      message:
        state === "ready"
          ? "Exposición climática estimada; cobertura parcial y reglas experimentales. No certifica una ruta segura."
          : state === "stale"
            ? `Datos de lluvia del ${assessment.sources.weatherCapturedAt}; evaluación vencida, sin categoría vigente.`
            : "Evaluación no disponible con los datos actuales; no implica exposición baja ni vía libre.",
    },
  });
}
