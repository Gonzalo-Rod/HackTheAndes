import { readFileSync } from "node:fs";
import {
  roadNetworkSnapshotSchema,
  type RoadNetworkSnapshot,
} from "../../src/contracts/road-geometry.ts";

export function capturedSnapshot(): RoadNetworkSnapshot {
  return roadNetworkSnapshotSchema.parse(
    JSON.parse(readFileSync(new URL("../../data/pe22/source.json", import.meta.url), "utf8")),
  );
}

export function shortSnapshot(): RoadNetworkSnapshot {
  const snapshot = capturedSnapshot();
  const properties = snapshot.features[0]?.properties;
  if (!properties) throw new Error("Missing source fixture");
  return {
    ...snapshot,
    features: [0, 1].map((index) => ({
      type: "Feature",
      properties: {
        ...properties,
        sourceId: `PE-22#${index}#${index + 1}`,
        sourceKmStart: index,
        sourceKmEnd: index + 1,
        sourceLengthKm: 1,
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [-76.9 + index * 0.01, -12],
          [-76.9 + (index + 1) * 0.01, -12],
        ],
      },
    })),
  };
}

export function providerPayloads(snapshot = capturedSnapshot()) {
  return {
    metadata: {
      success: true,
      data: snapshot.features.map(({ properties: p }) => ({
        id: p.sourceId,
        codVia: p.roadCode,
        kmInicio: p.sourceKmStart,
        kmFin: p.sourceKmEnd,
        longitudKm: p.sourceLengthKm,
        nombreVia: p.name,
        superficie: p.surface,
        estado: p.condition,
        red: "nacional",
      })),
    },
    geometry: {
      type: "FeatureCollection",
      features: snapshot.features.map((section) => ({
        type: "Feature",
        properties: { id: section.properties.sourceId },
        geometry: section.geometry,
      })),
    },
  };
}
