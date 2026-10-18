import type { EvidenceFeature } from "@/contracts/research-input_christian";
import type { EnvironmentalRecord, ResearchTopic } from "@/contracts/research_christian";

import { FIELD_LABELS, RECORD_LABELS } from "./evidence-labels_christian";

type Kind = EnvironmentalRecord["kind"];
const TYPES: Record<string, { label: string; kind: Kind; topics: ResearchTopic[]; summary: string }> = {
  critical_zone_under_notice: {
    label: "Zona crítica bajo aviso",
    kind: "inventory",
    topics: ["landslides", "rain"],
    summary:
      "Punto del inventario de zonas críticas de INGEMMET asociado al aviso SENAMHI 421; no es un pronóstico puntual ni un incidente confirmado.",
  },
  official_precipitation_warning_area: {
    label: "Área oficial de lluvias",
    kind: "forecast",
    topics: ["rain", "water"],
    summary: "Área de pronóstico oficial; no demuestra daño ni cierre vial.",
  },
  official_cold_warning_area: {
    label: "Área oficial de frío nocturno",
    kind: "forecast",
    topics: ["frost", "agriculture"],
    summary: "Área oficial de frío previsto; no demuestra daños por heladas.",
  },
  measured_hydrology: {
    label: "Caudal registrado",
    kind: "observation",
    topics: ["water"],
    summary: "Registro de estación del período indicado; no es una lectura en vivo ni una alerta de desborde.",
  },
  measured_rainfall: {
    label: "Lluvia registrada",
    kind: "observation",
    topics: ["rain", "water"],
    summary: "Precipitación medida en una estación. No representa lluvia medida sobre un tramo de carretera.",
  },
  crop_weather_observation: {
    label: "Seguimiento agroclimático",
    kind: "observation",
    topics: ["agriculture"],
    summary: "Seguimiento del cultivo durante el período indicado.",
  },
  town_weather_forecast: {
    label: "Pronóstico local",
    kind: "forecast",
    topics: ["rain"],
    summary: "Pronóstico para la localidad; no es una observación ni un reporte de daño.",
  },
  reported_frost_event: {
    label: "Helada reportada",
    kind: "report",
    topics: ["frost"],
    summary: "Reporte histórico de helada; no es un aviso vigente.",
  },
  agriculture_impact_report: {
    label: "Impacto agrícola",
    kind: "report",
    topics: ["agriculture", "frost"],
    summary: "Reporte regional de impactos en cultivos.",
  },
  pest_surveillance_reference: {
    label: "Vigilancia de plagas",
    kind: "surveillance",
    topics: ["pests", "agriculture"],
    summary: "Vigilancia fitosanitaria; no confirma un brote.",
  },
  seasonal_risk_context: {
    label: "Zonas críticas",
    kind: "scenario",
    topics: ["landslides", "rain"],
    summary: "Contexto estacional de riesgo; no es una emergencia actual.",
  },
  seasonal_risk_exposure_context: {
    label: "Exposición por lluvias",
    kind: "scenario",
    topics: ["landslides", "rain", "agriculture"],
    summary: "Escenario nacional de exposición, sin atribución a un tramo de carretera.",
  },
  seasonal_water_deficit_risk_context: {
    label: "Déficit hídrico",
    kind: "scenario",
    topics: ["water", "agriculture"],
    summary: "Escenario estacional de riesgo; no prueba escasez observada.",
  },
  short_term_hazard_notice: {
    label: "Posible activación de quebradas",
    kind: "forecast",
    topics: ["landslides", "rain"],
    summary: "Aviso de corto plazo con cobertura local sin verificar.",
  },
  agriculture_impact_event: {
    label: "Impacto agrícola reportado",
    kind: "report",
    topics: ["agriculture"],
    summary: "Impacto de un evento histórico con reporte cerrado.",
  },
  precipitation_forecast_notice: {
    label: "Aviso de lluvias",
    kind: "forecast",
    topics: ["rain"],
    summary: "Pronóstico oficial; no confirma una afectación de la vía.",
  },
};

