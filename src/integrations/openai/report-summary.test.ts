import { it, expect, vi } from "vitest";
import { createReportSummary } from "./report-summary";
const facts = [{ id: "coverage", text: "Synthetic coverage fact" }];
function response(ids: string[]) {
  return new Response(
    JSON.stringify({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ ids }) }] }],
    }),
  );
}
it("accepts only unique IDs of calculated facts", async () => {
  for (const ids of [["coverage"], ["invented"], ["coverage", "coverage"]]) {
    const result = await createReportSummary(
      { apiKey: "s", model: "s" },
      { fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response(ids)) },
    )(facts, "r");
    expect(result).toEqual(ids.length === 1 && ids[0] === "coverage" ? ids : null);
  }
});
it.each([429, 500])("falls back without retrying a non-idempotent LLM request on %s", async (status) => {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status }));
  expect(await createReportSummary({ apiKey: "s", model: "s" }, { fetchImpl })(facts, "r")).toBeNull();
  expect(fetchImpl).toHaveBeenCalledOnce();
});
it("falls back on an LLM timeout", async () => {
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
    async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("Synthetic timeout")));
      }),
  );
  expect(await createReportSummary({ apiKey: "s", model: "s" }, { fetchImpl, timeoutMs: 5 })(facts, "r")).toBeNull();
});
