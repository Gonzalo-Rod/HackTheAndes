import type { RoadAlert } from "@/contracts/road-alerts";

import { getIncidentAnimation } from "./incident-animation";
import { createIncidentPlayer, type IncidentPlaybackState, type IncidentPlayer } from "./incident-player_christian";

export interface IncidentPreview {
  element: HTMLDivElement;
  update(alert: RoadAlert): void;
  show(): void;
  hide(): void;
  replay(): void;
  dispose(): void;
}

function createPreviewCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = "pr-marker__scene-canvas";
  canvas.setAttribute("aria-hidden", "true");
  return canvas;
}

export function createIncidentPreview(alert: RoadAlert): IncidentPreview {
  let animation = getIncidentAnimation(alert);
  let player: IncidentPlayer | null = null;
  let playback: IncidentPlaybackState = "loading";
  const element = document.createElement("div");
  element.className = "pr-marker__scene";
  element.hidden = true;
  element.setAttribute("role", "region");
  element.setAttribute("aria-label", "Simulación ilustrativa del tipo de incidente");
  element.addEventListener("click", (event) => event.stopPropagation());
  element.addEventListener("dblclick", (event) => event.stopPropagation());
  element.addEventListener("pointerdown", (event) => event.stopPropagation());
  element.addEventListener("wheel", (event) => event.stopPropagation());

  const heading = document.createElement("div");
  heading.className = "pr-marker__scene-heading";
  const badge = document.createElement("span");
  badge.className = "pr-marker__scene-badge";
  badge.textContent = "SIMULACIÓN 3D";
  const title = document.createElement("strong");
  title.className = "pr-marker__scene-title";
  title.textContent = animation.label;
  const location = document.createElement("span");
  location.className = "pr-marker__scene-location";
  location.textContent = [alert.roadCode, alert.kmText].filter(Boolean).join(" · ");
  heading.append(badge, title, location);

  const viewport = document.createElement("div");
  viewport.className = "pr-marker__scene-viewport";
  let canvas = createPreviewCanvas();
  const fallback = document.createElement("span");
  fallback.className = "pr-marker__scene-fallback";
  viewport.append(canvas, fallback);

  const toolbar = document.createElement("div");
  toolbar.className = "pr-marker__scene-toolbar";
  const status = document.createElement("span");
  status.className = "pr-marker__scene-status";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "pr-marker__scene-control";
  toggle.textContent = "Pausar";
  const replay = document.createElement("button");
  replay.type = "button";
  replay.className = "pr-marker__scene-control";
  replay.textContent = "Repetir";
  toggle.addEventListener("click", () => player?.setPlaying(playback !== "playing"));
  replay.addEventListener("click", () => player?.replay());
  toolbar.append(status, toggle, replay);
  const note = document.createElement("span");
  note.className = "pr-marker__scene-note";
  note.textContent = "Recreación del tipo de riesgo · no es una grabación del incidente";
  element.append(heading, viewport, toolbar, note);

  function onState(state: IncidentPlaybackState): void {
    playback = state;
    element.dataset.playback = state;
    const unavailable = state === "unavailable";
    const loading = state === "loading";
    fallback.hidden = !unavailable && !loading;
    fallback.textContent = unavailable ? "La animación 3D no está disponible en este navegador." : "Preparando escena 3D…";
    canvas.style.visibility = unavailable || loading ? "hidden" : "visible";
    status.textContent = loading ? "Cargando…" : unavailable ? "3D no disponible" : state === "playing" ? "En reproducción" : "En pausa";
    toggle.textContent = state === "playing" ? "Pausar" : "Reproducir";
    toggle.disabled = replay.disabled = loading || unavailable;
    toggle.setAttribute("aria-pressed", String(state === "playing"));
  }

  function show(): void {
    element.hidden = false;
    if (player) return;
    const initiallyPlaying = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    player = createIncidentPlayer(canvas, animation.kind, initiallyPlaying, onState);
  }

  function hide(): void {
    element.hidden = true;
    if (!player) return;
    player.dispose();
    player = null;
    // A disposed WebGL context belongs to its old canvas; a new selection gets a fresh one.
    const replacement = createPreviewCanvas();
    canvas.replaceWith(replacement);
    canvas = replacement;
  }

  return {
    element,
    update(next) {
      const nextAnimation = getIncidentAnimation(next);
      title.textContent = nextAnimation.label;
      location.textContent = [next.roadCode, next.kmText].filter(Boolean).join(" · ");
      if (nextAnimation.kind !== animation.kind) {
        const visible = !element.hidden;
        hide();
        animation = nextAnimation;
        if (visible) show();
      }
    },
    show,
    hide,
    replay() {
      show();
      player?.replay();
    },
    dispose() {
      hide();
      element.remove();
    },
  };
}