function textField(fields: Record<string, unknown> | undefined, key: string): string | null {
  return typeof fields?.[key] === "string" ? fields[key] : null;
}

function locationLabel(properties: EvidenceFeature["properties"]): string {
  const station = textField(properties.station, "name");
  if (station) return station;
  if (typeof properties.location === "string") return properties.location;
  if (properties.location) {
    const names = properties.location.namedProvinces;
    if (Array.isArray(names)) return names.filter((name): name is string => typeof name === "string").join(" · ");
    const parts = ["annex", "name", "area", "district", "province", "department"].map((key) =>
      textField(properties.location as Record<string, unknown>, key),
    );
    const label = [...new Set(parts.filter((part): part is string => Boolean(part)))].join(" · ");
    if (label) return label;
  }
  return properties.scope?.level === "national" || properties.recordType.includes("seasonal")
    ? "Perú · contexto nacional"
    : "Cobertura local sin verificar";
}

function factsFrom(fields: Record<string, unknown> | undefined): EnvironmentalRecord["facts"] {
  if (!fields) return [];
  return Object.entries(FIELD_LABELS).flatMap(([key, label]) => {
    const value = fields[key];
    if (typeof value === "number") return [{ label, value: new Intl.NumberFormat("es-PE", { maximumFractionDigits: 3 }).format(value) }];
    return typeof value === "string" ? [{ label, value }] : [];
  });
}

function nationalFacts(properties: EvidenceFeature["properties"]): EnvironmentalRecord["facts"] {
  const facts = [...factsFrom(properties.scope), ...factsFrom(properties.nationalExposureInVeryHighRiskDistricts)];
  const movements = properties.massMovementScenario;
  if (typeof movements?.veryHighRiskDistricts === "number") {
    facts.push({
      label: "Distritos en riesgo muy alto por movimientos en masa (nacional)",
      value: String(movements.veryHighRiskDistricts),
    });
  }
  if (typeof movements?.populationInVeryHighRiskDistricts === "number") {
    facts.push({
      label: "Población de esos distritos (nacional)",
      value: movements.populationInVeryHighRiskDistricts.toLocaleString("es-PE"),
    });
  }
  return facts;
}

function additionalFacts(p: EvidenceFeature["properties"]): EnvironmentalRecord["facts"] {
  const facts: EnvironmentalRecord["facts"] = [];
  if (typeof p.station?.altitudeM === "number") facts.push({ label: "Altitud de la estación (m)", value: String(p.station.altitudeM) });
  const crop = textField(p.crop, "name");
  if (crop)
    facts.push({
      label: "Cultivo",
      value: ({ maize: "Maíz", artichoke: "Alcachofa", potato: "Papa" } as Record<string, string>)[crop] ?? crop,
    });
  const rainfall = p.values?.forecastRainfallMmPerDay;
  if (rainfall && typeof rainfall === "object" && !Array.isArray(rainfall)) {
    for (const [date, value] of Object.entries(rainfall))
      if (typeof value === "string")
        facts.push({
          label: `Lluvia prevista ${date} (mm/día)`,
          value: value.replace("central and southern Andes", "sierra central y sur").replace("central Andes", "sierra central"),
        });
  }
  if (p.severity)
    facts.push({
      label: "Nivel del aviso",
      value: ({ yellow: "Amarillo", orange: "Naranja", red: "Rojo" } as Record<string, string>)[p.severity] ?? p.severity,
    });
  const counts = p.aggregatedCounts?.massMovementCriticalZones;
  if (counts && typeof counts === "object" && !Array.isArray(counts)) {
    for (const [area, value] of Object.entries(counts))
      if (typeof value === "number")
        facts.push({
          label: `Zonas críticas inventariadas · ${area === "national" ? "Perú" : area}`,
          value: value.toLocaleString("es-PE"),
        });
  }
  const departments = p.scope?.targetDepartmentCounts;
  if (departments && typeof departments === "object" && !Array.isArray(departments)) {
    for (const [area, value] of Object.entries(departments))
      if (typeof value === "number") facts.push({ label: `Distritos con riesgo muy alto · ${area}`, value: String(value) });
  }
  return facts;
}

