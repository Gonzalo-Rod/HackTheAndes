import { environmentalReportSchema, type EnvironmentalReport } from "@peruroad/road-data/reports";
/** Synthetic layout/test fixture, never an operational report or evidence of a real event. */
export function syntheticWeeklyReport(): EnvironmentalReport {
  return environmentalReportSchema.parse({
    schemaVersion: 1,
    generatedAt: "2026-10-18T03:00:00.000Z",
    period: { start: "2026-10-11T03:00:00.000Z", end: "2026-10-18T03:00:00.000Z", key: "synthetic:weekly" },
    range: { startKm: 0, endKm: 174, label: "DEMO sintética - PE-22 (sin eventos reales)", geometryRevision: "a".repeat(64) },
    isDemo: true,
    observations: {
      firstRecordedAt: "2026-10-17T23:00:00.000Z",
      officialEnvironmentalAlerts: 0,
      communityEnvironmentalIncidents: 0,
      source: "first_observed_in_our_archive_not_event_onset",
      closureHours: null,
    },
    outlook: {
      assessmentId: "synthetic-assessment",
      policyVersion: "climate-exposure-v1",
      capturedAt: "2026-10-18T02:50:00.000Z",
      validFrom: "2026-10-18T02:00:00.000Z",
      validUntil: "2026-10-21T02:00:00.000Z",
      state: "ready",
      kilometers: { routine: 10, watch: 8, priority: 15, high_attention: 5, unknown: 136 },
      rainfallStretches: [
        { startKm: 0, endKm: 5, rainMmPeriod: null, rainMmNext72h: 12.5 },
        { startKm: 10, endKm: 15, rainMmPeriod: 8.4, rainMmNext72h: null },
      ],
      catchments: [{ id: "synthetic-catchment-01", rainMmPeriod: null, rainMmNext72h: 12.5 }],
    },
    facts: [
      { id: "coverage", text: "Ejemplo sintético: 136.00 km sin evaluación suficiente. Sin datos no significa sin peligro." },
      { id: "exposure", text: "Ejemplo sintético: 20.00 km con atención prioritaria o alta. No predice que ocurrirá un huaico." },
      { id: "events", text: "No se representan eventos reales en esta demostración." },
    ],
    summaryIds: ["coverage", "exposure", "events"],
    limitations: [
      "Todos los valores de este documento son sintéticos y solo sirven para revisar el formato.",
      "Archivo parcial: solo se muestran las fechas disponibles. Cero registros no acredita ausencia de eventos.",
      "Lluvia modelada, resolución aproximada de 25 km; no son mediciones de pluviómetros. Cuencas aproximadas y susceptibilidad regional INGEMMET.",
      "Las horas de cierre no están verificadas y no se calculan con fechas de vigencia.",
      "Km medidos sobre la geometría disponible; no son hitos oficiales.",
      "Este PDF no se actualiza automáticamente. No certifica vía segura ni sustituye avisos oficiales.",
    ],
    sources: ["https://open-meteo.com/", "https://geocatmin.ingemmet.gob.pe/", "https://alertasviales.sutran.gob.pe/"],
  });
}
