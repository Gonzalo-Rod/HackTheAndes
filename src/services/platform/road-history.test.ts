import { beforeEach, expect, it, vi } from "vitest";
import { RoadHistoryResponseSchema } from "@/contracts/road-history";
import { readNationalRoadHistory } from "./road-history";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@peruroad/road-data/road-history", async (original) => {
  const actual = await original<typeof import("@peruroad/road-data/road-history")>();
  mocks.read.mockImplementation(actual.readBundledNationalRoadEvents);
  return { readBundledNationalRoadEvents: mocks.read };
});
const request = () => new Request("https://example.test/api/history/road-events");
beforeEach(() => vi.clearAllMocks());

it("serves the validated nationwide capture labeled as an incomplete snapshot", async () => {
  const response = await readNationalRoadHistory(request());
  const value = RoadHistoryResponseSchema.parse(await response.json());
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(value.meta).toMatchObject({ state: "snapshot", capturedAt: value.data.capturedAt });
  expect(value.data.coverage).toBe("incomplete");
  expect(new Set(value.data.events.map((e) => e.roadCode)).size).toBeGreaterThan(50);
});

it("returns a safe 503 without file or validation details when the bundle is unreadable", async () => {
  mocks.read.mockRejectedValueOnce(new Error("ENOENT /var/task/data/events/national-events.json"));
  const response = await readNationalRoadHistory(request());
  expect(response.status).toBe(503);
  const body = JSON.stringify(await response.json());
  expect(body).toContain("service_unavailable");
  expect(body).not.toContain("ENOENT");
});
