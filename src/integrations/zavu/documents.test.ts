import { it, expect, vi } from "vitest";
import { createZavuPdfSender } from "./documents";
const input = {
  to: "US.synthetic-pdf",
  mediaUrl: "https://example.test/report.pdf",
  filename: "report.pdf",
  caption: "Synthetic DEMO PDF",
  idempotencyKey: "synthetic-pdf-key",
  requestId: "synthetic-request",
};
it.each([500, 429])("retries idempotently after %s without channel fallback", async (status) => {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response("{}", { status }))
    .mockResolvedValue(new Response(JSON.stringify({ message: { id: "synthetic" } })));
  const result = await createZavuPdfSender({ apiKey: "synthetic", senderId: "synthetic" }, { fetchImpl, sleep: async () => {} }).sendPdf(
    input,
  );
  expect(result.ok).toBe(true);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
  expect(body).toMatchObject({ messageType: "document", fallbackEnabled: false, idempotencyKey: input.idempotencyKey });
});
it("times out with a retryable failure and handles a closed conversation window", async () => {
  const timeout = vi.fn<typeof fetch>().mockImplementation(
    async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("Synthetic timeout")));
      }),
  );
  expect(
    await createZavuPdfSender({ apiKey: "s", senderId: "s" }, { fetchImpl: timeout, timeoutMs: 5, sleep: async () => {} }).sendPdf(input),
  ).toEqual({ ok: false, error: "unavailable" });
  expect(timeout).toHaveBeenCalledTimes(3);
  const closed = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ code: "whatsapp_window_closed" }), { status: 400 }));
  expect(await createZavuPdfSender({ apiKey: "s", senderId: "s" }, { fetchImpl: closed }).sendPdf(input)).toEqual({
    ok: false,
    error: "window_closed",
  });
});
