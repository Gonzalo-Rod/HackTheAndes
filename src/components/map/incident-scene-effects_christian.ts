import * as THREE from "three";
import type { IncidentAnimationKind } from "./incident-animation";
import { cliffHeight } from "./incident-simulation_christian";

type Update = (elapsedSec: number, deltaSec: number) => void;

const amber = 0xffa51c;
const wrap = (value: number, length: number) => ((value % length) + length) % length;
const seed = (index: number) => {
  const value = Math.sin(index * 127.1 + 17.3) * 43758.5453;
  return value - Math.floor(value);
};

function material(color: number, roughness = 0.65): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function mesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  surface: THREE.MeshStandardMaterial,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const object = new THREE.Mesh(geometry, surface);
  object.position.set(x, y, z);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function box(parent: THREE.Object3D, size: number[], color: number, x: number, y: number, z: number) {
  return mesh(parent, new THREE.BoxGeometry(size[0], size[1], size[2]), material(color), x, y, z);
}

function precipitation(root: THREE.Group, updates: Update[], snow: boolean): void {
  const count = snow ? 380 : 640;
  const positions = new Float32Array(count * (snow ? 3 : 6));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const particles = snow
    ? new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xf4faff, size: 0.08, transparent: true, opacity: 0.88 }))
    : new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xd7e7ee, transparent: true, opacity: 0.52 }));
  root.add(particles);
  const road = mesh(root, new THREE.PlaneGeometry(68, 4.7), material(snow ? 0xd7e4e7 : 0x283135, snow ? 0.28 : 0.12));
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.025;
  road.material.transparent = true;
  road.material.opacity = snow ? 0.73 : 0.58;
  updates.push((time) => {
    for (let index = 0; index < count; index += 1) {
      const x = seed(index + 1) * 48 - 24 + Math.sin(time * 0.6 + index) * (snow ? 0.6 : 0.08);
      const z = seed(index + 701) * 18 - 7;
      const y = cliffHeight(z) + 0.1 + wrap(seed(index + 1401) * 16 - time * (snow ? 1.15 : 15), 16);
      const offset = index * (snow ? 3 : 6);
      positions.set([x, y, z], offset);
      if (!snow) positions.set([x + 0.045, y + 0.7, z + 0.08], offset + 3);
    }
    geometry.attributes.position.needsUpdate = true;
  });
}

function water(root: THREE.Group, updates: Update[], muddy: boolean): void {
  const geometry = new THREE.PlaneGeometry(muddy ? 4.3 : 62, muddy ? 24 : 7.4, muddy ? 12 : 72, muddy ? 70 : 12);
  geometry.rotateX(-Math.PI / 2);
  if (muddy) geometry.translate(0, 0, 8.7);
  const surface = new THREE.MeshPhysicalMaterial({
    color: muddy ? 0x68503a : 0x4a6867,
    roughness: muddy ? 0.6 : 0.22,
    metalness: 0.08,
    clearcoat: muddy ? 0.05 : 0.7,
    transparent: !muddy,
    opacity: muddy ? 1 : 0.88,
    side: THREE.DoubleSide,
  });
  mesh(root, geometry, surface);
  const vertices = geometry.attributes.position;
  const foam = Array.from({ length: muddy ? 35 : 52 }, (_, index) => {
    const particle = mesh(root, new THREE.SphereGeometry(1, 6, 4), material(muddy ? 0x8a6b4b : 0xd0d6c8));
    particle.scale.set(muddy ? 0.27 : 0.35, muddy ? 0.06 : 0.014, muddy ? 0.5 : 0.1);
    return { particle, phase: seed(index + 46), lateral: seed(index + 371) };
  });
  updates.push((time) => {
    for (let index = 0; index < vertices.count; index += 1) {
      const x = vertices.getX(index);
      const z = vertices.getZ(index);
      vertices.setY(
        index,
        (muddy ? cliffHeight(z) + 0.07 : 0.19) + Math.sin(z * 3 + x * 1.2 + time * (muddy ? 9 : 3.5)) * (muddy ? 0.07 : 0.045),
      );
    }
    vertices.needsUpdate = true;
    geometry.computeVertexNormals();
    for (const { particle, phase, lateral } of foam) {
      const z = muddy ? 19 - ((time * 5 + phase * 23) % 23) : lateral * 7 - 3.5;
      const x = muddy ? (lateral - 0.5) * 3.8 : ((time * 2.3 + phase * 60) % 60) - 30;
      particle.position.set(x, (muddy ? cliffHeight(z) + 0.16 : 0.27) + Math.sin(time * 6 + phase * 10) * 0.03, z);
    }
  });
}

