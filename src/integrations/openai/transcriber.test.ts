import { it, expect, vi } from "vitest";
import { createOpenAiTranscriber } from "./transcriber";
const config = { apiKey: "synthetic-key", model: "gpt-4o-mini-transcribe" };
it("uploads bounded Spanish audio as multipart and validates the transcript", async () => {
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    expect(form.get("language")).toBe("es");
    expect(form.get("file")).toBeInstanceOf(Blob);
    return Response.json({ text: "Hay un derrumbe." });
  });
  expect(await createOpenAiTranscriber(config, fetcher).transcribe(new Uint8Array([1]), "audio/ogg", "r")).toBe("Hay un derrumbe.");
});
it.each([429, 500])("does not retry a billable POST on %i", async (status) => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response("{}", { status }));
  expect(await createOpenAiTranscriber(config, fetcher).transcribe(new Uint8Array([1]), "audio/ogg", "r")).toBeNull();
  expect(fetcher).toHaveBeenCalledOnce();
});
it.each([{ text: "" }, { text: 123 }, {}])("rejects malformed transcript output", async (body) => {
  expect(
    await createOpenAiTranscriber(config, async () => Response.json(body)).transcribe(new Uint8Array([1]), "audio/ogg", "r"),
  ).toBeNull();
});
it("times out and returns a visible-service fallback", async () => {
  vi.useFakeTimers();
  try {
    const fetcher: typeof fetch = async (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("Abort"))));
    const promise = createOpenAiTranscriber(config, fetcher).transcribe(new Uint8Array([1]), "audio/ogg", "r");
    await vi.advanceTimersByTimeAsync(8001);
    expect(await promise).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
