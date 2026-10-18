import { z } from "zod";
import type { AudioSource } from "@/contracts/notifications";
import { getJson, getBoundedAudio } from "@/integrations/http/fetch-json";
/** Bound memory and transcription cost; photos and other media are not accepted. */
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const messageSchema = z.object({
  message: z.object({
    id: z.string(),
    messageType: z.literal("audio"),
    direction: z.literal("inbound"),
    content: z.object({ mediaUrl: z.url().optional(), mimeType: z.string().optional() }),
  }),
});
export function allowedAudioUrl(value: string) {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    (!url.port || url.port === "443") &&
    ["zavu.dev", "convex.cloud", "convex.site", "r2.dev"].some((host) => url.hostname.endsWith(`.${host}`))
  );
}
export function createZavuAudioSource(
  apiKey: string,
  fetchImpl?: typeof fetch,
  sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
): AudioSource {
  return {
    async download(messageId, requestId) {
      // Resolve via authenticated provider metadata, never a URL supplied in the webhook.
      let response: z.infer<typeof messageSchema> | undefined;
      // Zavu stores media asynchronously after delivering the initial webhook.
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await sleep(attempt * 200);
        response = messageSchema.parse(
          await getJson(`https://api.zavu.dev/v1/messages/${encodeURIComponent(messageId)}`, {
            provider: "zavu",
            operation: "audio.resolve",
            timeoutMs: 3000,
            retries: 0,
            requestId,
            headers: { Authorization: `Bearer ${apiKey}` },
            fetchImpl,
          }),
        );
        if (response.message.id !== messageId) throw new Error("Audio identity mismatch");
        if (response.message.content.mediaUrl) break;
      }
      const mediaUrl = response?.message.content.mediaUrl;
      if (!response || !mediaUrl || !allowedAudioUrl(mediaUrl)) throw new Error("Untrusted audio source");
      const file = await getBoundedAudio(mediaUrl, MAX_AUDIO_BYTES, {
        provider: "zavu-media",
        operation: "audio.download",
        retries: 1,
        logTarget: "stored-audio",
        requestId,
        fetchImpl,
      });
      const mimeType = (response.message.content.mimeType ?? file.mimeType).split(";")[0]?.trim() ?? "";
      if (!["audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "audio/webm"].includes(mimeType))
        throw new Error("Unsupported audio format");
      if (mimeType === "audio/ogg" && Buffer.from(file.bytes.subarray(0, 4)).toString() !== "OggS") throw new Error("Invalid OGG file");
      return { bytes: file.bytes, mimeType };
    },
  };
}
