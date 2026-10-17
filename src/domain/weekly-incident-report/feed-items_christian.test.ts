import { describe, expect, it } from "vitest";

import { realGoogleNewsFeed, realIndeciFeedPage, realNonFeedPage } from "@/test/fixtures/weekly-report_christian";

import { decodeEntities, parseFeedItems } from "./feed-items_christian";

describe("parseFeedItems", () => {
  it("reads the title, link, date, source and description of Google News items", () => {
    const [item] = parseFeedItems(realGoogleNewsFeed(6));
    expect(item).toMatchObject({
      title: "Choque múltiple en la Carretera Central deja varios heridos en Concepción - Diario Ahora",
      publishedAt: "2026-10-13T15:59:44.000Z",
      sourceName: "Diario Ahora",
    });
    expect(item.link).toMatch(/^https:\/\/news\.google\.com\/rss\/articles\//);
    // Google News escapes the HTML of its descriptions; one decoding pass leaves "&nbsp;" for an HTML reader.
    expect(item.description).toContain(
      'target="_blank">Choque múltiple en la Carretera Central deja varios heridos en Concepción</a>&nbsp;&nbsp;',
    );
  });

  it("reads every item of the six captured searches", () => {
    expect(([1, 2, 3, 4, 5, 6] as const).map((query) => parseFeedItems(realGoogleNewsFeed(query)).length)).toEqual([22, 6, 1, 5, 9, 4]);
  });

  it("reads whitespace-indented WordPress items, with entities decoded and CDATA unwrapped", () => {
    const [item] = parseFeedItems(realIndeciFeedPage(1));
    expect(item).toMatchObject({
      title:
        "REPORTE COMPLEMENTARIO N.° 14389 – 17/10/2026 / COEN-INDECI / 15:04 HORAS (Reporte N.° 1) INCENDIO FORESTAL EN EL DISTRITO DE LAMAS – SAN MARTÍN",
      link: "https://portal.indeci.gob.pe/emergencias/reporte-complementario-n-14389-17-10-2026-coen-indeci-1504-horas-reporte-n-1-incendio-forestal-en-el-distrito-de-lamas-san-martin/",
      publishedAt: "2026-10-17T20:18:30.000Z",
      sourceName: null,
    });
    expect(item.description).toMatch(/^<p>HECHOS: Fecha y hora de la ocurrencia/);
  });

  it("returns no items for a page that is not a feed", () => {
    expect(parseFeedItems(realNonFeedPage())).toEqual([]);
  });
});

describe("decodeEntities", () => {
  it("decodes the numeric references of INDECI's feed", () => {
    expect(decodeEntities("Emergencias &#8211; INDECI  Tarea de Todos")).toBe("Emergencias – INDECI  Tarea de Todos");
    expect(decodeEntities("https://portal.indeci.gob.pe/?post_type=alertas&#038;p=319438")).toBe(
      "https://portal.indeci.gob.pe/?post_type=alertas&p=319438",
    );
  });

  it("keeps CDATA content literally, as XML does", () => {
    const raw = /<description>(<!\[CDATA\[[\s\S]*?\]\]>)<\/description>/.exec(realIndeciFeedPage(3))?.[1] ?? "";
    const decoded = decodeEntities(raw);
    expect(decoded).toMatch(/^<p>HECHOS: Fecha y hora de la ocurrencia/);
    // The "&#8211;" inside the CDATA stays encoded; the HTML reader decodes it later.
    expect(decoded).toContain("N.° 14368 &#8211; 17/10/2026");
  });
});
