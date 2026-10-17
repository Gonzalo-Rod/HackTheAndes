import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { createFetchJsonTransport } from "../src/integrations/http/json-transport.ts";
import { createOpenMeteoElevationProvider } from "../src/integrations/open-meteo/elevation.ts";
import { preparePe22Geometry } from "../src/services/prepare-pe22.ts";
import { preparePe22Elevation } from "../src/services/prepare-pe22-elevation.ts";
import {
  elevationSnapshotSchema,
  type ElevationSnapshot,
} from "../src/contracts/road-elevation.ts";
import {
  planElevationSamples,
  validateElevationSnapshot,
} from "../src/domain/road-data/elevation-samples.ts";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--offline"))
  throw new Error("Usage: npm run pe22:elevation -- [--offline]");
const requestId = randomUUID();
const startedAt = performance.now();
const destination = new URL("../data/pe22/elevation.json", import.meta.url);
const temporary = new URL(destination.href + "." + requestId + ".tmp");
let cached: ElevationSnapshot | undefined;

function printSnapshot(
  snapshot: ElevationSnapshot,
  mode: "live" | "cached",
  refreshFailed = false,
) {
  console.log(
    JSON.stringify(
      {
        state: refreshFailed ? "cached" : "ready",
        mode,
        refreshFailed,
        geometryRevision: snapshot.geometryRevision,
        sampleCount: snapshot.samples.length,
        retrievedAt: snapshot.retrievedAt,
        dataAgeMs: Math.max(0, Date.now() - Date.parse(snapshot.retrievedAt)),
        source: snapshot.source,
        minElevationM: Math.min(...snapshot.samples.map((sample) => sample.elevationM)),
        maxElevationM: Math.max(...snapshot.samples.map((sample) => sample.elevationM)),
        sha256: createHash("sha256")
          .update(JSON.stringify(snapshot, null, 2) + "\n")
          .digest("hex"),
      },
      null,
      2,
    ),
  );
}

try {
  const geometry = preparePe22Geometry(
    JSON.parse(await readFile(new URL("../data/pe22/source.json", import.meta.url), "utf8")),
  );
  if (!geometry.ok) throw new Error("Source road geometry is unavailable");
  const plan = planElevationSamples(geometry.value.segments);
  if (!plan.ok) throw new Error("Elevation sampling plan is unavailable");
  if (!args.includes("--offline")) {
    try {
      const previous = validateElevationSnapshot(
        JSON.parse(await readFile(destination, "utf8")),
        plan.value,
      );
      if (!previous.ok) throw new Error("Cached elevation is incompatible with current geometry");
      cached = previous.value;
    } catch (error) {
      // A valid refresh can recover without a cache; an outage must show unavailable.
      console.error(
        JSON.stringify({
          requestId,
          operation: "pe22.elevation.cache",
          provider: "filesystem",
          durationMs: performance.now() - startedAt,
          result: "unavailable",
          errorType: error instanceof Error ? error.name : "UnknownError",
        }),
      );
    }
  }
  const result = args.includes("--offline")
    ? {
        ok: true as const,
        value: elevationSnapshotSchema.parse(JSON.parse(await readFile(destination, "utf8"))),
      }
    : await preparePe22Elevation({
        segments: geometry.value.segments,
        provider: createOpenMeteoElevationProvider({ transport: createFetchJsonTransport() }),
        requestId,
      });
  if (!result.ok) throw new Error(result.error.message);
  const verified = validateElevationSnapshot(result.value, plan.value);
  if (!verified.ok) throw new Error(verified.error.message);
  const snapshot = verified.value;
  if (!args.includes("--offline")) {
    await writeFile(temporary, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
    await rename(temporary, destination);
  }
  printSnapshot(snapshot, args.includes("--offline") ? "cached" : "live");
  console.error(
    JSON.stringify({
      requestId,
      operation: "pe22.elevation",
      provider: snapshot.source.provider,
      durationMs: performance.now() - startedAt,
      result: "success",
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      requestId,
      operation: "pe22.elevation",
      provider: "open-meteo-elevation",
      durationMs: performance.now() - startedAt,
      result: "failure",
      errorType: error instanceof Error ? error.name : "UnknownError",
      message:
        "No new elevation snapshot was confirmed. Existing files were not replaced; the result identifies a verified cache or unavailable elevation.",
    }),
  );
  if (cached) printSnapshot(cached, "cached", true);
  else console.log(JSON.stringify({ state: "unavailable", sampleCount: 0 }));
  process.exitCode = 1;
} finally {
  await rm(temporary, { force: true });
}
