import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createOpenAiIntentParser } from "./intent-parser";
const response = (intent: unknown) => ({
  status: "completed",
  output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(intent) }] }],
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const config = { apiKey: "test-key", model: "gpt-4.1-mini-2025-04-14" };
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());
it("validates structured output and sends redacted text with response storage disabled", async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => json(response({ kind: "exposure", place: "Matucana" })));
  const parser = createOpenAiIntentParser(config, { fetchImpl });
  expect(await parser.parse("¿Clima en Matucana? Contacto +51 900 000 000 test@example.test", "req")).toEqual({
    kind: "exposure",
    place: "Matucana",
  });
  const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
  expect(body.store).toBe(false);
  expect(body.input).not.toContain("900");
  expect(body.input).not.toContain("test@example.test");
  expect(body.text.format.strict).toBe(true);
});
it.each([
  {},
  response({ kind: "exposure", place: "Invented place" }),
  response({ kind: "exposure", place: null, probability: 0.9 }),
  { status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] },
  { status: "incomplete", output: [] },
])("falls back on malformed, invented or refused output", async (body) => {
  expect(await createOpenAiIntentParser(config, { fetchImpl: async () => json(body) }).parse("¿Llueve?", "req")).toBeNull();
});
it.each([429, 500])("does not retry a billable POST after HTTP %s", async (status) => {
  const fetchImpl = vi.fn(async () => json({ error: "private" }, status));
  expect(await createOpenAiIntentParser(config, { fetchImpl }).parse("¿Llueve?", "req")).toBeNull();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it("times out with a visible command fallback", async () => {
  const fetchImpl: typeof fetch = async (_url, init) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
  expect(await createOpenAiIntentParser(config, { fetchImpl, timeoutMs: 1 }).parse("¿Llueve?", "req")).toBeNull();
});
