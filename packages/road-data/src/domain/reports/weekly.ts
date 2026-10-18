import type { ExposureView } from "../../contracts/exposure-view.ts";
import type { WeatherCapture } from "../../contracts/catchment-weather.ts";
import { aggregateRain } from "../weather/aggregate.ts";
import {
  environmentalReportSchema,
  type ReportPeriod,
  type ReportRange,
} from "../../contracts/weekly-report.ts";
const HOUR_MS = 3_600_000;
const WEEK_MS = 7 * 24 * HOUR_MS;
/** Lima is UTC-05 year-round; the scheduled reporting boundary is Monday 07:00 (12:00 UTC). */
export function weeklyPeriod(nowMs: number, demo = false): ReportPeriod {
  const hour = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
  const end = new Date(hour);
  if (!demo) {
    end.setUTCHours(12, 0, 0, 0);
    end.setUTCDate(end.getUTCDate() - ((end.getUTCDay() + 6) % 7));
    if (end.getTime() > nowMs) end.setUTCDate(end.getUTCDate() - 7);
  }
  return {
    start: new Date(end.getTime() - WEEK_MS).toISOString(),
    end: end.toISOString(),
    key: `${demo ? "demo" : "weekly"}:${end.toISOString()}`,
  };
}
export function buildEnvironmentalReport(input: {
  nowMs: number;
  period: ReportPeriod;
  range: ReportRange;
  isDemo: boolean;
  exposure: ExposureView;
  weather: WeatherCapture;
  observations: {
    firstRecordedAt: string | null;
    officialEnvironmentalAlerts: number;
    communityEnvironmentalIncidents: number;
  };
}) {
  const { exposure, period, range } = input;
  if (
    range.geometryRevision !== exposure.data.geometryRevision ||
    range.geometryRevision !== input.weather.geometryRevision
  )
    throw new Error("Weekly report geometry mismatch");
  const kilometers = { routine: 0, watch: 0, priority: 0, high_attention: 0, unknown: 0 };
  const linkedIds = new Set<string>();
  for (const segment of exposure.data.segments) {
    const length = Math.max(
      0,
      Math.min(range.endKm, segment.distanceFromOriginEndKm) -
        Math.max(range.startKm, segment.distanceFromOriginStartKm),
    );
    if (!length) continue;
    const category = exposure.meta.operationallyUsable ? segment.windows.next72h.category : null;
    kilometers[category ?? "unknown"] += length;
    segment.catchmentIds.forEach((id) => linkedIds.add(id));
  }
  // Round only after summing clipped geometry distances, preserving fractional endpoints.
  for (const key of Object.keys(kilometers) as (keyof typeof kilometers)[])
    kilometers[key] = Math.round(kilometers[key] * 100) / 100;
  const catchments = exposure.data.catchments
    .filter((c) => linkedIds.has(c.catchmentId))
    .map((c) => {
      const rain = aggregateRain(
        input.weather,
        c.catchmentId,
        "precipitation",
        Date.parse(period.start),
        Date.parse(period.end),
      );
      const forecast = c.windows.next72h.forecastRain;
      return {
        id: c.catchmentId,
        rainMmPeriod: rain.ok ? rain.precipitationMm : null,
        rainMmNext72h:
          exposure.meta.operationallyUsable && forecast.ok ? forecast.precipitationMm : null,
      };
    });
  const elevatedKm = kilometers.priority + kilometers.high_attention;
  const facts = [
    {
      id: "official",
      text: `Alertas ambientales SUTRAN incorporadas al archivo en el periodo: ${input.observations.officialEnvironmentalAlerts}. No equivale al total de eventos ocurridos.`,
    },
    {
      id: "community",
      text: `Incidentes ambientales comunitarios registrados: ${input.observations.communityEnvironmentalIncidents}. Son reportes no confirmados; no se suman a SUTRAN como eventos únicos.`,
    },
    {
      id: "exposure",
      text: `Exposición climática estimada de atención prioritaria o alta en las próximas 72 h: ${elevatedKm.toFixed(2)} km del eje mapeado. No predice que ocurrirá un huaico.`,
    },
    {
      id: "coverage",
      text: `Tramo sin evaluación suficiente o vigente: ${kilometers.unknown.toFixed(2)} km. Sin datos no significa sin peligro.`,
    },
    {
      id: "rain",
      text: `Cuencas asociadas al tramo: ${catchments.length}; con lluvia modelada completa para el periodo: ${catchments.filter((c) => c.rainMmPeriod !== null).length}.`,
    },
  ];
  return environmentalReportSchema.parse({
    schemaVersion: 1,
    generatedAt: new Date(input.nowMs).toISOString(),
    period,
    range,
    isDemo: input.isDemo,
    observations: {
      ...input.observations,
      source: "first_observed_in_our_archive_not_event_onset",
      closureHours: null,
    },
    outlook: {
      assessmentId: exposure.data.assessmentId,
      policyVersion: exposure.data.policy.version,
      capturedAt: exposure.data.sources.weatherCapturedAt,
      validFrom: exposure.data.anchorAt,
      validUntil: exposure.data.segments[0]?.windows.next72h.validUntil ?? exposure.data.anchorAt,
      state: exposure.meta.state,
      kilometers,
      catchments,
    },
    facts,
    summaryIds: facts.map((f) => f.id),
    limitations: [
      "Cobertura del archivo parcial: el primer registro no demuestra vigilancia continua. Cero registros no acredita ausencia de eventos.",
      "Las horas de cierre no están verificadas; no se calculan con fechas de vigencia ni con ausencia de alertas.",
      "Lluvia modelada IFS, resolución aproximada de 25 km; no son mediciones de pluviómetros. Cuencas aproximadas y susceptibilidad regional INGEMMET.",
      "Km medidos sobre la geometría disponible; no son hitos oficiales. Los tramos sin asociación o con datos vencidos permanecen desconocidos.",
      "Las cifras de exposición describen el pronóstico capturado al generar el informe, no eventos ocurridos durante la semana. Este PDF no se actualiza automáticamente.",
      "No certifica vía segura ni sustituye avisos oficiales o instrucciones de las autoridades.",
    ],
    sources: [
      ...new Set([...exposure.data.sources.sourceUrls, "https://alertasviales.sutran.gob.pe/"]),
    ],
  });
}
