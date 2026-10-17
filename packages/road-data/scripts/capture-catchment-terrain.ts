import { randomUUID } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import { catchmentSnapshotSchema } from "../src/contracts/road-catchments.ts";
import { terrainCaptureSchema } from "../src/contracts/spatial-inputs.ts";
import { createOpenMeteoElevationProvider } from "../src/integrations/open-meteo/elevation.ts";
import { createFetchJsonTransport } from "../src/integrations/http/json-transport.ts";
import { slopeSamplePositions, slopeDegrees } from "../src/domain/spatial/slope.ts";
const catchments = catchmentSnapshotSchema.parse(
  JSON.parse(await readFile(new URL("../data/pe22/catchments.json", import.meta.url), "utf8")),
);
const samplePoints = [
  ...new Map(
    catchments.features.flatMap((f) =>
      f.properties.samplePoints.map(
        (s) =>
          [`${s.longitude},${s.latitude}`, [s.longitude, s.latitude] as [number, number]] as const,
      ),
    ),
  ).values(),
];
const positions = samplePoints.flatMap(slopeSamplePositions);
const result = await createOpenMeteoElevationProvider({
  transport: createFetchJsonTransport(),
}).fetchElevations(positions, { requestId: randomUUID() });
const sampleIndex = new Map(samplePoints.map((point, index) => [point.join(","), index * 4]));
const features = catchments.features.map((feature) => {
  const samples = feature.properties.samplePoints.map((sample) => {
    const index = sampleIndex.get(`${sample.longitude},${sample.latitude}`);
    if (index === undefined) throw new Error("Missing terrain sample index");
    const values = result.values.slice(index, index + 4);
    if (values.length !== 4) throw new Error("Incomplete terrain stencil");
    const elevationsM: [number, number, number, number] = [
      values[0] ?? NaN,
      values[1] ?? NaN,
      values[2] ?? NaN,
      values[3] ?? NaN,
    ];
    return {
      position: [sample.longitude, sample.latitude],
      weight: sample.weight,
      elevationsM,
      slopeDegrees: slopeDegrees(elevationsM),
    };
  });
  return {
    catchmentId: feature.id,
    estimatedMeanSlopeDegrees: samples.reduce((total, s) => total + s.weight * s.slopeDegrees, 0),
    samples,
  };
});
const capture = terrainCaptureSchema.parse({
  schemaVersion: 1,
  geometryRevision: catchments.geometryRevision,
  capturedAt: new Date().toISOString(),
  method: "area_weighted_sampled_dem_gradient",
  source: "Open-Meteo Copernicus GLO-90",
  sourceUrls: result.sourceUrls,
  demResolutionM: 90,
  stepDistanceM: 90,
  catchments: features,
  limitations: [
    "Coarse interior-point sampling of DEM gradients; not an exact area-wide mean slope.",
    "Copernicus DEM contains surface elevation and may include vegetation or structures.",
    "Catchments remain a low-confidence HydroBASINS fallback.",
  ],
});
const target = new URL("../data/pe22/catchment-terrain.json", import.meta.url);
await writeFile(new URL(target.href + ".tmp"), JSON.stringify(capture));
await rename(new URL(target.href + ".tmp"), target);
console.log(
  JSON.stringify({
    state: "captured",
    catchments: features.length,
    elevationSamples: positions.length,
    minSlopeDegrees: Math.min(...features.map((f) => f.estimatedMeanSlopeDegrees)),
    maxSlopeDegrees: Math.max(...features.map((f) => f.estimatedMeanSlopeDegrees)),
  }),
);
