import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("./runtime", () => ({ runAlertEvaluation: vi.fn() }));
vi.mock("@/services/route-watch/source-change", () => ({ evaluateRouteWatchSafely: vi.fn() }));
import { after } from "next/server";
import { runAlertEvaluation } from "./runtime";
import { evaluateRouteWatchSafely } from "@/services/route-watch/source-change";
import { evaluateAlertsAfterChange } from "./after-change";
afterEach(() => vi.resetAllMocks());
it("starts a source-change evaluation after the response and lets failures fall back to reconciliation", async () => {
  let work: (() => Promise<void>) | undefined;
  vi.mocked(after).mockImplementation((callback) => {
    work = callback as () => Promise<void>;
  });
  vi.mocked(runAlertEvaluation).mockRejectedValue(new Error("Unavailable"));
  evaluateAlertsAfterChange("synthetic-request");
  expect(runAlertEvaluation).not.toHaveBeenCalled();
  expect(work).toBeDefined();
  await work?.();
  expect(runAlertEvaluation).toHaveBeenCalledWith("synthetic-request");
  // A failed driver-alert run still lets route watch call the monitor.
  expect(evaluateRouteWatchSafely).toHaveBeenCalledWith("synthetic-request");
});
it("preserves an accepted publication if background scheduling is unavailable", () => {
  vi.mocked(after).mockImplementation(() => {
    throw new Error("Runtime unavailable");
  });
  expect(() => evaluateAlertsAfterChange("synthetic-request")).not.toThrow();
});
