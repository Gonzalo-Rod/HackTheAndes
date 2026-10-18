import { gzipSync } from "node:zlib";
import { z } from "zod";
import { createIngemmetOperatorCache } from "../src/integrations/ingemmet/operator-cache.ts";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { createSusceptibilityProvider } from "../src/integrations/ingemmet/susceptibility.ts";
import { createWarningProvider } from "../src/integrations/senamhi/warnings.ts";
import { createFetchJsonTransport } from "../src/integrations/http/json-transport.ts";
import { createBinaryTransport } from "../src/integrations/http/binary-transport.ts";
import { hazardCaptureSchema } from "../src/contracts/spatial-inputs.ts";
import { catchmentSnapshotSchema } from "../src/contracts/road-catchments.ts";
import { lineStringSchema } from "../src/contracts/road-geometry.ts";
const requestId = randomUUID();
const catchments = catchmentSnapshotSchema.parse(
  JSON.parse(await readFile(new URL("../data/pe22/catchments.json", import.meta.url), "utf8")),
);
const road = lineStringSchema.parse(
  JSON.parse(await readFile(new URL("../data/pe22/corridor.geojson", import.meta.url), "utf8"))
    .geometry,
);
try {
  const transport = createIngemmetOperatorCache(
    createFetchJsonTransport({ timeoutMs: 120_000 }),
    new URL("../data/.cache/ingemmet/", import.meta.url),
  );
  const susceptibility = await createSusceptibilityProvider(transport).fetchLayer(
    road.coordinates,
    catchments.features.flatMap((f) =>
      f.properties.samplePoints.map((s) => [s.longitude, s.latitude] as [number, number]),
    ),
    requestId,
  );
  const warnings = await createWarningProvider(
    transport,
    createBinaryTransport({ maxBytes: 2 * 1024 * 1024 }),
  ).fetchLayer(requestId);
  const capture = hazardCaptureSchema.parse({
    schemaVersion: 1,
    geometryRevision: catchments.geometryRevision,
    capturedAt: new Date().toISOString(),
    susceptibility,
    warnings,
    limitations: [
      "Susceptibility is static context, not a forecast or an event observation.",
      "INGEMMET publication/scale and pre-2024 availability remain unverified.",
      "Only polygons intersecting the road axis or sampling points were queried; other territory is unknown.",
      "SENAMHI validity uses the bulletin's local time interpreted as America/Lima; issue time is not supplied.",
      "Official warning levels are not our model risk classes.",
    ],
  });
  const target = new URL("../data/.cache/hazards-source.json", import.meta.url);
  await mkdir(new URL("./", target), { recursive: true });
  await writeFile(new URL(target.href + ".tmp"), JSON.stringify(capture));
  await rename(new URL(target.href + ".tmp"), target);
  const archive = new URL("../data/spatial/hazards-source.json.gz", import.meta.url);
  await mkdir(new URL("./", archive), { recursive: true });
  await writeFile(new URL(archive.href + ".tmp"), gzipSync(JSON.stringify(capture)));
  await rename(new URL(archive.href + ".tmp"), archive);
  console.log(
    JSON.stringify({
      state: "captured",
      susceptibilityPolygons: susceptibility.features.length,
      nationalWarnings: warnings.features.length,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      requestId,
      operation: "hazards.capture",
      provider: "official_layers",
      result: "failure",
      errorType: error instanceof Error ? error.name : "UnknownError",
      issues:
        error instanceof z.ZodError
          ? error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
          : undefined,
    }),
  );
  process.exitCode = 1;
}
