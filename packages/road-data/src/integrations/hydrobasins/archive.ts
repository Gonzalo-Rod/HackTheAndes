import { createHash } from "node:crypto";
import type { BinaryTransport } from "../http/binary-transport.ts";
export const HYDROBASINS_ARCHIVE_URL =
  "https://data.hydrosheds.org/file/HydroBASINS/standard/hybas_sa_lev12_v1c.zip";
// Provider's immutable v1c archive checksum, independently supplied by its object metadata.
export const HYDROBASINS_ARCHIVE_SHA1 = "df1af8946486e49cc665e77f5e5dad37b6b6b55f";
export function validateHydrobasinsArchive(bytes: Uint8Array): void {
  if (
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    createHash("sha1").update(bytes).digest("hex") !== HYDROBASINS_ARCHIVE_SHA1
  )
    throw new Error("HydroBASINS archive identity does not match the documented version");
}
export async function downloadHydrobasinsArchive(transport: BinaryTransport): Promise<Uint8Array> {
  const bytes = await transport.getBytes(HYDROBASINS_ARCHIVE_URL, { provider: "hydrobasins" });
  validateHydrobasinsArchive(bytes);
  return bytes;
}
