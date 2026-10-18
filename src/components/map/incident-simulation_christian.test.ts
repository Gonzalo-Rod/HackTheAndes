import { describe, expect, it } from "vitest";

import { cliffHeight, createRockfallSimulation, MAX_ROCKS } from "./incident-simulation_christian";

describe("continuous rockfall simulation", () => {
  it("starts with moving rocks and carries them from the cliff onto the road", () => {
    const simulation = createRockfallSimulation();
    const initial = simulation.rocks.find((rock) => rock.active && rock.position.z > 3);
    expect(initial).toBeDefined();
    const initialZ = initial?.position.z ?? 0;
    simulation.update(0.3, 0.3);
    expect(initial?.position.z).toBeLessThan(initialZ);
    simulation.update(4, 3.7);
    expect(simulation.rocks.some((rock) => rock.active && rock.position.z < 2.5)).toBe(true);
    expect(simulation.impacts.length).toBeGreaterThan(0);
  });

  it("keeps every active rock above its terrain contact surface", () => {
    const simulation = createRockfallSimulation(91);
    for (let frame = 1; frame <= 1200; frame++) {
      simulation.update(frame / 60, 1 / 60);
      for (const rock of simulation.rocks) {
        if (!rock.active) continue;
        expect(rock.position.y).toBeGreaterThanOrEqual(cliffHeight(rock.position.z) + rock.radius - 1e-8);
        expect(Number.isFinite(rock.rotation.x)).toBe(true);
      }
    }
  });

  it("dissipates impact energy and brings road rocks to rest", () => {
    const simulation = createRockfallSimulation();
    simulation.update(8, 8);
    const settled = simulation.rocks.filter((rock) => rock.active && rock.ageSec > 7 && rock.position.z <= 2.7);
    expect(settled.length).toBeGreaterThan(0);
    expect(settled.every((rock) => Math.hypot(rock.velocity.x, rock.velocity.y, rock.velocity.z) < 0.08)).toBe(true);
  });

  it("stops fast grounded rocks from tunneling through the foreground guardrail", () => {
    const simulation = createRockfallSimulation();
    const rock = simulation.rocks.find((body) => body.active);
    if (!rock) throw new Error("Expected a prewarmed active rock");
    rock.radius = 0.5;
    rock.position = { x: 0, y: 0.5, z: -2.3 };
    rock.velocity = { x: 1, y: 0, z: -80 };
    simulation.update(1 / 120, 1 / 120);
    expect(rock.position.z - rock.radius).toBeGreaterThanOrEqual(-3.05);
    expect(rock.velocity.z).toBeGreaterThan(0);
    expect(rock.velocity.z).toBeLessThan(80 * 0.2);
  });

  it("fades high rocks that clear the rail before removing them from the foreground", () => {
    const simulation = createRockfallSimulation();
    const rock = simulation.rocks.find((body) => body.active);
    if (!rock) throw new Error("Expected a prewarmed active rock");
    rock.radius = 0.5;
    rock.ageSec = 1;
    rock.position = { x: 0, y: 4, z: -2.8 };
    rock.velocity = { x: 0, y: 0, z: -8 };
    simulation.update(0.2, 0.2);
    expect(rock.active).toBe(true);
    expect(rock.position.z).toBeLessThan(-4);
    expect(rock.opacity).toBeGreaterThan(0);
    expect(rock.opacity).toBeLessThan(1);
    const fadingOpacity = rock.opacity;
    simulation.update(0.3, 0.1);
    expect(rock.opacity).toBeLessThan(fadingOpacity);
    simulation.update(0.5, 0.2);
    expect(rock.active).toBe(false);
    expect(rock.opacity).toBe(0);
  });

  it("continues emitting after a minute, including after a dropped frame", () => {
    const simulation = createRockfallSimulation();
    simulation.update(60, 1 / 60);
    expect(simulation.rocks.filter((rock) => rock.active).length).toBeLessThanOrEqual(MAX_ROCKS);
    const newborn = simulation.rocks.find((rock) => rock.active && rock.ageSec < 0.8);
    expect(newborn).toBeDefined();
    const positionZ = newborn?.position.z ?? 0;
    simulation.update(60.2, 0.2);
    expect(newborn?.position.z).toBeLessThan(positionZ);
  });

  it("replays deterministically regardless of the rendering frame boundaries", () => {
    const first = createRockfallSimulation(123);
    const second = createRockfallSimulation(123);
    for (let frame = 1; frame <= 600; frame++) first.update(frame / 60, 1 / 60);
    second.update(10, 10);
    expect(first.rocks).toEqual(second.rocks);
    expect(first.impacts).toEqual(second.impacts);
  });

  it("ignores invalid timing without damaging the current frame", () => {
    const simulation = createRockfallSimulation();
    const before = structuredClone(simulation.rocks);
    simulation.update(Number.NaN, 1 / 60);
    simulation.update(1, -1);
    expect(simulation.rocks).toEqual(before);
  });
});
