import { createHash, timingSafeEqual } from "node:crypto";

export function createBearerAuthorizer(secret: string) {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const expected = digest(`Bearer ${secret}`);
  return (request: Request) =>
    timingSafeEqual(expected, digest(request.headers.get("authorization") ?? ""));
}
export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new RangeError("Request body is too large");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
