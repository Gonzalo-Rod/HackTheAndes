import { describe, expect, it } from "vitest";

import { normalizeSutranAlert } from "@/domain/road-alerts/normalize";
import {
  INDECI_TITLES,
  realGoogleNewsChosicaFeed,
  realGoogleNewsFeed,
  realRoadAlert,
  realSutranRecords,
} from "@/test/fixtures/weekly-report_christian";

import { classifyNewsTitle, isCorridorAlert, isCorridorPlace, isRoadRelevantHazard, matchNewsTitle, placeKey } from "./corridor_christian";
import { parseFeedItems } from "./feed-items_christian";
import { parseIndeciTitle } from "./indeci-reports_christian";

/** Headlines of every captured Google News item, without the " - <outlet>" suffix. */
const CAPTURED_HEADLINES = [...([1, 2, 3, 4, 5, 6] as const).map(realGoogleNewsFeed), realGoogleNewsChosicaFeed()]
  .flatMap((xml) => parseFeedItems(xml))
  .map(({ title, sourceName }) => (sourceName && title.endsWith(` - ${sourceName}`) ? title.slice(0, -` - ${sourceName}`.length) : title));

/** The captured headline that contains `text` (in full, or a fragment of a long one); fails for anything not captured. */
function headline(text: string): string {
  const found = CAPTURED_HEADLINES.find((title) => title.includes(text));
  if (!found) throw new Error(`Not a captured headline: ${text}`);
  return found;
}

function place(title: string) {
  const parsed = parseIndeciTitle(title).place;
  if (!parsed) throw new Error(`No place in ${title}`);
  return parsed;
}

describe("isCorridorAlert", () => {
  it("keeps the five corridor alerts of the 13 that SUTRAN listed", () => {
    const codes = realSutranRecords().flatMap((record) => {
      const alert = normalizeSutranAlert(record);
      return alert && isCorridorAlert(alert) ? [alert.code] : [];
    });
    expect(codes).toEqual(["SIGEA-171026-02", "SIGEA-171026-01", "SIGEA-141026-01", "SIGEA-111026-02", "SIGEA-101026-02"]);
  });

  it("accepts PE-22 in Huarochirí and PE-3S in Yauli", () => {
    expect(isCorridorAlert(realRoadAlert("SIGEA-171026-02"))).toBe(true); // PE-22 km 88, San Mateo
    expect(isCorridorAlert(realRoadAlert("SIGEA-141026-01"))).toBe(true); // PE-3S km 6, La Oroya
  });

  it("leaves out PE-3S south of the corridor", () => {
    expect(isCorridorAlert(realRoadAlert("SIGEA-121026-01"))).toBe(false); // PE-3S km 351, Huanta (Ayacucho)
  });
});

describe("isCorridorPlace", () => {
  it("accepts corridor districts and provinces, with or without hyphens", () => {
    for (const title of [
      INDECI_TITLES.surco,
      INDECI_TITLES.ate,
      INDECI_TITLES.canchayllo,
      INDECI_TITLES.sanMateo2019,
      INDECI_TITLES.huarochiri2023,
      INDECI_TITLES.luriganchoChosica2020,
    ]) {
      expect(isCorridorPlace(place(title))).toBe(true);
    }
  });

  it("matches district names exactly, so San Juan de Lurigancho is not Lurigancho", () => {
    expect(isCorridorPlace(place(INDECI_TITLES.sanJuanDeLurigancho))).toBe(false);
  });

  it("checks the department, so Yauli in Huancavelica is not Yauli in Junín", () => {
    expect(isCorridorPlace(place(INDECI_TITLES.yauliHuancavelica))).toBe(false);
  });

  it("leaves out places off the corridor", () => {
    for (const title of [
      INDECI_TITLES.perene,
      INDECI_TITLES.contumaza,
      INDECI_TITLES.ocona,
      INDECI_TITLES.paruro,
      INDECI_TITLES.toroPreliminary,
    ]) {
      expect(isCorridorPlace(place(title))).toBe(false);
    }
  });
});

describe("isRoadRelevantHazard", () => {
  const hazard = (title: string) => parseIndeciTitle(title).hazard;

  it("keeps huaicos, landslides and rain", () => {
    for (const title of [INDECI_TITLES.sanMateo2019, INDECI_TITLES.perene, INDECI_TITLES.contumaza, INDECI_TITLES.ocona]) {
      expect(isRoadRelevantHazard(hazard(title))).toBe(true);
    }
  });

  it("leaves out fires and wind", () => {
    for (const title of [INDECI_TITLES.surco, INDECI_TITLES.ate, INDECI_TITLES.canchayllo]) {
      expect(isRoadRelevantHazard(hazard(title))).toBe(false);
    }
  });
});

describe("classifyNewsTitle", () => {
  it("matches a corridor place together with an incident word", () => {
    expect(classifyNewsTitle(headline("Choque múltiple en la Carretera Central deja varios heridos en Concepción"))).toEqual({
      kind: "match",
      match: { placeTerms: ["carretera central", "concepcion"], incidentTerms: ["choque", "heridos"] },
    });
    expect(matchNewsTitle(headline("La Oroya: dos jóvenes resultan heridos tras caer con su auto al río Mantaro"))).toEqual({
      placeTerms: ["la oroya"],
      incidentTerms: ["heridos"],
    });
  });

  it("matches whole words only, so Huaycoloro is not a huayco", () => {
    expect(matchNewsTitle(headline("Canal de Huaycoloro, diseñado para huaicos, es usado como basurero en Lurigancho-Chosica"))).toEqual({
      placeTerms: ["chosica"],
      incidentTerms: ["huaicos"],
    });
  });

  it("counts a weak place only next to a strong one", () => {
    expect(matchNewsTitle(headline("Una maquinaria chocó contra un puente en Chosica"))).toEqual({
      placeTerms: ["chosica", "rimac"],
      incidentTerms: ["choco"],
    });
  });

  it("sets apart incidents on a road named only 'Carretera Central', which may be another road of that name", () => {
    expect(classifyNewsTitle(headline("Dos ocupantes de motocicleta mueren en accidente ocurrido en la Carretera Central"))).toEqual({
      kind: "road-name-only",
    });
  });

  it("rejects places outside the corridor, the Nueva Carretera Central project and crime news", () => {
    for (const title of [
      // Exitosa: a crash near the Ricardo Palma bridge in Miraflores (Lima city), not in the Ricardo Palma district.
      headline("cerca del puente Ricardo Palma, en Miraflores"),
      headline("Nueva Carretera Central sigue sin fondos asegurados: MTC plantea iniciar obras en 2027"),
      headline("Dos choferes y una pasajera quedan heridos tras ataques armados en Chosica y SJM"),
      headline("Asesinan a balazos a chofer de 23 años de la empresa Florida en Chosica"),
    ]) {
      expect(classifyNewsTitle(title)).toEqual({ kind: "no-match" });
    }
  });

  it("needs an incident word next to the corridor place", () => {
    for (const title of [
      headline("Clubes Campestres en Chosica: restaurantes, bungalows"),
      headline("Cámara de Comercio pide declarar en emergencia la Carretera Central ante El Niño"),
    ]) {
      expect(classifyNewsTitle(title)).toEqual({ kind: "no-match" });
    }
  });
});

describe("placeKey", () => {
  it("compares place names without accents, case or hyphens", () => {
    expect(placeKey("LURIGANCHO CHOSICA")).toBe(placeKey("Lurigancho-Chosica"));
    expect(placeKey("JUNÍN")).toBe("JUNIN");
  });
});
