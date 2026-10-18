import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createBinaryTransport } from "../src/integrations/http/binary-transport.ts";
import {
  downloadHydrobasinsArchive,
  validateHydrobasinsArchive,
} from "../src/integrations/hydrobasins/archive.ts";
const directory = new URL("../data/.cache/", import.meta.url);
const destination = new URL("hybas_sa_lev12_v1c.zip", directory);
let bytes: Uint8Array;
try {
  bytes = await readFile(destination);
  validateHydrobasinsArchive(bytes);
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  // A continental archive needs a longer explicit operator timeout than an interactive API call.
  bytes = await downloadHydrobasinsArchive(createBinaryTransport({ timeoutMs: 120_000 }));
  await mkdir(directory, { recursive: true });
  const temporary = new URL(`hybas_sa_lev12_v1c.${crypto.randomUUID()}.tmp`, directory);
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
}
console.log(
  JSON.stringify({
    source: "HydroBASINS v1c South America level 12",
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    state: "verified",
  }),
);
