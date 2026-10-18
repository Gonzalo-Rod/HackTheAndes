export interface SimulationVector {
  x: number;
  y: number;
  z: number;
}

export interface RockBody {
  id: number;
  active: boolean;
  radius: number;
  position: SimulationVector;
  rotation: SimulationVector;
  velocity: SimulationVector;
  ageSec: number;
  opacity: number;
}

export interface RockImpact {
  id: number;
  position: SimulationVector;
  ageSec: number;
  strength: number;
}

export interface RockfallSimulation {
  readonly rocks: readonly RockBody[];
  readonly impacts: readonly RockImpact[];
  update(elapsedSec: number, deltaSec: number): void;
}

// Metres and seconds: animation parameters, not a calibrated hazard model.
export const MAX_ROCKS = 18;
const STEP_SEC = 1 / 120;
const GRAVITY_MS2 = 9.81;
const EMISSION_INTERVAL_SEC = 0.78;
const ROCK_LIFETIME_SEC = 12.6;
const FADE_DURATION_SEC = 1.4;
const IMPACT_LIFETIME_SEC = 1.8;
const MAX_IMPACTS = 48;
const WARMUP_SEC = 2.4;
const CLIFF_EDGE_Z = 2.7;
const CLIFF_SLOPE = 1.5;
const TOE_RADIUS_M = 0.6;
const GUARDRAIL_Z_M = -3.05;
const GUARDRAIL_HEIGHT_M = 0.92;
const GUARDRAIL_RESTITUTION = 0.18;
const GUARDRAIL_TANGENT_DAMPING = 0.7;
const FOREGROUND_FADE_START_Z_M = -4;
const FOREGROUND_EXIT_Z_M = -6;

export function cliffHeight(z: number): number {
  if (z <= CLIFF_EDGE_Z) return 0;
  const distance = z - CLIFF_EDGE_Z;
  return CLIFF_SLOPE * (distance - TOE_RADIUS_M * (1 - Math.exp(-distance / TOE_RADIUS_M)));
}

function cliffSlope(z: number): number {
  if (z <= CLIFF_EDGE_Z) return 0;
  return CLIFF_SLOPE * (1 - Math.exp(-(z - CLIFF_EDGE_Z) / TOE_RADIUS_M));
}

function vector(): SimulationVector {
  return { x: 0, y: 0, z: 0 };
}

function makeRock(id: number): RockBody {
  return {
    id,
    active: false,
    radius: 0.3,
    position: vector(),
    rotation: vector(),
    velocity: vector(),
    ageSec: 0,
    opacity: 0,
  };
}

function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function applyRollingFriction(rock: RockBody, slope: number): void {
  const resistance = slope === 0 ? 3.6 : 0.65;
  const speed = Math.hypot(rock.velocity.x, rock.velocity.z);
  const factor = speed === 0 ? 0 : Math.max(0, 1 - (resistance * STEP_SEC) / speed);
  rock.velocity.x *= factor;
  rock.velocity.z *= factor;
  rock.velocity.y = slope * rock.velocity.z;
}

function collide(rock: RockBody): number {
  const slope = cliffSlope(rock.position.z);
  const inverseLength = 1 / Math.hypot(1, slope);
  const height = cliffHeight(rock.position.z) + rock.radius / inverseLength;
  if (rock.position.y > height) return 0;
  const normalY = inverseLength;
  const normalZ = -slope * inverseLength;
  const normalSpeed = rock.velocity.y * normalY + rock.velocity.z * normalZ;
  rock.position.y = height;
  if (normalSpeed >= 0) return 0;

  // Small contacts roll; energetic contacts retain a damped outward bounce.
  const restitution = normalSpeed < -1.3 ? 0.34 : 0;
  const impulse = -(1 + restitution) * normalSpeed;
  rock.velocity.y += impulse * normalY;
  rock.velocity.z += impulse * normalZ;
  rock.velocity.x *= 0.97;
  if (restitution === 0) applyRollingFriction(rock, slope);
  return -normalSpeed;
}

function collideGuardrail(rock: RockBody, previousZ: number): number {
  const contactZ = GUARDRAIL_Z_M + rock.radius;
  const crossesRail = previousZ >= contactZ && rock.position.z < contactZ;
  if (!crossesRail || rock.position.y - rock.radius > GUARDRAIL_HEIGHT_M || rock.velocity.z >= 0) return 0;
  const impactSpeed = -rock.velocity.z;
  rock.position.z = contactZ;
  rock.velocity.z = impactSpeed * GUARDRAIL_RESTITUTION;
  rock.velocity.x *= GUARDRAIL_TANGENT_DAMPING;
  return impactSpeed;
}

