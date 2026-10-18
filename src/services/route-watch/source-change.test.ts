import { expect, it, vi } from "vitest";
vi.mock("./runtime", () => ({ createDefaultRouteWatchEvaluator: vi.fn() }));
import { evaluateRouteWatchSafely } from "./source-change";

it("returns the evaluation when route watch runs", async () => {
  const value = { officialState: "ready" as const, trips: [] };
  expect(await evaluateRouteWatchSafely("r", async () => value)).toEqual({ ok: true, value });
});

it("turns any failure into a value without leaking its message", async () => {
  const run = await evaluateRouteWatchSafely("r", async () => {
    throw new Error("column t.watch_until does not exist");
  });
  expect(run).toEqual({ ok: false, error: "route_watch_unavailable" });
});
