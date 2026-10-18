import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { z } from "zod";
import type { JsonTransport } from "../http/json-transport.ts";
// Resume expensive static GIS queries during one preparation session; never cache live warnings here.
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;
const cachedSchema = z.object({ url: z.url(), capturedAt: z.iso.datetime(), payload: z.unknown() });
export function createIngemmetOperatorCache(
  transport: JsonTransport,
  directory: URL,
): JsonTransport {
  return {
    async getJson(url, options = {}) {
      if (options.provider !== "ingemmet") return transport.getJson(url, options);
      await mkdir(directory, { recursive: true });
      const key = createHash("sha256").update(url).digest("hex");
      const path = new URL(`${key}.json`, directory);
      try {
        const cached = cachedSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
        if (
          cached.success &&
          cached.data.url === url &&
          Date.now() - Date.parse(cached.data.capturedAt) < MAX_CACHE_AGE_MS
        )
          return cached.data.payload;
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
          console.error(
            JSON.stringify({
              requestId: options.requestId,
              operation: "ingemmet.operator_cache",
              provider: "filesystem",
              result: "refresh",
              errorType: error instanceof Error ? error.name : "UnknownError",
            }),
          );
      }
      const payload = await transport.getJson(url, options);
      if (typeof payload === "object" && payload !== null && "error" in payload)
        throw new Error("INGEMMET returned an ArcGIS error");
      await writeFile(
        new URL(path.href + ".tmp"),
        JSON.stringify({ url, capturedAt: new Date().toISOString(), payload }),
      );
      await rename(new URL(path.href + ".tmp"), path);
      return payload;
    },
  };
}
