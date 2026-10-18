import { beforeEach, it, expect, vi } from "vitest";
vi.mock("@/config/env", () => ({
  loadNotificationConfiguration: () => ({ jobSecret: "synthetic-job-secret" }),
  loadPlatformConfiguration: () => ({ SESSION_SIGNING_SECRET: "synthetic-signing-secret" }),
  loadGeometryRevision: vi.fn(),
}));
const { pdf } = vi.hoisted(() => ({ pdf: vi.fn() }));
vi.mock("@/db/pool", () => ({ database: vi.fn() }));
vi.mock("@/db/weekly-pdf", () => ({ createWeeklyPdfRepository: () => ({ pdf }) }));
vi.mock("./runtime", () => ({ weeklyRuntime: vi.fn() }));
import { runWeeklyReports, downloadWeeklyPdf } from "./routes";
it("rejects unsigned internal generation and unauthorized PDF retrieval", async () => {
  expect((await runWeeklyReports(new Request("https://example.test/api/jobs/weekly-reports", { method: "POST" }))).status).toBe(401);
  expect((await downloadWeeklyPdf(new Request("https://example.test/api/reports/pdf/12345678-1234-4234-8234-123456789abc"))).status).toBe(
    401,
  );
});
it("rejects malformed job bodies before initialization or delivery", async () => {
  const r = await runWeeklyReports(
    new Request("https://example.test/api/jobs/weekly-reports", {
      method: "POST",
      headers: { Authorization: "Bearer synthetic-job-secret", "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "send_everyone" }),
    }),
  );
  expect(r.status).toBe(400);
});

import { weeklyPdfUrl } from "@/integrations/security/weekly-pdf-access";
beforeEach(() => pdf.mockReset());
it("serves a signed PDF without caching and rejects a revoked file", async () => {
  const url = weeklyPdfUrl(
    "https://example.test",
    "12345678-1234-4234-8234-123456789abc",
    Date.now() + 3_600_000,
    "synthetic-signing-secret",
  );
  pdf.mockResolvedValue(Buffer.from("%PDF-synthetic"));
  const r = await downloadWeeklyPdf(new Request(url));
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toBe("application/pdf");
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect(await r.text()).toBe("%PDF-synthetic");
  pdf.mockResolvedValue(null);
  expect((await downloadWeeklyPdf(new Request(url))).status).toBe(404);
  expect((await downloadWeeklyPdf(new Request(url + "&id=extra"))).status).toBe(401);
});
