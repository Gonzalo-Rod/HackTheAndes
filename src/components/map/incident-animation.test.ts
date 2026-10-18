import { describe, expect, it } from "vitest";

import type { AlertCause } from "@/contracts/road-alerts";

import { classifyIncidentAnimation, getIncidentAnimation } from "./incident-animation";

const alert = (cause: AlertCause, title: string, description = "", currentSituation = "") => ({
  cause,
  title,
  description,
  currentSituation,
});

describe("incident animation selection", () => {
  it("shows falling rocks for the SUTRAN rockslide example even if its cause is tagged as an accident", () => {
    expect(
      classifyIncidentAnimation(alert("accidentes", "Deslizamiento de roca en el KM 770 + 800", "Deslizamiento, caída de piedras y rocas")),
    ).toBe("rockslide");
  });

  it.each([
    ["Flujo de detritos en la quebrada", "debris-flow"],
    ["Lluvia intensa en la sierra", "rain"],
    ["Desborde de río e inundación", "flood"],
    ["Descenso de temperatura y helada", "frost"],
    ["Choque entre dos vehículos", "vehicle"],
    ["Trabajos en puente y alcantarilla", "roadworks"],
    ["Bloqueo por manifestantes", "people"],
  ] as const)("maps %s to its own scene", (title, expected) => {
    expect(classifyIncidentAnimation(alert("otro", title))).toBe(expected);
  });

  it("provides a generic scene for every cause when the alert text is nonspecific", () => {
    const causes: AlertCause[] = ["fenomenos_naturales", "accidentes", "infraestructura", "humano", "otro"];
    for (const cause of causes) {
      const animation = getIncidentAnimation(alert(cause, "Aviso vigente"));
      expect(animation.kind).toBeTruthy();
      expect(animation.label).toBeTruthy();
    }
  });
});
