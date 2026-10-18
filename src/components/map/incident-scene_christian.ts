import * as THREE from "three";

import type { IncidentAnimationKind } from "./incident-animation";
import { buildIncidentEnvironment, createDustTexture, createRockGeometry, createStoneMaterial } from "./incident-scene-assets_christian";
import { createIncidentEffects } from "./incident-scene-effects_christian";
import { createRockfallSimulation, MAX_ROCKS, type RockfallSimulation } from "./incident-simulation_christian";

export interface IncidentSceneHandle {
  setPlaying(playing: boolean): void;
  reset(): void;
  dispose(): void;
}

// Limit the second WebGL scene to 30 fps so the underlying map stays responsive.
const FRAME_INTERVAL_MS = 1000 / 30;
const MAX_FRAME_DELTA_SEC = 0.08;
const DUST_SPRITES = 72;
const DUST_LIFETIME_SEC = 1.8;

function makeLighting(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xd7e7f1, 0x62523b, 2.15));
  const sun = new THREE.DirectionalLight(0xffe7c4, 3.2);
  sun.position.set(-9, 22, -10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -21, right: 21, top: 21, bottom: -21, near: 0.5, far: 65 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
}

function createMovingRocks(scene: THREE.Scene) {
  const stone = createStoneMaterial();
  const meshes = Array.from({ length: MAX_ROCKS }, (_, index) => {
    const material = stone.material.clone();
    material.transparent = true;
    const rock = new THREE.Mesh(createRockGeometry(index + 1), material);
    rock.castShadow = true;
    rock.receiveShadow = true;
    rock.visible = false;
    scene.add(rock);
    return rock;
  });
  return {
    update(simulation: RockfallSimulation) {
      for (const body of simulation.rocks) {
        const mesh = meshes[body.id];
        if (!mesh) continue;
        mesh.visible = body.active;
        mesh.position.set(body.position.x, body.position.y, body.position.z);
        mesh.rotation.set(body.rotation.x, body.rotation.y, body.rotation.z);
        mesh.scale.setScalar(body.radius);
        mesh.material.opacity = body.opacity;
      }
    },
    dispose() {
      for (const mesh of meshes) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      stone.dispose();
    },
  };
}

function createImpactDust(scene: THREE.Scene) {
  const texture = createDustTexture();
  const sprites = Array.from({ length: DUST_SPRITES }, () => {
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    scene.add(sprite);
    return sprite;
  });
  return {
    update(simulation: RockfallSimulation) {
      for (const sprite of sprites) sprite.visible = false;
      const impacts = simulation.impacts.slice(-DUST_SPRITES / 4);
      impacts.forEach((impact, index) => {
        for (let puff = 0; puff < 4; puff++) {
          const sprite = sprites[index * 4 + puff];
          const age = impact.ageSec;
          const progress = age / DUST_LIFETIME_SEC;
          const angle = impact.id * 2.37 + puff * 1.57;
          const spread = age * (0.45 + impact.strength * 1.6);
          sprite.visible = true;
          sprite.position.set(
            impact.position.x + Math.cos(angle) * spread,
            impact.position.y + 0.14 + age * (0.4 + puff * 0.08),
            impact.position.z + Math.sin(angle) * spread,
          );
          sprite.scale.setScalar(0.6 + age * 1.9 + impact.strength * 0.65);
          sprite.material.opacity = Math.sin(Math.PI * Math.min(1, progress)) * (1 - progress) * (0.25 + impact.strength * 0.4);
          sprite.material.rotation = angle + age * 0.12;
        }
      });
    },
    dispose() {
      for (const sprite of sprites) {
        sprite.removeFromParent();
        sprite.material.dispose();
      }
      texture.dispose();
    },
  };
}

function initializeScene(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  canvas: HTMLCanvasElement,
  kind: IncidentAnimationKind,
): IncidentSceneHandle {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  scene.background = new THREE.Color(0xb8cbd3);
  scene.fog = new THREE.Fog(0xb8cbd3, 29, 105);
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 180);
  camera.position.set(13, 10, -18);
  camera.lookAt(0, 4, 4);
  makeLighting(scene);
  const environment = buildIncidentEnvironment(scene);
  const effects = createIncidentEffects(scene, kind);
  const hasRockfall = kind === "rockslide" || kind === "debris-flow";
  const rocks = hasRockfall ? createMovingRocks(scene) : null;
  const dust = hasRockfall ? createImpactDust(scene) : null;
  let simulation = createRockfallSimulation();
  let elapsedSec = 0;
  let previousMs = 0;
  let playing = false;
  let disposed = false;

  function draw(deltaSec: number): void {
    if (hasRockfall) {
      simulation.update(elapsedSec, deltaSec);
      rocks?.update(simulation);
      dust?.update(simulation);
    }
    effects.update(elapsedSec, deltaSec);
    renderer.render(scene, camera);
  }

  function frame(nowMs: number): void {
    if (!playing || disposed || document.hidden) return;
    if (previousMs && nowMs - previousMs < FRAME_INTERVAL_MS) return;
    const deltaSec = previousMs ? Math.min((nowMs - previousMs) / 1000, MAX_FRAME_DELTA_SEC) : FRAME_INTERVAL_MS / 1000;
    previousMs = nowMs;
    elapsedSec += deltaSec;
    draw(deltaSec);
  }

  function updateLoop(): void {
    previousMs = 0;
    renderer.setAnimationLoop(playing && !document.hidden ? frame : null);
  }

  function resize(): void {
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, bounds.width || 420);
    const height = Math.max(1, bounds.height || 236);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    draw(0);
  }

  // Render before attaching observers so failed initialization leaves no live callbacks.
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  document.addEventListener("visibilitychange", updateLoop);
  return {
    setPlaying(value) {
      if (disposed) return;
      playing = value;
      updateLoop();
    },
    reset() {
      if (disposed) return;
      elapsedSec = 0;
      previousMs = 0;
      simulation = createRockfallSimulation();
      draw(0);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      playing = false;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      document.removeEventListener("visibilitychange", updateLoop);
      effects.dispose();
      rocks?.dispose();
      dust?.dispose();
      environment.dispose();
      for (const child of scene.children) if (child instanceof THREE.DirectionalLight) child.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      scene.clear();
    },
  };
}

export function createIncidentScene(canvas: HTMLCanvasElement, kind: IncidentAnimationKind): IncidentSceneHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "low-power" });
  const scene = new THREE.Scene();
  try {
    return initializeScene(renderer, scene, canvas, kind);
  } catch (error: unknown) {
    // Constructors can fail before their resource owners return a disposal handle.
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    scene.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Points ||
        object instanceof THREE.LineSegments ||
        object instanceof THREE.Sprite
      ) {
        if ("geometry" in object) object.geometry.dispose();
        const surfaces = Array.isArray(object.material) ? object.material : [object.material];
        for (const surface of surfaces) materials.add(surface);
      }
      if (object instanceof THREE.DirectionalLight) object.shadow.dispose();
    });
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      material.dispose();
    }
    for (const texture of textures) texture.dispose();
    scene.clear();
    renderer.dispose();
    renderer.forceContextLoss();
    throw new Error("Could not initialize the incident simulation", { cause: error });
  }
}
