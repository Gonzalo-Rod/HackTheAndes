import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { loadResearchFiles } from "@/integrations/research-files/research-files_christian";
import { createResearchCatalogService } from "@/services/research-catalog-service_christian";
import { MapStateOverlay } from "@/components/dashboard/MapStateOverlay";

import { ResearchPanel } from "./ResearchPanel_christian";

const now = () => Date.parse("2026-10-18T00:40:00Z");

describe("research evidence presentation", () => {
  it("shows scope, official-notice provenance, dated snapshots, source catalog and weekly leads", async () => {
    const data = await createResearchCatalogService({ loadFiles: loadResearchFiles, now }).getCatalog("render-test");
    const html = renderToStaticMarkup(
      createElement(ResearchPanel, {
        state: { data, error: null, refreshing: false, refresh: async () => undefined },
        now: now(),
        topic: null,
        selectedId: null,
        onSelect: () => undefined,
        onCenter: () => undefined,
        liveSources: null,
      }),
    );
    expect(html).toContain("Todo el Perú · fuentes oficiales");
    expect(html).toContain("Los 323 registros están en el mapa");
    expect(html).toContain("zona crítica inventariada");
    expect(html).toContain("Inventario de zonas críticas");
    expect(html).toContain("Aviso 422");
    expect(html).toContain("Pronóstico próximo");
    expect(html).toContain("Fuentes y verificación · 41 referencias");
    expect(html).toContain("noticias por verificar");
    expect(html).toContain("no se cuentan como alertas ni generan pines");
  });
  it("uses the official forecast polygon and its daily validity instead of a fabricated point", async () => {
    const data = await createResearchCatalogService({ loadFiles: loadResearchFiles, now }).getCatalog("render-test");
    const id = "senamhi-area-422-day-1-level-2-2026";
    const html = renderToStaticMarkup(
      createElement(ResearchPanel, {
        state: { data, error: null, refreshing: false, refresh: async () => undefined },
        now: now(),
        topic: null,
        selectedId: id,
        onSelect: () => undefined,
        onCenter: () => undefined,
        liveSources: null,
      }),
    );
    expect(html).toContain("Abrir fuente oficial");
    expect(html).toContain("Polígono oficial de pronóstico · SENAMHI");
    expect(html).toContain("Ver coordenadas oficiales");
    expect(html).toContain("Ver en mapa");
    expect(html).not.toContain("Sin coordenadas verificadas");
    expect(html).toContain("no es una delimitación de daños ocurridos");
  });
  it("labels critical-zone points as inventory and dates them by the linked notice", async () => {
    const data = await createResearchCatalogService({ loadFiles: loadResearchFiles, now }).getCatalog("render-test");
    const html = renderToStaticMarkup(
      createElement(ResearchPanel, {
        state: { data, error: null, refreshing: false, refresh: async () => undefined },
        now: now(),
        topic: null,
        selectedId: "ingemmet-critical-zone-159-notice-421-2026",
        onSelect: () => undefined,
        onCenter: () => undefined,
        liveSources: null,
      }),
    );
    expect(html).toContain("Inventario de zonas críticas");
    expect(html).toContain("Aviso asociado vigente");
    expect(html).toContain("Vigencia del aviso vinculado (Lima)");
    expect(html).toContain("no es un pronóstico ni confirma que el peligro se haya activado");
    expect(html).not.toContain("Pronóstico vigente");
  });
  it("does not open the undated SENASA reference as map evidence, even through an old link", async () => {
    const data = await createResearchCatalogService({ loadFiles: loadResearchFiles, now }).getCatalog("render-test");
    const html = renderToStaticMarkup(
      createElement(ResearchPanel, {
        state: { data, error: null, refreshing: false, refresh: async () => undefined },
        now: now(),
        topic: null,
        selectedId: "senasa-junin-fruit-fly-trap-network-reference",
        onSelect: () => undefined,
        onCenter: () => undefined,
        liveSources: null,
      }),
    );
    expect(html).not.toContain("Vigilancia de mosca de la fruta");
    expect(html).not.toContain("Trampas del reporte sin fecha");
    expect(html).not.toContain("Referencia sin fecha");
    expect(html).toContain("13 referencias sin fecha o geometría verificadas");
  });
  it("keeps the map usable for environmental evidence when SUTRAN is unavailable", () => {
    const html = renderToStaticMarkup(
      createElement(MapStateOverlay, {
        loading: false,
        mapReady: true,
        mapError: null,
        dataError: "Consulta fallida",
        staleMessage: null,
        refreshing: false,
        partialData: true,
        onRetry: () => undefined,
      }),
    );
    expect(html).toContain("pr-banner");
    expect(html).not.toContain('class="pr-overlay"');
    expect(html).toContain("referencias ambientales mantienen su fecha original");
  });
});