export function normalizeEvidence(feature: EvidenceFeature): EnvironmentalRecord | null {
  const p = feature.properties;
  const type = TYPES[p.recordType];
  if (!type) return null;
  const location = locationLabel(p);
  const labels = RECORD_LABELS[feature.id];
  const period = p.validity ?? p.observationPeriod ?? p.forecastPeriod;
  const dates = p.validDates?.slice().sort();
  const startsAt = period?.start ?? dates?.[0] ?? p.eventDate ?? p.occurrence?.date ?? null;
  const endsAt = period?.end ?? dates?.[dates.length - 1] ?? startsAt;
  const topics = [...type.topics];
  if (feature.id.includes("frost")) topics.push("frost");
  if (p.forecastDays?.some((day) => day.tminC !== null && day.tminC < 0)) topics.push("frost");
  const caveats = [
    feature.geometry
      ? feature.geometry.type === "Point"
        ? "Punto publicado de referencia; no representa la extensión de un evento ni un tramo afectado."
        : "Polígono oficial del pronóstico; no es una delimitación de daños ocurridos."
      : "Sin geometría verificada. Este registro se presenta como contexto, sin un pin en el mapa.",
    type.kind === "forecast"
      ? "Es un pronóstico: no confirma lluvia ocurrida, huaico ni interrupción de tránsito."
      : type.kind === "inventory"
        ? "Punto del inventario oficial de zonas críticas asociado a un aviso meteorológico. El punto no es un pronóstico ni confirma que el peligro se haya activado; el aviso se muestra por separado como polígono SENAMHI."
        : type.kind === "scenario"
          ? "Es un escenario de riesgo, no una emergencia actual. Los totales nacionales no se atribuyen al corredor."
          : type.kind === "surveillance"
            ? "Vigilancia no equivale a detección. No se verificó un brote local con fecha."
            : "Describe el período del reporte; no demuestra el estado actual de una vía.",
  ];
  if (p.coordinatePrecision?.includes("0.1 degree"))
    caveats.push("Coordenadas de estación redondeadas a 0,1° (aproximadamente 5,5 km por eje). Ubicación aproximada.");
  if (!feature.geometry && type.kind === "forecast") caveats.push("No se verificó la intersección de un polígono de aviso con PE-22.");

  return {
    id: feature.id,
    title: p.title ?? labels?.title ?? `${type.label} · ${location}`,
    summary: p.summary ?? labels?.summary ?? type.summary,
    location,
    topics: [...new Set(topics)],
    kind: type.kind,
    provider: p.provider,
    sourceUrl: p.sourceUrl,
    sourceStatus: p.status,
    recordType: p.recordType,
    coordinates: feature.geometry?.type === "Point" ? feature.geometry.coordinates : null,
    geometry: feature.geometry,
    geometrySourceUrl: p.geometrySourceUrl ?? p.coordinateSourceUrl ?? textField(p.station, "coordinateSourceUrl"),
    coordinatePrecision: p.coordinatePrecision ?? null,
    issuedAt: p.issueDate ?? p.publicationDate ?? null,
    startsAt,
    endsAt,
    periodLabel: p.scenarioPeriod ?? (p.publicationMonth ? `Publicación: ${p.publicationMonth}` : null),
    facts: [...factsFrom(p.values), ...nationalFacts(p), ...additionalFacts(p)],
    forecasts: p.forecastDays ?? [],
    caveats: [...caveats, ...p.limitations],
  };
}