function beacon(parent: THREE.Object3D, updates: Update[], x: number, y: number, z: number): void {
  const surface = material(amber, 0.25);
  surface.emissive.setHex(amber);
  const bulb = mesh(parent, new THREE.SphereGeometry(0.11, 12, 8), surface, x, y, z);
  const light = new THREE.PointLight(amber, 2, 3, 2);
  light.position.copy(bulb.position);
  parent.add(light);
  updates.push((time) => {
    const intensity = Math.sin(time * 9) > 0.25 ? 1 : 0.08;
    surface.emissiveIntensity = intensity * 3;
    light.intensity = intensity * 2.8;
  });
}

function truck(root: THREE.Group, updates: Update[]): void {
  const vehicle = new THREE.Group();
  vehicle.position.z = -1.15;
  root.add(vehicle);
  box(vehicle, [6.2, 0.22, 1.75], 0x262a2c, 0, 0.65, 0);
  box(vehicle, [4.3, 2.2, 1.9], 0xc5cbc9, -0.8, 1.85, 0);
  box(vehicle, [1.65, 1.65, 1.85], 0xd7a02b, 2.25, 1.5, 0);
  const glass = material(0x172e37, 0.12);
  mesh(vehicle, new THREE.BoxGeometry(0.03, 0.76, 1.52), glass, 3.09, 1.93, 0);
  for (const side of [-1, 1]) {
    mesh(vehicle, new THREE.BoxGeometry(0.88, 0.65, 0.03), glass, 2.38, 1.95, side * 0.94);
    box(vehicle, [0.1, 0.32, 0.18], 0x242629, 2.95, 1.98, side * 1.08);
    box(vehicle, [0.2, 0.14, 0.28], 0xffffc8, 3.11, 0.98, side * 0.65);
  }
  box(vehicle, [0.06, 0.35, 1.05], 0x303639, 3.11, 1.3, 0);
  const wheels = [-2.4, -1.55, 2.3].flatMap((x) =>
    [-0.97, 0.97].map((z) => {
      const wheel = mesh(vehicle, new THREE.CylinderGeometry(0.45, 0.45, 0.27, 20), material(0x171a1b), x, 0.46, z);
      wheel.rotation.x = Math.PI / 2;
      const hub = mesh(vehicle, new THREE.CylinderGeometry(0.23, 0.23, 0.3, 16), material(0x858b8b, 0.35), x, 0.46, z);
      hub.rotation.x = Math.PI / 2;
      return wheel;
    }),
  );
  beacon(vehicle, updates, 2.1, 2.41, -0.65);
  beacon(vehicle, updates, 2.1, 2.41, 0.65);
  updates.push((time) => {
    const cycle = time % 16;
    const distance = cycle < 7 ? 27 * (1 - (1 - cycle / 7) ** 2) : 27 + Math.max(0, cycle - 10) ** 2 * 1.7;
    vehicle.position.x = -29 + distance;
    vehicle.position.y = cycle < 7 ? Math.sin(time * 13) * 0.012 : 0;
    for (const wheel of wheels) wheel.rotation.z = -distance / 0.45;
  });
}

function cone(root: THREE.Group, x: number, z: number): void {
  box(root, [0.65, 0.07, 0.65], 0x262827, x, 0.055, z);
  mesh(root, new THREE.ConeGeometry(0.25, 0.8, 20), material(0xeb651b), x, 0.48, z);
  mesh(root, new THREE.CylinderGeometry(0.13, 0.17, 0.13, 20), material(0xebeeea), x, 0.51, z);
}

