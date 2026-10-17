import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { preparePe22Geometry } from "../../src/services/prepare-pe22.ts";
import { shortSnapshot } from "../geometry/support.ts";
import {
  landmarkSourceSchema,
  gazetteerSchema,
  type LandmarkSource,
} from "../../src/contracts/road-locations.ts";
import { landmarkQueryUrl } from "../../src/integrations/mtc/landmarks.ts";

export function geometry() {
  const built = preparePe22Geometry(shortSnapshot());
  assert.ok(built.ok);
  return built.value;
}
export function source(): LandmarkSource {
  return landmarkSourceSchema.parse({
    schemaVersion: 1,
    provider: "mtc-ign",
    retrievedAt: "2026-10-17T21:45:00Z",
    sourceUrls: [5, 6, 7].map((layer) => landmarkQueryUrl(layer as 5 | 6 | 7)),
    landmarks: [
      {
        sourceId: "5:1",
        kind: "toll",
        name: "Peaje CORCONA",
        aliases: ["CORCONA"],
        position: [-76.895, -12],
        reportedRoadCode: "PE-22",
        reportedKm: 48.5,
        sourceUrl: landmarkQueryUrl(5),
      },
      {
        sourceId: "6:2",
        kind: "sos",
        name: "Poste SOS 01",
        aliases: ["SOS 01"],
        position: [-76.89, -12],
        reportedRoadCode: "PE-22",
        reportedKm: 43.2,
        sourceUrl: landmarkQueryUrl(6),
      },
      {
        sourceId: "7:3",
        kind: "bridge",
        name: "RÍO BLANCO",
        aliases: ["Puente RÍO BLANCO"],
        position: [-76.885, -12],
        reportedRoadCode: null,
        reportedKm: 100,
        sourceUrl: landmarkQueryUrl(7),
      },
    ],
  });
}
export function capturedGazetteer() {
  return gazetteerSchema.parse(
    JSON.parse(readFileSync(new URL("../../data/pe22/gazetteer.json", import.meta.url), "utf8")),
  );
}
export function payload(layer: number) {
  const item = source().landmarks.find((row) => row.sourceId.startsWith(`${layer}:`));
  assert.ok(item);
  const properties =
    layer === 5
      ? { nombre: "CORCONA", ruta: "PE-22", inicio: 48.5 }
      : layer === 6
        ? { numPoste: "01", codRuta: "PE-22", kmInicio: 43.2 }
        : { NombrePuen: "RÍO BLANCO", KmInicio: 100 };
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: Number(item.sourceId.split(":")[1]),
        properties,
        geometry:
          layer === 5
            ? { type: "MultiPoint", coordinates: [item.position] }
            : { type: "Point", coordinates: item.position },
      },
    ],
  };
}
