import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createFetchJsonTransport } from "../src/integrations/http/json-transport.ts";
import { createSutranRoadNetworkAdapter } from "../src/integrations/sutran/road-network.ts";
import { preparePe22Geometry } from "../src/services/prepare-pe22.ts";
import { roadNetworkSnapshotSchema } from "../src/contracts/road-geometry.ts";

const outputDir = resolve(import.meta.dirname, "../data/pe22");
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--offline")) {
  console.error("Usage: npm run pe22:prepare -- [--offline]");
  process.exitCode = 1;
} else {
  const requestId = randomUUID();
  const startedAt = performance.now();
  try {
    const sourcePath = join(outputDir, "source.json");
    const input: unknown = args.includes("--offline")
      ? JSON.parse(await readFile(sourcePath, "utf8"))
      : await createSutranRoadNetworkAdapter({ transport: createFetchJsonTransport() }).fetchPe22({
          requestId,
        });
    const snapshot = roadNetworkSnapshotSchema.parse(input);
    const result = preparePe22Geometry(snapshot);
    if (!result.ok) {
      console.error(
        JSON.stringify({
          requestId,
          operation: "pe22.prepare",
          provider: "sutran-road-network",
          durationMs: performance.now() - startedAt,
          result: "failure",
          ...result.error,
        }),
      );
      process.exitCode = 1;
    } else {
      const { corridor, segments, diagnostics } = result.value;
      const contents = {
        "source.json": JSON.stringify(snapshot, null, 2) + "\n",
        "corridor.geojson": JSON.stringify(corridor) + "\n",
        "segments-1km.geojson": JSON.stringify(segments) + "\n",
        "diagnostics.json": JSON.stringify(diagnostics, null, 2) + "\n",
      };
      const manifest = {
        schemaVersion: 1,
        geometryRevision: corridor.properties.geometryRevision,
        measuredLengthKm: corridor.properties.measuredLengthKm,
        segmentCount: segments.features.length,
        kilometerCalibration: "unverified",
        elevation: "pending",
        gazetteer: "pending",
        files: Object.fromEntries(
          Object.entries(contents).map(([name, content]) => [
            name,
            createHash("sha256").update(content).digest("hex"),
          ]),
        ),
      };
      await mkdir(outputDir, { recursive: true });
      // Publish the manifest last; its hashes detect mixed files after an interrupted build.
      const writes: [string, string][] = [
        ...Object.entries(contents),
        ["manifest.json", JSON.stringify(manifest, null, 2) + "\n"],
      ];
      for (const [name, content] of writes) {
        const destination = join(outputDir, name);
        const temporary = `${destination}.${requestId}.tmp`;
        try {
          await writeFile(temporary, content, "utf8");
          await rename(temporary, destination);
        } finally {
          await rm(temporary, { force: true });
        }
      }
      console.log(JSON.stringify({ state: "ready", outputDir, ...manifest }, null, 2));
      console.error(
        JSON.stringify({
          requestId,
          operation: "pe22.prepare",
          provider: "sutran-road-network",
          durationMs: performance.now() - startedAt,
          result: "success",
        }),
      );
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        requestId,
        operation: "pe22.prepare",
        provider: "sutran-road-network",
        durationMs: performance.now() - startedAt,
        result: "failure",
        errorType: error instanceof Error ? error.name : "UnknownError",
        message:
          "PE-22 geometry could not be prepared. No new dataset was confirmed; keep the previous verified dataset.",
      }),
    );
    process.exitCode = 1;
  }
}
