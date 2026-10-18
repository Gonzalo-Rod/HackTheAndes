import * as THREE from "three";
import { cliffHeight } from "./incident-simulation_christian";

type Disposable = { dispose(): void };
type Surface = { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture };

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function canvasContext(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The incident scene requires a 2D texture context");
  return { canvas, context };
}

function surfaceTexture(asphalt: boolean): Surface {
  const size = 256;
  const { canvas, context } = canvasContext(size);
  const normal = canvasContext(size);
  const pixels = context.createImageData(size, size);
  const normals = normal.context.createImageData(size, size);
  const rng = random(asphalt ? 31 : 97);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      const grain = rng();
      const strata = Math.sin(y * 0.31 + Math.sin(x * 0.023) * 4);
      const variation = Math.sin(x * 0.09 + y * 0.045) * Math.cos(y * 0.13);
      const value = asphalt ? 27 + grain * 24 : 111 + grain * 39 + strata * 12 + variation * 15;
      heights[index] = grain * (asphalt ? 0.45 : 0.8) + (strata + variation) * 0.13;
      pixels.data.set([value * (asphalt ? 0.97 : 1.08), value, value * (asphalt ? 1.02 : 0.82), 255], index * 4);
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      const dx = heights[y * size + ((x + 1) % size)] - heights[index];
      const dy = heights[((y + 1) % size) * size + x] - heights[index];
      normals.data.set([128 - dx * 100, 128 - dy * 100, 245, 255], index * 4);
    }
  }
  context.putImageData(pixels, 0, 0);
  normal.context.putImageData(normals, 0, 0);
  context.strokeStyle = asphalt ? "rgba(9,11,12,.4)" : "rgba(45,38,29,.34)";
  context.lineWidth = asphalt ? 0.7 : 1.2;
  for (let crack = 0; crack < 16; crack++) {
    let x = rng() * size;
    let y = rng() * size;
    context.beginPath();
    context.moveTo(x, y);
    for (let step = 0; step < 10; step++) {
      x += (rng() - 0.42) * 17;
      y += 4 + rng() * 9;
      context.lineTo(x, y);
    }
    context.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(normal.canvas);
  for (const texture of [map, normalMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
  }
  return { map, normalMap };
}

/** Faceted geometry has different silhouettes and mass distribution for each stone. */
export function createRockGeometry(seed: number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const positions = geometry.getAttribute("position");
  const rng = random(seed * 71 + 13);
  const stretch = [0.85 + rng() * 0.45, 0.7 + rng() * 0.5, 0.85 + rng() * 0.35];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    // Position-derived distortion keeps duplicate face vertices joined.
    const shape = 0.87 + 0.18 * Math.sin(x * 5.3 + seed) * Math.cos(z * 4.1 - y * 3.7);
    positions.setXYZ(i, x * shape * stretch[0], y * shape * stretch[1], z * shape * stretch[2]);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createStoneMaterial(): { material: THREE.MeshStandardMaterial; dispose(): void } {
  const textures = surfaceTexture(false);
  const material = new THREE.MeshStandardMaterial({
    ...textures,
    color: 0xb8aa8f,
    roughness: 0.96,
    normalScale: new THREE.Vector2(0.6, 0.6),
    flatShading: true,
  });
  return {
    material,
    dispose() {
      material.dispose();
      textures.map.dispose();
      textures.normalMap.dispose();
    },
  };
}

export function createDustTexture(): THREE.CanvasTexture {
  const { canvas, context } = canvasContext(128);
  const gradient = context.createRadialGradient(64, 64, 1, 64, 64, 62);
  gradient.addColorStop(0, "rgba(210,188,153,.75)");
  gradient.addColorStop(0.32, "rgba(183,163,131,.48)");
  gradient.addColorStop(1, "rgba(166,144,112,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function cliffGeometry(): THREE.BufferGeometry {
  // End beyond the stone spawn range so the cut slope leaves a visible skyline.
  const geometry = new THREE.PlaneGeometry(86, 8.1, 108, 28);
  const positions = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = 6.75 - positions.getY(i);
    const toeFade = Math.min(1, Math.max(0, (z - 2.7) / 2));
    const fissure = Math.pow(Math.abs(Math.sin(x * 0.47 + z * 0.21)), 10) * 0.5;
    const irregularity = Math.sin(x * 0.71 + z * 1.13) * 0.24 + Math.cos(x * 1.91 - z * 0.83) * 0.16 - fissure;
    positions.setXYZ(i, x, cliffHeight(z) + irregularity * toeFade, z);
    uv.setXY(i, x / 8, z / 7);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function buildIncidentEnvironment(scene: THREE.Scene): { dispose(): void } {
  const group = new THREE.Group();
  group.name = "illustrative-Andean-road-environment";
  scene.add(group);
  const resources = new Set<Disposable>();
  const own = <T extends Disposable>(resource: T): T => {
    resources.add(resource);
    return resource;
  };
  const surface = (asphalt: boolean) => {
    const textures = surfaceTexture(asphalt);
    own(textures.map);
    own(textures.normalMap);
    return textures;
  };
  const stone = own(
    new THREE.MeshStandardMaterial({ ...surface(false), color: 0xc4b596, roughness: 0.97, normalScale: new THREE.Vector2(0.8, 0.8) }),
  );
  const asphalt = own(new THREE.MeshStandardMaterial({ ...surface(true), roughness: 0.95, normalScale: new THREE.Vector2(0.3, 0.3) }));
  const shoulder = own(new THREE.MeshStandardMaterial({ color: 0x8b795d, roughness: 1 }));
  const metal = own(new THREE.MeshStandardMaterial({ color: 0xabb0ad, metalness: 0.72, roughness: 0.42 }));
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    own(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const ground = add(new THREE.PlaneGeometry(100, 48), shoulder, 0, -0.05, 8);
  ground.rotation.x = -Math.PI / 2;
  const roadGeometry = new THREE.PlaneGeometry(88, 5);
  const roadUv = roadGeometry.getAttribute("uv");
  for (let i = 0; i < roadUv.count; i++) roadUv.setXY(i, roadUv.getX(i) * 26, roadUv.getY(i) * 2);
  const road = add(roadGeometry, asphalt, 0, 0.012, 0);
  road.rotation.x = -Math.PI / 2;
  add(cliffGeometry(), stone, 0, 0, 0);

  const yellow = own(new THREE.MeshStandardMaterial({ color: 0xd9bc53, roughness: 0.87 }));
  const white = own(new THREE.MeshStandardMaterial({ color: 0xd3d1bd, roughness: 0.91 }));
  for (const z of [-0.1, 0.1, -2.22, 2.22]) {
    const marking = add(new THREE.PlaneGeometry(88, Math.abs(z) < 1 ? 0.065 : 0.085), Math.abs(z) < 1 ? yellow : white, 0, 0.017, z);
    marking.rotation.x = -Math.PI / 2;
  }
  const beam = own(new THREE.BoxGeometry(88, 0.14, 0.1));
  for (const height of [0.68, 0.84]) add(beam, metal, 0, height, -3.05);
  const post = own(new THREE.BoxGeometry(0.1, 0.92, 0.12));
  const reflector = own(new THREE.MeshStandardMaterial({ color: 0xf0dfbd, roughness: 0.4 }));
  const reflectorGeometry = own(new THREE.BoxGeometry(0.075, 0.07, 0.02));
  for (let x = -42; x <= 42; x += 3.5) {
    add(post, metal, x, 0.42, -3.1).castShadow = true;
    add(reflectorGeometry, reflector, x, 0.86, -3.12);
  }

  const rng = random(119);
  for (let i = 0; i < 90; i++) {
    const x = (rng() - 0.5) * 84;
    const z = 2.65 + rng() * 1.2;
    const size = 0.035 + rng() * 0.13;
    const rock = add(createRockGeometry(i), stone, x, cliffHeight(z) + size * 0.55, z);
    rock.scale.setScalar(size);
    rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    rock.castShadow = true;
  }
  for (let layer = 0; layer < 3; layer++) {
    const geometry = new THREE.PlaneGeometry(180, 18, 90, 1);
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const top = positions.getY(i) > 0;
      const y = top ? 13 + layer * 1.5 + Math.sin(x * 0.065 + layer) * 2.4 + Math.sin(x * 0.17 + layer * 2) * 0.9 : -5;
      positions.setXYZ(i, x, y, 42 + layer * 22);
    }
    geometry.computeVertexNormals();
    const material = own(
      new THREE.MeshStandardMaterial({ color: [0x888d81, 0x999f95, 0xaeb6ad][layer], roughness: 1, side: THREE.DoubleSide }),
    );
    add(geometry, material, 0, 0, 0);
  }
  return {
    dispose() {
      group.removeFromParent();
      for (const resource of resources) resource.dispose();
      resources.clear();
    },
  };
}
