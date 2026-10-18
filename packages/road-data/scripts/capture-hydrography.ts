import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { createFetchJsonTransport } from "../src/integrations/http/json-transport.ts";
import { lineStringSchema, multiLineStringSchema } from "../src/contracts/road-geometry.ts";
const sourceUrl = "https://d1nmqibi58phlc.cloudfront.net/rios-quebradas-peru.geojson";
const schema = z.object({
  type: z.literal("FeatureCollection"),
  features: z
    .array(
      z.object({
        type: z.literal("Feature"),
        properties: z.record(z.string(), z.unknown()),
        geometry: z.union([lineStringSchema, multiLineStringSchema]),
      }),
    )
    .min(1),
});
const directory = new URL("../data/.cache/", import.meta.url);
const destination = new URL("ana-rivers.json", directory);
let snapshot: unknown;
try {
  snapshot = JSON.parse(await readFile(destination, "utf8"));
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  snapshot = {
    sourceUrl,
    retrievedAt: new Date().toISOString(),
    data: schema.parse(
      await createFetchJsonTransport().getJson(sourceUrl, { provider: "sutran-hydrography" }),
    ),
  };
  await mkdir(directory, { recursive: true });
  const temporary = new URL(`ana-rivers.${randomUUID()}.tmp`, directory);
  await writeFile(temporary, JSON.stringify(snapshot));
  await rename(temporary, destination);
}
const parsed = z
  .object({ sourceUrl: z.literal(sourceUrl), retrievedAt: z.iso.datetime(), data: schema })
  .parse(snapshot);
console.log(
  JSON.stringify({
    state: "verified",
    features: parsed.data.features.length,
    sha256: createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex"),
    propertyKeys: Object.keys(parsed.data.features[0]?.properties ?? {}),
  }),
);
