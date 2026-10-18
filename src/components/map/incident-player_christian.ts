import type { IncidentAnimationKind } from "./incident-animation";
import type { IncidentSceneHandle } from "./incident-scene_christian";

export type IncidentPlaybackState = "loading" | "playing" | "paused" | "unavailable";

export interface IncidentPlayer {
  setPlaying(playing: boolean): void;
  replay(): void;
  dispose(): void;
}

/** Load the WebGL renderer only for the selected alert and cancel stale selections. */
export function createIncidentPlayer(
  canvas: HTMLCanvasElement,
  kind: IncidentAnimationKind,
  initiallyPlaying: boolean,
  onState: (state: IncidentPlaybackState) => void,
): IncidentPlayer {
  let disposed = false;
  let scene: IncidentSceneHandle | null = null;
  let playing = initiallyPlaying;
  let contextLost = false;
  const onContextLost = (event: Event) => {
    if (disposed) return;
    event.preventDefault();
    contextLost = true;
    scene?.setPlaying(false);
    onState("unavailable");
  };
  const onContextRestored = () => {
    if (disposed || !scene) return;
    contextLost = false;
    scene.setPlaying(playing);
    onState(playing ? "playing" : "paused");
  };
  onState("loading");
  void import("./incident-scene_christian")
    .then(({ createIncidentScene }) => {
      if (disposed) return;
      scene = createIncidentScene(canvas, kind);
      canvas.addEventListener("webglcontextlost", onContextLost);
      canvas.addEventListener("webglcontextrestored", onContextRestored);
      scene.setPlaying(playing);
      onState(playing ? "playing" : "paused");
    })
    .catch((error: unknown) => {
      if (disposed) return;
      console.warn(
        JSON.stringify({
          operation: "map.incidentAnimation",
          result: "unavailable",
          errorType: error instanceof Error ? error.name : "UnknownError",
        }),
      );
      onState("unavailable");
    });
  return {
    setPlaying(value) {
      if (disposed) return;
      playing = value;
      if (contextLost) return;
      scene?.setPlaying(playing);
      if (scene) onState(playing ? "playing" : "paused");
    },
    replay() {
      if (disposed) return;
      playing = true;
      if (contextLost) return;
      scene?.reset();
      scene?.setPlaying(true);
      if (scene) onState("playing");
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      scene?.dispose();
      scene = null;
    },
  };
}
