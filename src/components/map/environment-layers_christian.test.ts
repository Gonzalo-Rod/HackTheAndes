import {
  validateStyleMin,
  type LayerSpecification,
  type SourceSpecification,
  type StyleSpecification,
} from "@maplibre/maplibre-gl-style-spec";
import type { Map as MLMap } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import previous from "../../../docs/research/environment-map-evidence-2026-10-17_christian.json";
import verified from "../../../docs/research/verified-map-evidence-2026-10-17_christian.json";
import { EvidenceFeatureSchema } from "@/contracts/research-input_christian";
import { groupEvidencePoints } from "@/domain/research/evidence-state_christian";
import { isVerifiedMapRecord } from "@/domain/research/map-evidence_christian";
import { normalizeEvidence } from "@/domain/research/normalize-evidence_christian";

import { addEnvironmentLayers, groupDisplayPoints, syncEnvironmentLayers } from "./environment-layers_christian";

describe("environmental map style", () => {
  it("keeps all verified point records and warning areas in the map sources", () => {
    const records = [...previous.features, ...verified.features].flatMap((feature) => {
      const record = normalizeEvidence(EvidenceFeatureSchema.parse(feature));
      return record && isVerifiedMapRecord(record) ? [record] : [];
    });
    const points = groupEvidencePoints(records);
    const areas = records.filter((record) => record.geometry?.type !== "Point");
    const captured: GeoJSON.FeatureCollection[] = [];
    const map = {
      getSource: () => ({ setData: (data: GeoJSON.FeatureCollection) => captured.push(data) }),
      project: ([longitude, latitude]: [number, number]) => ({ x: longitude * 1000, y: latitude * 1000 }),
    } as unknown as MLMap;
    syncEnvironmentLayers(map, areas, points, null, Date.parse("2026-10-18T02:28:30Z"));
    expect(captured[0].features).toHaveLength(11);
    expect(captured[0].features.map((feature) => feature.geometry)).toEqual(areas.map((record) => record.geometry));
    const displayedPoints = captured[1].features;
    expect(displayedPoints.reduce((count, feature) => count + Number(feature.properties?.recordCount), 0)).toBe(312);
    expect(
      displayedPoints
        .filter((feature) => feature.properties?.category === "critical-zone")
        .reduce((count, feature) => count + Number(feature.properties?.recordCount), 0),
    ).toBe(303);
    expect(
      displayedPoints
        .filter((feature) => feature.properties?.category === "reference")
        .reduce((count, feature) => count + Number(feature.properties?.recordCount), 0),
    ).toBe(9);
    const sourceCoordinates = new Set(points.map((point) => point.coordinates.join(",")));
    for (const feature of displayedPoints) {
      expect(feature.geometry.type).toBe("Point");
      if (feature.geometry.type === "Point") expect(sourceCoordinates.has(feature.geometry.coordinates.join(","))).toBe(true);
    }
    expect(points.filter((point) => point.category === "reference").flatMap((point) => point.recordIds)).toHaveLength(9);
  });
  it("groups points at real coordinates without MapLibre worker cluster lookups", () => {
    const makePoint = (id: string, longitude: number, latitude: number, category: string) => ({
      type: "Feature" as const,
      id,
      geometry: { type: "Point" as const, coordinates: [longitude, latitude] as [number, number] },
      properties: { category, recordCount: 1, recordId: id },
    });
    const points = [
      makePoint("a", 0, 0, "critical-zone"),
      makePoint("b", 4, 0, "critical-zone"),
      makePoint("c", 100, 0, "critical-zone"),
      makePoint("r", 1, 0, "reference"),
    ];
    const displayed = groupDisplayPoints(points, ([longitude, latitude]) => ({ x: longitude, y: latitude }), 10);
    const cluster = displayed.find((feature) => typeof feature.properties?.clusterCount === "number");

    expect(cluster?.properties?.recordCount).toBe(2);
    expect(cluster?.geometry.type).toBe("Point");
    if (cluster?.geometry.type === "Point")
      expect([
        [0, 0],
        [4, 0],
      ]).toContainEqual(cluster.geometry.coordinates);
    expect(displayed.filter((feature) => feature.properties?.category === "reference")).toHaveLength(1);
  });
  it("accepts the muted warning areas and icon-only point layers in MapLibre's style validator", () => {
    const style: StyleSpecification = {
      version: 8,
      glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
      sources: {},
      layers: [],
    };
    // Capture the real style passed to MapLibre without requiring WebGL in unit tests.
    const map = {
      addSource: (id: string, source: SourceSpecification) => {
        style.sources[id] = source;
      },
      addLayer: (layer: LayerSpecification) => {
        style.layers.push(layer);
      },
      on: () => undefined,
    } as unknown as MLMap;
    addEnvironmentLayers(map);
    expect(validateStyleMin(style).map((error) => error.message)).toEqual([]);
    expect(style.layers.map((layer) => layer.type)).toEqual(["fill", "line", "symbol", "symbol"]);
    expect(Object.values(style.sources).some((source) => source.type === "geojson" && "cluster" in source)).toBe(false);
  });
});
