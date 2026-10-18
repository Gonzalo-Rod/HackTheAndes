import type { ResearchTopic } from "@/contracts/research_christian";

export const TOPIC_LABELS: Record<ResearchTopic, string> = {
  water: "Agua",
  frost: "Heladas",
  landslides: "Huaicos y laderas",
  rain: "Lluvias",
  agriculture: "Agricultura",
  pests: "Plagas",
};

export const KIND_LABELS = {
  forecast: "Pronóstico",
  observation: "Observación",
  report: "Reporte histórico",
  scenario: "Escenario",
  surveillance: "Vigilancia",
} as const;

export const RECORD_LABELS: Record<string, { title: string; summary: string }> = {
  "senamhi-huayao-maize-frost-impact-october-2026": {
    title: "Helada y daños en maíz · Huayao",
    summary: "SENAMHI reporta daños severos en maíz por helada. No precisa el día exacto ni el área de cultivo afectada.",
  },
  "senamhi-ingenio-artichoke-frost-observation-october-2026": {
    title: "Seguimiento de alcachofa · Ingenio",
    summary: "El cultivo resistió una helada anterior sin daños reportados; el agua disponible dependía del riego.",
  },
  "senamhi-comas-potato-observation-2026-10-06-12": {
    title: "Seguimiento de papa · Comas",
    summary: "El reporte indica cultivo en buen estado y disponibilidad de agua sostenida por riego.",
  },
  "senamhi-mantaro-crop-cold-impacts-2026-10-02": {
    title: "Bajas temperaturas y cultivos · Mantaro",
    summary:
      "Reporte regional de daños por frío. Puede describir el mismo episodio que el registro de Huayao; no sumar como otro incidente.",
  },
  "indeci-frost-yauli-junin-2026-06-11": {
    title: "Helada reportada · Yauli",
    summary: "Reporte de junio sobre efectos en la salud. No es un aviso vigente ni una confirmación de daño agrícola.",
  },
  "senasa-junin-fruit-fly-trap-network-reference": {
    title: "Vigilancia de mosca de la fruta · Junín",
    summary: "Referencia a una red de trampeo. La fecha original no está verificada: no es un conteo actual ni un brote confirmado.",
  },
  "cenepred-summer-2027-risk-context-lima-junin": {
    title: "Zonas críticas · contexto para verano 2027",
    summary: "Inventario y escenario de CENEPRED/INGEMMET. Los totales regionales no identifican incidentes ni tramos afectados de PE-22.",
  },
  "indeci-quebradas-191-2026-local-coverage-unresolved": {
    title: "Posible activación de quebradas · aviso 191",
    summary: "Aviso de corto plazo. La cobertura del corredor no fue verificada; no confirma que haya ocurrido un huaico.",
  },
  "indeci-surco-forest-fire-agricultural-loss-2026-09-30": {
    title: "Impacto agrícola por incendio · Ayas, Surco",
    summary: "INDECI registra daños agrícolas en un incendio extinguido y con reporte cerrado. No demuestra un corte de PE-22.",
  },
  "senamhi-warning-422-central-andes-2026-10-18-19": {
    title: "Aviso 422 · Lluvias en la sierra central",
    summary:
      "Pronóstico de lluvia, granizo y nieve en altura para el 18–19 de octubre. Incluye provincias del corredor; la intersección con la vía no está verificada.",
  },
  "cenepred-summer-2027-risk-context-update-2026-10-07": {
    title: "Exposición por lluvias · verano 2027",
    summary:
      "Escenario nacional de enero–marzo de 2027. Las cifras de exposición no representan personas afectadas ni emergencias actuales.",
  },
  "cenepred-water-deficit-risk-context-2026-2027-september": {
    title: "Déficit hídrico · escenario 2026–2027",
    summary: "Escenario estacional nacional. Clasifica riesgo de déficit de agua; no prueba una escasez observada en una mina o distrito.",
  },
};

export const FIELD_LABELS: Record<string, string> = {
  rainfallMm: "Lluvia (mm)",
  rainyDays: "Días con lluvia",
  monthlyAnomalyPct: "Anomalía mensual (%)",
  periodMeanM3s: "Caudal medio (m³/s)",
  anomalyPct: "Anomalía (%)",
  classification: "Clasificación de la fuente",
  tmaxC: "Temperatura máxima (°C)",
  tminC: "Temperatura mínima (°C)",
  reportedFrostMinimumC: "Mínima durante helada (°C)",
  consecutiveDaysNearZero: "Días consecutivos próximos a 0 °C",
  reportedTrapCount: "Trampas del reporte sin fecha",
  agriculturalAreaAffectedHa: "Cultivos afectados (ha)",
  naturalCoverDestroyedHa: "Cobertura natural destruida (ha)",
  veryHighRiskDistricts: "Distritos en riesgo muy alto (nacional)",
  population: "Población expuesta (nacional)",
  homes: "Viviendas expuestas (nacional)",
  agriculturalAreaHa: "Área agrícola expuesta (ha, nacional)",
  pastureAreaHa: "Pastos expuestos (ha, nacional)",
  residents: "Población expuesta (nacional)",
  roadNetworkKm: "Red vial expuesta (km, nacional)",
};
