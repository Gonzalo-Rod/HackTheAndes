import { it, expect, vi } from "vitest";
vi.mock("@/config/env", () => ({
  loadNotificationConfiguration: () => ({ jobSecret: "synthetic-job-secret" }),
  loadPlatformConfiguration: vi.fn(),
  loadZavuConfiguration: vi.fn(),
  loadGeometryRevision: vi.fn(),
}));
import { evaluateAlerts, refreshClimate } from "./jobs";
it.each([evaluateAlerts, refreshClimate])("rejects unauthenticated internal jobs before reading or sending", async (handler) => {
  const response = await handler(new Request("https://example.test/api/jobs/alerts", { method: "POST" }));
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } });
});
