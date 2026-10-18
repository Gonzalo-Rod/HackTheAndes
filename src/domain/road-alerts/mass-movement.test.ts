import { describe, expect, it } from "vitest";
import { haversineKm } from "@/domain/geo/measure";
import { canonicalRoadCode, circleRing, clipLineToCircle, massMovementKind } from "./mass-movement";

const text = (title: string, description = "", currentSituation = "") => ({ title, description, currentSituation });

describe("massMovementKind", () => {
  it.each([
    ["Huayco en el KM 80", "huaico"],
    ["HUAICOS EN LA VÍA", "huaico"],
    ["Deslizamiento de roca en el KM 770 + 800", "deslizamiento"],
    ["derrumbe · no confirmado · DEMO", "derrumbe"],
    ["Caída de rocas km 95", "derrumbe"],
  ])("classifies %s as %s", (title, kind) => {
    expect(massMovementKind(text(title))).toBe(kind);
  });

  it("prefers huaico when a text names several kinds and reads description and situation", () => {
    expect(massMovementKind(text("Derrumbe", "tras un huaico"))).toBe("huaico");
    expect(massMovementKind(text("Vía restringida", "", "deslizamiento activo"))).toBe("deslizamiento");
  });

  it("ignores unrelated alerts and partial words", () => {
    expect(massMovementKind(text("Choque frontal de vehiculos KM 353"))).toBeNull();
    expect(massMovementKind(text("Huaicoloro district office"))).toBeNull();
  });
});

describe("circleRing", () => {
  it("returns a closed ring at the requested geodesic radius", () => {
    const ring = circleRing([-76.3, -11.8], 5, 32);
    expect(ring).toHaveLength(33);
    expect(ring[0]?.[0]).toBeCloseTo(ring[32]?.[0] ?? 0, 9);
    for (const point of ring) expect(haversineKm([-76.3, -11.8], point)).toBeCloseTo(5, 3);
  });

  it("rejects invalid radii and too few steps", () => {
    expect(() => circleRing([0, 0], 0)).toThrow(RangeError);
    expect(() => circleRing([0, 0], 1, 4)).toThrow(RangeError);
  });
});

describe("road highlighting helpers", () => {
  it("compares SUTRAN and MTC road codes without leading zeros", () => {
    expect(canonicalRoadCode("PE-02")).toBe("PE-2");
    expect(canonicalRoadCode(" pe-1s ")).toBe("PE-1S");
    expect(canonicalRoadCode("PE-22")).toBe("PE-22");
    expect(canonicalRoadCode("PE-10A")).toBe("PE-10A");
  });

  it("clips a crossing line at the circle boundary", () => {
    const center: [number, number] = [0, 0];
    const parts = clipLineToCircle(
      [
        [-0.2, 0],
        [0, 0],
        [0.2, 0],
      ],
      center,
      5,
    );
    expect(parts).toHaveLength(1);
    const [part] = parts;
    expect(haversineKm(center, part?.[0] ?? [9, 9])).toBeCloseTo(5, 2);
    expect(haversineKm(center, part?.at(-1) ?? [9, 9])).toBeCloseTo(5, 2);
    expect(part).toContainEqual([0, 0]);
  });

  it("splits a line that leaves and re-enters, and drops lines outside", () => {
    const zigzag: [number, number][] = [
      [0, 0],
      [0.2, 0],
      [0.01, 0.01],
    ];
    expect(clipLineToCircle(zigzag, [0, 0], 5)).toHaveLength(2);
    expect(
      clipLineToCircle(
        [
          [1, 1],
          [1.1, 1],
        ],
        [0, 0],
        5,
      ),
    ).toEqual([]);
  });
});
