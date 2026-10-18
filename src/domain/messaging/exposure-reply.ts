import type { ExposureLayer } from "@/contracts/exposure";

const CATEGORY_LABELS = {
  routine: "sin señal elevada bajo estas reglas",
  watch: "vigilancia",
  priority: "atención prioritaria",
  high_attention: "atención alta",
};
function limaTime(timestamp: string): string {
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp));
}
export function formatExposureReply(view: ExposureLayer, publicUrl: string, segmentId?: string): string {
  const mapUrl = new URL(publicUrl);
  mapUrl.searchParams.set("vista", "pronostico");
  const ageMinutes = Math.ceil(view.meta.ageSeconds / 60);
  const header = `Exposición climática estimada PE-22 (24 h). Datos: ${limaTime(view.data.sources.weatherCapturedAt)} (Lima), hace ${ageMinutes} min.`;
  const footer = `Criterios experimentales, no probabilidad de huaico ni confirmación de cierre o vía segura. Lluvia de modelo (~25 km) y susceptibilidad INGEMMET; enlaces a cuencas de baja confianza. Mapa: ${mapUrl.toString()}`;
  if (view.meta.state !== "ready" || !view.meta.operationallyUsable)
    return `${header}\nEvaluación no disponible o desactualizada. No se puede inferir riesgo bajo.\n${footer}`;
  if (segmentId) {
    const segment = view.data.segments.find((item) => item.segmentId === segmentId);
    const window = segment?.windows.next24h;
    if (!segment || !window || window.state !== "assessed" || window.category === null || !window.forecastRain.ok)
      return `${header}\nTramo ${segmentId}: sin evaluación utilizable; cobertura insuficiente.\n${footer}`;
    const catchments = view.data.catchments.filter((item) => segment.catchmentIds.includes(item.catchmentId));
    const susceptibility = Math.round(Math.max(...catchments.map((item) => item.highSusceptibilityFraction)) * 100);
    return `${header}\nUbicación aproximada: tramo ${segmentId}. Confirma que corresponde a tu recorrido.\nAtención estimada: ${CATEGORY_LABELS[window.category]}. Lluvia: hasta ${window.forecastRain.precipitationMm.toFixed(1)} mm (máximo entre cuencas enlazadas), ${limaTime(window.validFrom)} a ${limaTime(window.validUntil)} (Lima). Hasta ${susceptibility}% de superficie con susceptibilidad alta/muy alta en una cuenca enlazada.\n${footer}`;
  }
  const assessed = view.data.segments.filter((item) => item.windows.next24h.category !== null);
  const counts = Object.entries(CATEGORY_LABELS)
    .map(([category, label]) => `${label}: ${assessed.filter((item) => item.windows.next24h.category === category).length}`)
    .join("; ");
  return `${header}\n${assessed.length}/${view.data.segments.length} tramos evaluados; ${view.data.segments.length - assessed.length} sin evaluación. ${counts}. Comparte un pin para consultar tu tramo.\n${footer}`;
}
