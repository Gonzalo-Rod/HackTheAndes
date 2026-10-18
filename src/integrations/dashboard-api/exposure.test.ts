import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { createExposureView, readBundledExposure } from "@peruroad/road-data/exposure";
import type { ExposureLayer } from "@/contracts/exposure";
import { fetchExposure } from "./client";

let currentView: ExposureLayer;
beforeAll(async () => {
  const record = await readBundledExposure();
  currentView = createExposureView(record.assessment, Date.parse(record.assessment.assessedAt) + 1000, "database", 72, true);
});
afterEach(() => vi.unstubAllGlobals());

it("accepts the current v2 assessment through the browser API adapter", async () => {
  const fetchImpl = vi.fn(async () => Response.json(currentView));
  vi.stubGlobal("fetch", fetchImpl);
  const view = await fetchExposure("PE-22");
  expect(view.data.policy.version).toBe("climate-exposure-v2");
  expect(view.data.policy.minimumLocalSusceptibilityClass).toBeDefined();
  expect(view.meta.operationallyUsable).toBe(true);
  expect(fetchImpl).toHaveBeenCalledWith("/api/exposure?horizonHours=72&road=PE-22", expect.any(Object));
});

it("still rejects v2 data missing its required terrain rule rather than bypassing validation", async () => {
  const invalid = structuredClone(currentView);
  delete invalid.data.policy.minimumLocalSusceptibilityClass;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(invalid)),
  );
  await expect(fetchExposure("PE-22")).rejects.toMatchObject({ kind: "invalid_body", provider: "dashboard-api" });
});
