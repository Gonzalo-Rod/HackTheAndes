import { randomUUID } from "node:crypto";
import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { createFetchJsonTransport } from "../src/integrations/http/json-transport.ts";
import { createMtcLandmarkProvider } from "../src/integrations/mtc/landmarks.ts";
import { prepareRoadGeometry } from "../src/services/prepare-road-geometry.ts";
import {
  preparePe22Gazetteer,
  validateGazetteerSnapshot,
} from "../src/services/prepare-pe22-gazetteer.ts";
import type { Gazetteer } from "../src/contracts/road-locations.ts";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--offline"))
  throw new Error("Usage: npm run pe22:gazetteer -- [--offline]");
const requestId = randomUUID();
const startedAt = performance.now();
const destination = new URL("../data/pe22/gazetteer.json", import.meta.url);
const temporary = new URL(destination.href + `.${requestId}.tmp`);
let cached: Gazetteer | undefined;
function print(snapshot: Gazetteer, mode: "live" | "cached", refreshFailed = false) {
  console.log(
    JSON.stringify(
      {
        state: refreshFailed ? "cached" : "ready",
        mode,
        refreshFailed,
        geometryRevision: snapshot.geometryRevision,
        retrievedAt: snapshot.source.retrievedAt,
        dataAgeMs: Math.max(0, Date.now() - Date.parse(snapshot.source.retrievedAt)),
        entryCount: snapshot.entries.length,
        excludedCount: snapshot.excluded.length,
        kilometerEvidence: {
          state: "unverified",
          anchorCount: snapshot.kilometerEvidence.anchors.length,
        },
      },
      null,
      2,
    ),
  );
}
function log(result: string, provider: string, error?: unknown) {
  console.error(
    JSON.stringify({
      requestId,
      operation: "pe22.gazetteer",
      provider,
      durationMs: performance.now() - startedAt,
      result,
      ...(error ? { errorType: error instanceof Error ? error.name : "UnknownError" } : {}),
    }),
  );
}
try {
  const geometry = prepareRoadGeometry(
    JSON.parse(await readFile(new URL("../data/pe22/source.json", import.meta.url), "utf8")),
  );
  if (!geometry.ok) throw new Error("Source road geometry is unavailable");
  try {
    const previous = validateGazetteerSnapshot(
      geometry.value.segments,
      JSON.parse(await readFile(destination, "utf8")),
    );
    if (!previous.ok) throw new Error("Cached gazetteer is incompatible with current geometry");
    cached = previous.value;
  } catch (error) {
    log("cache_unavailable", "filesystem", error);
    if (args.includes("--offline")) throw error;
  }
  if (args.includes("--offline")) {
    if (!cached) throw new Error("No compatible cached gazetteer");
    print(cached, "cached");
  } else {
    const result = await preparePe22Gazetteer({
      segments: geometry.value.segments,
      provider: createMtcLandmarkProvider({ transport: createFetchJsonTransport() }),
      requestId,
    });
    if (!result.ok) throw new Error(result.error.message);
    await writeFile(temporary, JSON.stringify(result.value, null, 2) + "\n", "utf8");
    await rename(temporary, destination);
    print(result.value, "live");
  }
  log("success", "mtc-ign-landmarks");
} catch (error) {
  log("failure", "mtc-ign-landmarks", error);
  if (cached) print(cached, "cached", true);
  else console.log(JSON.stringify({ state: "unavailable", entryCount: 0 }));
  process.exitCode = 1;
} finally {
  await rm(temporary, { force: true });
}
