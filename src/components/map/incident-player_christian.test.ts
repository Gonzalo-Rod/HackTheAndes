import { beforeEach, describe, expect, it, vi } from "vitest";

import { createIncidentPlayer, type IncidentPlaybackState } from "./incident-player_christian";

const renderer = vi.hoisted(() => ({
  createIncidentScene: vi.fn(),
  setPlaying: vi.fn(),
  reset: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("./incident-scene_christian", () => ({ createIncidentScene: renderer.createIncidentScene }));

const canvas = new EventTarget() as HTMLCanvasElement;

beforeEach(() => {
  vi.resetAllMocks();
  renderer.createIncidentScene.mockReturnValue({
    setPlaying: renderer.setPlaying,
    reset: renderer.reset,
    dispose: renderer.dispose,
  });
});

describe("lazy incident player lifecycle", () => {
  it("cancels renderer creation when the marker is removed before its import resolves", async () => {
    const onState = vi.fn();
    const player = createIncidentPlayer(canvas, "rockslide", true, onState);
    player.dispose();
    await vi.dynamicImportSettled();
    expect(renderer.createIncidentScene).not.toHaveBeenCalled();
    expect(onState.mock.calls).toEqual([["loading"]]);
  });

  it("starts paused when requested and reports explicit play and pause changes", async () => {
    const states: IncidentPlaybackState[] = [];
    const player = createIncidentPlayer(canvas, "rockslide", false, (state) => states.push(state));
    await vi.dynamicImportSettled();
    expect(renderer.createIncidentScene).toHaveBeenCalledWith(canvas, "rockslide");
    expect(renderer.setPlaying).toHaveBeenLastCalledWith(false);
    expect(states).toEqual(["loading", "paused"]);
    player.setPlaying(true);
    expect(renderer.setPlaying).toHaveBeenLastCalledWith(true);
    player.setPlaying(false);
    expect(renderer.setPlaying).toHaveBeenLastCalledWith(false);
    expect(states).toEqual(["loading", "paused", "playing", "paused"]);
    player.dispose();
  });

  it("retains play changes made while the renderer is still loading", async () => {
    const onState = vi.fn();
    const player = createIncidentPlayer(canvas, "rain", true, onState);
    player.setPlaying(false);
    await vi.dynamicImportSettled();
    expect(renderer.setPlaying.mock.calls).toEqual([[false]]);
    expect(onState.mock.calls).toEqual([["loading"], ["paused"]]);
    player.dispose();
  });

  it("replays by resetting the scene and resuming playback", async () => {
    const onState = vi.fn();
    const player = createIncidentPlayer(canvas, "rockslide", false, onState);
    await vi.dynamicImportSettled();
    player.replay();
    expect(renderer.reset).toHaveBeenCalledOnce();
    expect(renderer.setPlaying).toHaveBeenLastCalledWith(true);
    expect(renderer.reset.mock.invocationCallOrder[0]).toBeLessThan(renderer.setPlaying.mock.invocationCallOrder[1] ?? 0);
    expect(onState).toHaveBeenLastCalledWith("playing");
    player.dispose();
  });

  it("disposes a loaded scene once and ignores subsequent control calls", async () => {
    const onState = vi.fn();
    const player = createIncidentPlayer(canvas, "rockslide", true, onState);
    await vi.dynamicImportSettled();
    player.dispose();
    player.dispose();
    player.replay();
    player.setPlaying(false);
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(renderer.reset).not.toHaveBeenCalled();
    expect(renderer.setPlaying.mock.calls).toEqual([[true]]);
    expect(onState.mock.calls).toEqual([["loading"], ["playing"]]);
  });

  it("reports renderer initialization failure without rejecting the lazy import", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    renderer.createIncidentScene.mockImplementation(() => {
      throw new Error("WebGL is unavailable");
    });
    try {
      const onState = vi.fn();
      const player = createIncidentPlayer(canvas, "rockslide", true, onState);
      await expect(vi.dynamicImportSettled()).resolves.toBeUndefined();
      expect(onState.mock.calls).toEqual([["loading"], ["unavailable"]]);
      expect(warning).toHaveBeenCalledWith(
        JSON.stringify({ operation: "map.incidentAnimation", result: "unavailable", errorType: "Error" }),
      );
      expect(renderer.setPlaying).not.toHaveBeenCalled();
      player.dispose();
    } finally {
      warning.mockRestore();
    }
  });

  it("reports lost GPU context and resumes the requested state after restoration", async () => {
    const onState = vi.fn();
    const player = createIncidentPlayer(canvas, "rockslide", true, onState);
    await vi.dynamicImportSettled();
    const loss = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(loss);
    expect(loss.defaultPrevented).toBe(true);
    expect(renderer.setPlaying).toHaveBeenLastCalledWith(false);
    expect(onState).toHaveBeenLastCalledWith("unavailable");
    player.setPlaying(false);
    player.replay();
    expect(onState).toHaveBeenLastCalledWith("unavailable");
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(renderer.setPlaying).toHaveBeenLastCalledWith(true);
    expect(onState).toHaveBeenLastCalledWith("playing");
    player.dispose();
    const statesBefore = onState.mock.calls.length;
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(onState.mock.calls).toHaveLength(statesBefore);
  });
});