function roadworks(root: THREE.Group, updates: Update[]): void {
  for (let index = 0; index < 7; index += 1) cone(root, index * 1.1 - 3.3, Math.sin(index * 0.55) * 0.55);
  box(root, [4.9, 0.55, 0.14], 0xe49426, 0, 1.12, 0.3);
  for (const x of [-2, 2]) box(root, [0.13, 1.2, 0.13], 0xa6a9a3, x, 0.65, 0.3);
  for (let index = 0; index < 10; index += 1) {
    const stripe = box(root, [0.21, 0.58, 0.03], 0x272b2a, index * 0.48 - 2.15, 1.12, 0.21);
    stripe.rotation.z = -0.4;
  }
  beacon(root, updates, -2, 1.63, 0.3);
  beacon(root, updates, 2, 1.63, 0.3);
}

function trafficMarshal(root: THREE.Group, updates: Update[]): void {
  cone(root, -2.1, -0.7);
  cone(root, 2, -0.7);
  const person = new THREE.Group();
  person.position.set(0, 0, -0.7);
  root.add(person);
  box(person, [0.43, 0.62, 0.25], 0xdbe733, 0, 1.2, 0);
  box(person, [0.45, 0.05, 0.27], 0xdde3d9, 0, 1.16, 0);
  for (const x of [-0.13, 0.13]) {
    box(person, [0.17, 0.78, 0.19], 0x243b45, x, 0.54, 0);
    box(person, [0.19, 0.14, 0.33], 0x242625, x, 0.1, -0.05);
  }
  mesh(person, new THREE.SphereGeometry(0.16, 14, 10), material(0xba8b68), 0, 1.69, 0);
  mesh(person, new THREE.SphereGeometry(0.18, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), material(0xe5c54a), 0, 1.77, 0);
  const arm = new THREE.Group();
  arm.position.set(0.26, 1.43, 0);
  person.add(arm);
  box(arm, [0.55, 0.15, 0.17], 0x556873, 0.22, 0, 0);
  box(arm, [0.035, 0.95, 0.035], 0x49483c, 0.5, 0.42, 0);
  const flag = mesh(arm, new THREE.PlaneGeometry(0.6, 0.38, 12, 4), material(0xb92e1e), 0.82, 0.67, 0);
  flag.material.side = THREE.DoubleSide;
  const vertices = flag.geometry.attributes.position;
  updates.push((time) => {
    arm.rotation.z = 0.25 + Math.sin(time * 1.8) * 0.35;
    for (let index = 0; index < vertices.count; index += 1)
      vertices.setZ(index, Math.sin(vertices.getX(index) * 12 - time * 8) * (vertices.getX(index) + 0.3) * 0.14);
    vertices.needsUpdate = true;
    flag.geometry.computeVertexNormals();
  });
}

export function createIncidentEffects(scene: THREE.Scene, kind: IncidentAnimationKind) {
  const root = new THREE.Group();
  const updates: Update[] = [];
  scene.add(root);
  if (kind === "rain" || kind === "frost") precipitation(root, updates, kind === "frost");
  if (kind === "flood" || kind === "debris-flow") water(root, updates, kind === "debris-flow");
  if (kind === "vehicle") truck(root, updates);
  if (kind === "roadworks") roadworks(root, updates);
  if (kind === "people") trafficMarshal(root, updates);
  if (kind === "generic") {
    box(root, [0.12, 1.9, 0.12], 0x979d99, 0, 0.95, 0);
    const warning = mesh(root, new THREE.CylinderGeometry(0.65, 0.65, 0.08, 3), material(amber), 0, 1.9, 0);
    warning.rotation.x = Math.PI / 2;
    box(root, [0.09, 0.42, 0.1], 0x292c29, 0, 1.92, -0.06);
    box(root, [0.1, 0.1, 0.1], 0x292c29, 0, 1.6, -0.06);
    beacon(root, updates, 0, 2.7, 0);
  }
  return {
    update(elapsedSec: number, deltaSec: number): void {
      updates.forEach((update) => update(elapsedSec, deltaSec));
    },
    dispose(): void {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      root.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.LineSegments) {
          geometries.add(object.geometry);
          const surfaces = Array.isArray(object.material) ? object.material : [object.material];
          surfaces.forEach((surface) => materials.add(surface));
        }
        if (object instanceof THREE.Light) object.dispose();
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((surface) => surface.dispose());
      scene.remove(root);
    },
  };
}
