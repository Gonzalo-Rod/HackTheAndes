import { describe, expect, it } from "vitest";
import { composeRouteWatchCall } from "./call-script";
import { prioritizeRouteIncidents, type RouteIncident } from "./prioritize";

const NOW = Date.parse("2026-10-18T05:00:00Z");
const trip = {
  id: "t",
  originKm: 10,
  destinationKm: 170,
  departAt: new Date(NOW - 3_600_000).toISOString(),
  avgSpeedKmh: 40,
  isTest: true,
};
const base: RouteIncident = {
  key: "k",
  source: "official",
  type: "huaico",
  roadStatus: "interrumpido",
  startKm: 75,
  endKm: 75,
  observedAt: new Date(NOW - 2 * 3_600_000).toISOString(),
  corroborated: true,
  isTest: false,
};
function first<T>(items: readonly T[]): T {
  const [item] = items;
  if (item === undefined) throw new Error("Expected a ranked incident");
  return item;
}
const context = { routeLabel: "desde Huachipa hasta La Oroya", location: "cerca del puente MATUCANA", nowMs: NOW };

describe("composeRouteWatchCall", () => {
  it("names the source, distance, time to reach it, status and report age", () => {
    const item = first(prioritizeRouteIncidents(trip, [base], NOW));
    const { spokenText, followUpText } = composeRouteWatchCall(item, context);
    expect(spokenText).toBe(
      "Hola, te llama PeruRoad Clima. Alerta para tu ruta desde Huachipa hasta La Oroya. Se reportó un huaico según SUTRAN, a unos 25 kilómetros por delante del camión, unos 38 minutos de viaje, cerca del puente MATUCANA. La vía figura interrumpida. Último reporte hace 2 horas. La posición del camión es estimada por la hora de salida y la velocidad promedio. Te enviamos el detalle por WhatsApp.",
    );
    expect(followUpText).toContain("Distancia estimada desde el camión: 25.0 km (~38 min).");
    expect(followUpText).toContain("no confirma que el resto de la ruta esté libre");
  });

  it("announces demonstrations as tests", () => {
    const item = first(
      prioritizeRouteIncidents(
        trip,
        [{ ...base, source: "community", isTest: true, observedAt: new Date(NOW - 5 * 60_000).toISOString() }],
        NOW,
      ),
    );
    const { spokenText, followUpText } = composeRouteWatchCall(item, context);
    expect(spokenText.startsWith("Esto es una prueba.")).toBe(true);
    expect(spokenText).toContain("en un reporte simulado de prueba");
    expect(spokenText).toContain("hace 5 minutos");
    expect(followUpText.startsWith("PRUEBA · ")).toBe(true);
  });

  it("describes incidents beyond the destination and at the truck's position", () => {
    const beyond = first(prioritizeRouteIncidents(trip, [{ ...base, startKm: 173, endKm: 173 }], NOW));
    expect(composeRouteWatchCall(beyond, context).spokenText).toContain("poco después del destino de la ruta");
    const here = first(prioritizeRouteIncidents(trip, [{ ...base, startKm: 49, endKm: 51 }], NOW));
    expect(composeRouteWatchCall(here, context).spokenText).toContain("en el tramo donde estimamos que está el camión");
  });
});
