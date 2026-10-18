import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createOpenAiReportExtractor } from "./report-extractor";
import type { ReportExtraction } from "@/contracts/reports";
const config = { apiKey: "synthetic-test-key", model: "gpt-4.1-mini-2025-04-14" };
const base: ReportExtraction = {
  type: null,
  placeText: null,
  kilometer: null,
  direction: null,
  severity: null,
  lanesBlocked: null,
  stillActive: null,
};
const response = (value: unknown) => ({
  status: "completed",
  output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }],
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
/** Synthetic examples test boundary normalization; these are not real messages or an accuracy evaluation. */
const cases: Array<[string, Partial<ReportExtraction>]> = [
  ["Hay un huaico", { type: "huaico", stillActive: true }],
  ["Veo un derrumbe", { type: "derrumbe", stillActive: true }],
  ["La vía está inundada", { type: "inundación", stillActive: true }],
  ["Hay un bloqueo", { type: "bloqueo", stillActive: true }],
  ["Veo un accidente", { type: "accidente", stillActive: true }],
  ["Están haciendo obras", { type: "obra", stillActive: true }],
  ["Hay barro sobre la pista", { type: "otro", stillActive: true }],
  ["Un derrumbe en Matucana", { type: "derrumbe", placeText: "Matucana" }],
  ["Un huaico en el km 74", { type: "huaico", kilometer: 74 }],
  ["Derrumbe, un carril bloqueado", { type: "derrumbe", lanesBlocked: 1 }],
  ["El bloqueo ya terminó", { type: "bloqueo", stillActive: false }],
  ["Ayer hubo un derrumbe", { type: "derrumbe", stillActive: false }],
  ["Derrumbe hacia Lima", { type: "derrumbe", direction: "hacia_lima" }],
  ["No puedo precisar qué pasó", {}],
  ["Hay un derrumbe en Chosica", { type: "derrumbe", placeText: "Chosica", stillActive: true }],
];
beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());
it.each(cases)("validates the synthetic extraction fixture: %s", async (text, fields) => {
  const value = { ...base, ...fields };
  const extractor = createOpenAiReportExtractor(config, { fetchImpl: async () => json(response(value)) });
  expect(await extractor.extract(text, "req")).toEqual(value);
});
it.each([
  { ...base, type: "probability" },
  { ...base, lanesBlocked: 999 },
  { ...base, severity: 0 },
  { ...base, phone: "forbidden" },
  null,
])("rejects invalid model output", async (value) => {
  expect(
    await createOpenAiReportExtractor(config, { fetchImpl: async () => json(response(value)) }).extract("Hay un derrumbe", "req"),
  ).toBeNull();
});
it("rejects an invented place and sends only redacted, unlinked text", async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => json(response({ ...base, type: "derrumbe", placeText: "Invented town" })));
  const output = await createOpenAiReportExtractor(config, { fetchImpl }).extract("Hay un derrumbe, contacto +51 900 000 000", "req");
  expect(output?.placeText).toBeNull();
  const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as { input: string; store: boolean };
  expect(body.input).not.toContain("900");
  expect(body.store).toBe(false);
});
it.each([429, 500])("offers fallback without retrying a billable HTTP %s", async (status) => {
  const fetchImpl = vi.fn(async () => json({}, status));
  expect(await createOpenAiReportExtractor(config, { fetchImpl }).extract("Hay un derrumbe", "req")).toBeNull();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it("bounds a timed-out extraction", async () => {
  const fetchImpl: typeof fetch = async (_url, init) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
  expect(await createOpenAiReportExtractor(config, { fetchImpl, timeoutMs: 1 }).extract("Hay un derrumbe", "req")).toBeNull();
});
