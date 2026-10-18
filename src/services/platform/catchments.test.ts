import { beforeEach, expect, it, vi } from "vitest";
import { CatchmentLayerSchema } from "@/contracts/catchments";
import { loadBundledCatchments } from "@peruroad/road-data/catchments";
import { readCatchmentLayer } from "./catchments";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/db/catchments", () => ({ readCatchmentSnapshot: mocks.read }));
beforeEach(() => mocks.read.mockReset());

it("serves validated database geometry without losing confidence or provenance", async () => {
  const snapshot = await loadBundledCatchments();
  mocks.read.mockResolvedValue(snapshot);
  const response = await readCatchmentLayer(new Request("https://example.test/api/catchments"));
  const value = CatchmentLayerSchema.parse(await response.json());
  expect(value.meta.state).toBe("database");
  expect(value.data).toEqual(snapshot);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

it("serves the dated bundled fallback when the database is down or empty", async () => {
  for (const result of [null, new Error("private database detail")]) {
    if (result instanceof Error) mocks.read.mockRejectedValueOnce(result);
    else mocks.read.mockResolvedValueOnce(result);
    const response = await readCatchmentLayer(new Request("https://example.test/api/catchments"));
    expect(response.status).toBe(200);
    const value = CatchmentLayerSchema.parse(await response.json());
    expect(value.meta.state).toBe("snapshot");
    expect(value.meta.message).toContain(value.data.preparedAt);
    expect(JSON.stringify(value)).not.toContain("private database detail");
    expect(value.data.features.every((feature) => feature.properties.lowConfidence)).toBe(true);
  }
});