function fadeForegroundExit(rock: RockBody): void {
  const fadeDistanceM = FOREGROUND_FADE_START_Z_M - FOREGROUND_EXIT_Z_M;
  rock.opacity = Math.min(rock.opacity, Math.max(0, (rock.position.z - FOREGROUND_EXIT_Z_M) / fadeDistanceM));
  if (rock.position.z <= FOREGROUND_EXIT_Z_M) rock.active = false;
}

export function createRockfallSimulation(seed = 17): RockfallSimulation {
  const random = makeRandom(seed);
  const rocks = Array.from({ length: MAX_ROCKS }, (_, id) => makeRock(id));
  const impacts: RockImpact[] = [];
  let timeSec = 0;
  let nextEmissionSec = 0;
  let nextImpactId = 0;

  function emitRock(): void {
    const rock = rocks.find((candidate) => !candidate.active);
    if (!rock) return;
    rock.active = true;
    rock.ageSec = 0;
    rock.opacity = 0;
    rock.radius = 0.32 + random() * 0.54;
    rock.position.x = (random() - 0.5) * 8;
    rock.position.z = 6.6 + random() * 3.7;
    const slopeLength = Math.hypot(1, cliffSlope(rock.position.z));
    rock.position.y = cliffHeight(rock.position.z) + rock.radius * slopeLength + 0.15 + random() * 0.65;
    rock.rotation = { x: random() * 6, y: random() * 6, z: random() * 6 };
    rock.velocity = { x: (random() - 0.5) * 1.3, y: -0.8, z: -1.7 - random() };
  }

  function recordImpact(rock: RockBody, strength: number): void {
    if (strength < 1.1 || impacts.length >= MAX_IMPACTS) return;
    impacts.push({
      id: nextImpactId++,
      position: { x: rock.position.x, y: cliffHeight(rock.position.z), z: rock.position.z },
      ageSec: 0,
      strength: Math.min(1, strength / 7),
    });
  }

  function step(): void {
    while (timeSec + STEP_SEC / 2 >= nextEmissionSec) {
      emitRock();
      nextEmissionSec += EMISSION_INTERVAL_SEC;
    }
    for (let index = impacts.length - 1; index >= 0; index--) {
      const impact = impacts[index];
      if (!impact) continue;
      impact.ageSec += STEP_SEC;
      if (impact.ageSec >= IMPACT_LIFETIME_SEC) impacts.splice(index, 1);
    }
    for (const rock of rocks) {
      if (!rock.active) continue;
      rock.ageSec += STEP_SEC;
      if (rock.ageSec >= ROCK_LIFETIME_SEC) {
        rock.active = false;
        rock.opacity = 0;
        continue;
      }
      rock.opacity = Math.min(1, rock.ageSec / 0.25, (ROCK_LIFETIME_SEC - rock.ageSec) / FADE_DURATION_SEC);
      rock.velocity.y -= GRAVITY_MS2 * STEP_SEC;
      const previousZ = rock.position.z;
      rock.position.x += rock.velocity.x * STEP_SEC;
      rock.position.y += rock.velocity.y * STEP_SEC;
      rock.position.z += rock.velocity.z * STEP_SEC;
      const impactStrength = Math.max(collide(rock), collideGuardrail(rock, previousZ));
      recordImpact(rock, impactStrength);
      fadeForegroundExit(rock);
      rock.rotation.x += (rock.velocity.z / rock.radius) * STEP_SEC;
      rock.rotation.y += (rock.velocity.x / rock.radius) * STEP_SEC * 0.3;
      rock.rotation.z -= (rock.velocity.x / rock.radius) * STEP_SEC;
    }
    timeSec += STEP_SEC;
  }

  function advanceTo(targetSec: number): void {
    while (timeSec + STEP_SEC <= targetSec + 1e-8) step();
  }

  // The first rendered frame already contains rocks in motion on the slope.
  advanceTo(WARMUP_SEC);
  return {
    rocks,
    impacts,
    update(elapsedSec, deltaSec) {
      if (!Number.isFinite(elapsedSec) || !Number.isFinite(deltaSec) || elapsedSec < 0 || deltaSec < 0) return;
      // Absolute elapsed time preserves emissions after dropped/background frames.
      advanceTo(WARMUP_SEC + elapsedSec);
    },
  };
}
