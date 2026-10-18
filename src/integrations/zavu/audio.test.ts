import { it, expect, vi } from "vitest";
import { createZavuAudioSource, allowedAudioUrl, MAX_AUDIO_BYTES } from "./audio";
it.each([
  "http://files.zavu.dev/a",
  "https://localhost/a",
  "https://127.0.0.1/a",
  "https://files.zavu.dev.evil.test/a",
  "https://user:pass@files.zavu.dev/a",
  "https://files.zavu.dev:8080/a",
])("rejects unsafe media locations %s", (url) => expect(allowedAudioUrl(url)).toBe(false));
it("accepts an authenticated resolved provider storage host", () => expect(allowedAudioUrl("https://files.zavu.dev/audio")).toBe(true));
function fixture(options: { url?: string; mimeType?: string; oversized?: boolean } = {}) {
  return vi.fn<typeof fetch>(async (url) =>
    String(url).includes("api.zavu.dev")
      ? Response.json({
          message: {
            id: "audio-id",
            messageType: "audio",
            direction: "inbound",
            content: { mediaUrl: options.url ?? "https://files.zavu.dev/audio", mimeType: options.mimeType ?? "audio/ogg" },
          },
        })
      : new Response("OggSsynthetic", {
          headers: { "content-type": "audio/ogg", "content-length": String(options.oversized ? MAX_AUDIO_BYTES + 1 : 13) },
        }),
  );
}
it("fetches media metadata by message ID before downloading", async () =>
  expect((await createZavuAudioSource("synthetic", fixture()).download("audio-id", "r")).mimeType).toBe("audio/ogg"));
it("rejects an oversized attachment", async () =>
  expect(createZavuAudioSource("synthetic", fixture({ oversized: true })).download("audio-id", "r")).rejects.toThrow());
it("does not download unsafe media URLs", async () => {
  const f = fixture({ url: "https://127.0.0.1/private" });
  await expect(createZavuAudioSource("synthetic", f).download("audio-id", "r")).rejects.toThrow();
  expect(f).toHaveBeenCalledOnce();
});
it("rejects unsupported media MIME types", async () =>
  expect(createZavuAudioSource("synthetic", fixture({ mimeType: "image/jpeg" })).download("audio-id", "r")).rejects.toThrow());
it("waits briefly for asynchronously stored media without trusting webhook URLs", async () => {
  let reads = 0;
  const f: typeof fetch = async (url) => {
    if (String(url).includes("api.zavu.dev")) {
      reads++;
      return Response.json({
        message: {
          id: "audio-id",
          messageType: "audio",
          direction: "inbound",
          content: reads === 1 ? {} : { mediaUrl: "https://files.zavu.dev/audio", mimeType: "audio/ogg" },
        },
      });
    }
    return new Response("OggSsynthetic", { headers: { "content-type": "audio/ogg" } });
  };
  expect((await createZavuAudioSource("synthetic", f, async () => {}).download("audio-id", "r")).mimeType).toBe("audio/ogg");
  expect(reads).toBe(2);
});
it.each([429, 500])("exposes metadata failure %i without exceeding the webhook budget", async (status) => {
  const f = vi.fn<typeof fetch>(async () => new Response("{}", { status }));
  await expect(createZavuAudioSource("synthetic", f).download("audio-id", "r")).rejects.toThrow();
  expect(f).toHaveBeenCalledOnce();
});
it("bounds metadata lookup by a three-second timeout", async () => {
  vi.useFakeTimers();
  try {
    const f: typeof fetch = async (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("Abort"))));
    const result = createZavuAudioSource("synthetic", f)
      .download("audio-id", "r")
      .then(
        () => false,
        () => true,
      );
    await vi.advanceTimersByTimeAsync(3001);
    expect(await result).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
