import { describe, expect, it } from "vitest";

import {
  INDECI_TITLES,
  realIndeciBulletinPage,
  realIndeciCorridorItems,
  realIndeciFeedPage,
  realIndeciReportPage,
  realNonFeedPage,
  WEEK_42,
} from "@/test/fixtures/weekly-report_christian";

import { parseFeedItems } from "./feed-items_christian";
import { htmlToText, isReportInWeek, parseIndeciReportPage, parseIndeciTitle } from "./indeci-reports_christian";

function feedItem(xml: string, title: string) {
  const item = parseFeedItems(xml).find((candidate) => candidate.title === title);
  if (!item) throw new Error(`Not in the capture: ${title}`);
  return item;
}

describe("parseIndeciTitle", () => {
  it("reads the hazard and district of a complementary report", () => {
    expect(parseIndeciTitle(INDECI_TITLES.canchayllo)).toEqual({
      hazard: "Vientos fuertes",
      place: { level: "distrito", names: ["Canchayllo"], department: "Junín" },
    });
  });

  it("handles a missing 'EN' before the district", () => {
    expect(parseIndeciTitle(INDECI_TITLES.surco)).toEqual({
      hazard: "Incendio forestal",
      place: { level: "distrito", names: ["Surco"], department: "Lima" },
    });
  });

  it("drops the 'POR' of imminent-danger reports", () => {
    expect(parseIndeciTitle(INDECI_TITLES.ocona)).toEqual({
      hazard: "Lluvias intensas",
      place: { level: "distrito", names: ["Ocoña"], department: "Arequipa" },
    });
  });

  it("reads INDECI's 'DISTRTO' typo and preliminary reports without a report counter", () => {
    expect(parseIndeciTitle(INDECI_TITLES.perene)).toEqual({
      hazard: "Huaico",
      place: { level: "distrito", names: ["Perené"], department: "Junín" },
    });
    expect(parseIndeciTitle(INDECI_TITLES.toroPreliminary)).toEqual({
      hazard: "Incendio forestal",
      place: { level: "distrito", names: ["Toro"], department: "Arequipa" },
    });
  });

  it("reads province-level reports", () => {
    expect(parseIndeciTitle(INDECI_TITLES.paruro).place).toEqual({ level: "provincia", names: ["Paruro"], department: "Cusco" });
    expect(parseIndeciTitle(INDECI_TITLES.huarochiri2023)).toEqual({
      hazard: "Huaico",
      place: { level: "provincia", names: ["Huarochiri"], department: "Lima" },
    });
  });

  it("returns no place for bulletins", () => {
    expect(parseIndeciTitle(INDECI_TITLES.bulletin).place).toBeNull();
  });
});

describe("parseIndeciReportPage", () => {
  it("reads the occurrence date, time and description of a report page, shortening long descriptions", () => {
    // The page writes "6/3/2026 07:30 horas".
    const page = parseIndeciReportPage(realIndeciReportPage("sartimbamba"));
    expect(page).toMatchObject({ occurredDate: "2026-03-06", occurredTime: "07:30" });
    expect(page.description).toMatch(/^A consecuencia de las lluvias intensas se registró un deslizamiento/);
    expect(page.description).toHaveLength(280);
  });

  it("reads 'Horas' written with a capital letter", () => {
    expect(parseIndeciReportPage(realIndeciReportPage("san-juan-de-miraflores"))).toEqual({
      occurredDate: "2026-02-12",
      occurredTime: "02:15",
      description: "Se registraron lluvias intensas que ocasionaron daños materiales (viviendas) en el distrito de san Juan de Miraflores",
    });
  });

  it("reads the same table from a feed description, without the WordPress footer", () => {
    const { description } = feedItem(realIndeciFeedPage(3), INDECI_TITLES.canchayllo);
    expect(parseIndeciReportPage(description ?? "")).toEqual({
      occurredDate: "2026-10-15",
      occurredTime: "16:00",
      description:
        "Se registraron vientos fuertes que causaron daños a la vida y a la salud de las personas y a la infraestructura del Coliseo Comunal, en el sector y distrito de Canchayllo, provincia de Jauja.",
    });
  });

  it("returns nothing for pages without the occurrence table", () => {
    const none = { occurredDate: null, occurredTime: null, description: null };
    expect(parseIndeciReportPage(realIndeciBulletinPage())).toEqual(none);
    expect(parseIndeciReportPage(realNonFeedPage())).toEqual(none);
  });
});

describe("htmlToText", () => {
  it("drops styles and tags and collapses spaces", () => {
    // Andina's 404 page starts with a <style> block.
    const text = htmlToText(realNonFeedPage());
    expect(text).toMatch(/^The resource cannot be found\. Server Error in '\/' Application\./);
    expect(text).not.toMatch(/[<>{}]|\s{2}/);
  });
});

describe("isReportInWeek", () => {
  const occurrence = (xml: string, title: string) => {
    const item = feedItem(xml, title);
    return { occurredDate: parseIndeciReportPage(item.description ?? "").occurredDate, publishedAt: item.publishedAt };
  };

  it("goes by the event date when INDECI states it", () => {
    // Published on 17 Oct about wind on 15 Oct.
    expect(isReportInWeek(WEEK_42, occurrence(realIndeciFeedPage(3), INDECI_TITLES.canchayllo))).toBe(true);
    // Published on 15 Oct (UTC) about a fire of 30 Sep.
    expect(isReportInWeek(WEEK_42, occurrence(realIndeciCorridorItems(), INDECI_TITLES.surco))).toBe(false);
    // The Ate report, published on 13 Oct (UTC) about a fire of 11 Oct; only its dates are kept (see the fixtures README).
    expect(isReportInWeek(WEEK_42, { occurredDate: "2026-10-11", publishedAt: "2026-10-13T03:22:46.000Z" })).toBe(false);
  });

  it("goes by publication before the week ends when the report has no occurrence table", () => {
    const { publishedAt } = feedItem(realIndeciFeedPage(1), INDECI_TITLES.bulletin);
    expect(isReportInWeek(WEEK_42, { occurredDate: null, publishedAt })).toBe(true);
    expect(isReportInWeek({ startDate: "2026-10-05", endDate: "2026-10-11" }, { occurredDate: null, publishedAt })).toBe(false);
  });
});
