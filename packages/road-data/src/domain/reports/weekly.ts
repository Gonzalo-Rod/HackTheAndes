import type { ExposureView } from "../../contracts/exposure-view.ts";
import type { WeatherCapture } from "../../contracts/catchment-weather.ts";
import { buildRainfallStretches } from "./rainfall.ts";
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
      text: `Alertas de SUTRAN por lluvias, derrumbes u otros peligros ambientales registradas en este periodo: ${input.observations.officialEnvironmentalAlerts}. El registro puede estar incompleto.`,
    },
    {
      id: "community",
      text: `Avisos de la comunidad sobre peligros ambientales: ${input.observations.communityEnvironmentalIncidents}. Aún no están confirmados y pueden repetir alertas de SUTRAN.`,
    },
    {
      id: "exposure",
      text: `Tramos que requieren mayor atención por lluvia y terreno susceptible en los próximos 3 días: ${elevatedKm.toFixed(2)} km aproximados. Esto no confirma que ocurrirá un huaico.`,
    },
    {
      id: "coverage",
      text: `Tramos sin datos suficientes o actualizados: ${kilometers.unknown.toFixed(2)} km. Sin datos no significa sin peligro.`,
    },
    {
      id: "rain",
      text: `Lluvia estimada disponible para los próximos 3 días en ${catchments.filter((c) => c.rainMmNext72h !== null).length} de ${catchments.length} zonas vinculadas al tramo. Las zonas sin datos no se consideran secas.`,
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
      rainfallStretches: buildRainfallStretches(exposure.data.segments, range, catchments),
    },
    facts,
    summaryIds: facts.map((f) => f.id),
    limitations: [
      "El registro es parcial: cero avisos no significa que no hayan ocurrido eventos. No tenemos horas de cierre verificadas.",
      "La lluvia es una estimación del modelo del tiempo, no una medición en la carretera. El modelo cubre zonas de unos 25 km; el terreno se evalúa con información regional de INGEMMET.",
      "Las zonas que pueden aportar agua a la vía se han asociado de forma aproximada. La cantidad de lluvia por sí sola no confirma un huaico.",
      "Los km son aproximados y no son los hitos oficiales de la carretera. Sin datos o con datos vencidos, el riesgo sigue siendo desconocido.",
      "El pronóstico corresponde a las fechas indicadas, no a eventos ocurridos durante la semana. Este PDF no se actualiza al abrirlo.",
      "Revisa los avisos oficiales y sigue a las autoridades. Este informe no garantiza que la vía esté segura.",
    ],
    sources: [
      ...new Set([...exposure.data.sources.sourceUrls, "https://alertasviales.sutran.gob.pe/"]),
    ],
  });
}
