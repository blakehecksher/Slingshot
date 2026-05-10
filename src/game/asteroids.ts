import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/world';
import { COL_ASTEROID, COL_SHIP, ContactRegistry, interactionGroups } from './collision';

export interface Asteroid {
  readonly mesh: THREE.Mesh;
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly radius: number;
  readonly mass: number;
  readonly rotationAxis: THREE.Vector3;
  readonly rotationRate: number;
  readonly body: RAPIER.RigidBody;
  readonly colliderHandle: number;
}

// Procedural-field tunables. Hand-placed rocks remain hardcoded below since
// their positions are deliberate landmarks. Regenerate the field via
// AsteroidField.regenerate() to apply changes to existing runs.
export const ASTEROID_TUNING = {
  PROCEDURAL_COUNT: 900,
  RADIUS_MIN: 8,
  RADIUS_RANGE: 240,
  // Lower power = flatter distribution = more medium and large rocks.
  RADIUS_POWER: 1.5,
  // Sphere shell. INNER is clear zone around base (no rocks within); OUTER
  // fills almost to skybox (stars at 8800).
  SPHERE_INNER: 520,
  SPHERE_OUTER: 8200,
  // 1.0 = uniform-volume; <1 packs more rocks inward, >1 outward.
  RADIAL_BIAS: 1.0,
  // Size-by-radius bias. At the inner shell, max rock size is capped at this
  // fraction of full RADIUS_RANGE. Linearly opens up to 1.0 at outer shell.
  // Keeps gigantic rocks in the deep field where the player has time to see
  // them and learn the well, instead of spawning a 230m core next to base.
  SIZE_INNER_MAX: 0.32,
  DRIFT_MIN: 0.15,
  DRIFT_RANGE: 0.75,
  ROT_MIN: 0.015,
  ROT_RANGE: 0.045,
  // Mass = radius^MASS_RADIUS_POWER × MASS_COEF × coreDensity.
  MASS_COEF: 8,
  MASS_RADIUS_POWER: 3,
  CORE_DENSITY_MIN: 0.55,
  CORE_DENSITY_RANGE: 1.2,
};

const ASTEROID_MATERIALS = [
  new THREE.MeshStandardMaterial({ color: 0x5f574f, roughness: 0.9, metalness: 0.08 }),
  new THREE.MeshStandardMaterial({ color: 0x766452, roughness: 0.86, metalness: 0.07 }),
  new THREE.MeshStandardMaterial({ color: 0x4b5158, roughness: 0.92, metalness: 0.06 }),
];

const GLINT_MATERIALS = [
  new THREE.MeshBasicMaterial({
    color: 0xff7a3a,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }),
  new THREE.MeshBasicMaterial({
    color: 0x35d6ff,
    transparent: true,
    opacity: 0.52,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }),
];

function seededNoise(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function buildAsteroidGeometry(radius: number, seed: number): THREE.BufferGeometry {
  const geom = new THREE.IcosahedronGeometry(radius, 3);
  const pos = geom.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const normal = v.clone().normalize();
    const n1 = seededNoise(seed + normal.x * 17.1 + normal.y * 31.7 + normal.z * 43.3);
    const n2 = seededNoise(seed * 3.7 + normal.x * 71.9 - normal.y * 19.1 + normal.z * 11.8);
    const bulge = 0.72 + n1 * 0.42 + n2 * 0.14;
    v.copy(normal).multiplyScalar(radius * bulge);
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}

function addMineralGlints(mesh: THREE.Mesh, radius: number, seed: number): void {
  if (radius < 42) return;

  const count = Math.min(9, 2 + Math.floor(radius / 34));
  const geom = new THREE.SphereGeometry(1, 8, 6);
  const normal = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    normal.set(
      seededNoise(seed + 23 + i * 4.1) * 2 - 1,
      seededNoise(seed + 24 + i * 4.1) * 2 - 1,
      seededNoise(seed + 25 + i * 4.1) * 2 - 1,
    ).normalize();
    const mat = GLINT_MATERIALS[(i + Math.floor(seed)) % GLINT_MATERIALS.length];
    const glint = new THREE.Mesh(geom, mat);
    glint.position.copy(normal).multiplyScalar(radius * (0.74 + seededNoise(seed + i) * 0.18));
    const s = Math.max(1.2, radius * (0.012 + seededNoise(seed + i * 2) * 0.018));
    glint.scale.set(s * 1.7, s * 0.55, s);
    glint.lookAt(normal.clone().multiplyScalar(radius * 2));
    mesh.add(glint);
  }
}

function massForRadius(radius: number, coreDensity: number): number {
  return Math.pow(radius, ASTEROID_TUNING.MASS_RADIUS_POWER) * ASTEROID_TUNING.MASS_COEF * coreDensity;
}

function makeAsteroid(
  scene: THREE.Scene,
  physics: PhysicsWorld,
  registry: ContactRegistry,
  radius: number,
  position: THREE.Vector3,
  seed: number,
  velocity = new THREE.Vector3(),
): Asteroid {
  const mat = ASTEROID_MATERIALS[Math.floor(seed) % ASTEROID_MATERIALS.length];
  const mesh = new THREE.Mesh(buildAsteroidGeometry(radius, seed), mat);
  addMineralGlints(mesh, radius, seed);
  mesh.position.copy(position);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  scene.add(mesh);

  const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(position.x, position.y, position.z);
  const body = physics.world.createRigidBody(bodyDesc);

  const colliderDesc = RAPIER.ColliderDesc.ball(radius)
    .setCollisionGroups(interactionGroups(COL_ASTEROID, COL_SHIP))
    .setFriction(0)
    .setRestitution(0);
  const collider = physics.world.createCollider(colliderDesc, body);

  const coreDensity = ASTEROID_TUNING.CORE_DENSITY_MIN + seededNoise(seed + 11) * ASTEROID_TUNING.CORE_DENSITY_RANGE;
  const asteroid: Asteroid = {
    mesh,
    position: position.clone(),
    velocity: velocity.clone(),
    radius,
    mass: massForRadius(radius, coreDensity),
    rotationAxis: new THREE.Vector3(
      seededNoise(seed + 1) * 2 - 1,
      seededNoise(seed + 2) * 2 - 1,
      seededNoise(seed + 3) * 2 - 1,
    ).normalize(),
    rotationRate: ASTEROID_TUNING.ROT_MIN + seededNoise(seed + 4) * ASTEROID_TUNING.ROT_RANGE,
    body,
    colliderHandle: collider.handle,
  };
  registry.register(collider.handle, { type: 'asteroid', asteroid });
  return asteroid;
}

export class AsteroidField {
  readonly asteroids: Asteroid[] = [];
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private registry: ContactRegistry;

  constructor(scene: THREE.Scene, physics: PhysicsWorld, registry: ContactRegistry) {
    this.scene = scene;
    this.physics = physics;
    this.registry = registry;
    this.addProcedural();
  }

  update(dt: number): void {
    for (const a of this.asteroids) {
      a.position.addScaledVector(a.velocity, dt);
      a.mesh.position.copy(a.position);
      a.mesh.rotateOnAxis(a.rotationAxis, a.rotationRate * dt);
      a.body.setNextKinematicTranslation({ x: a.position.x, y: a.position.y, z: a.position.z });
    }
  }

  /** Tear down + rebuild the field. Used by tuning panel after editing
   *  ASTEROID_TUNING. Existing trajectory ribbon will refresh next frame. */
  regenerate(): void {
    for (const a of this.asteroids) {
      this.registry.unregister(a.colliderHandle);
      this.physics.world.removeRigidBody(a.body);
      this.scene.remove(a.mesh);
      a.mesh.geometry.dispose();
    }
    this.asteroids.length = 0;
    this.addProcedural();
  }

  private addProcedural(): void {
    const t = ASTEROID_TUNING;
    for (let i = 0; i < t.PROCEDURAL_COUNT; i++) {
      const seed = 200 + i * 13.37;
      const sizeRoll = seededNoise(seed);
      // Uniform points in a spherical shell. cube root of [0,1] → uniform
      // by volume; raise to RADIAL_BIAS to pack inward.
      const u = seededNoise(seed + 1);
      const v = seededNoise(seed + 2);
      const wRoll = seededNoise(seed + 3);
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const radialT = Math.pow(wRoll, t.RADIAL_BIAS); // 0 inner → 1 outer
      const r = t.SPHERE_INNER + (t.SPHERE_OUTER - t.SPHERE_INNER) * radialT;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      // Size cap grows with radius. Inner-shell rocks are small; deep-field
      // rocks can be giants.
      const sizeCap = t.SIZE_INNER_MAX + (1 - t.SIZE_INNER_MAX) * radialT;
      const radius = t.RADIUS_MIN + Math.pow(sizeRoll, t.RADIUS_POWER) * t.RADIUS_RANGE * sizeCap;
      const driftScale = t.DRIFT_MIN + seededNoise(seed + 6) * t.DRIFT_RANGE;
      const velocity = new THREE.Vector3(
        seededNoise(seed + 7) * 2 - 1,
        seededNoise(seed + 8) * 2 - 1,
        seededNoise(seed + 9) * 2 - 1,
      ).multiplyScalar(driftScale);
      this.asteroids.push(makeAsteroid(this.scene, this.physics, this.registry, radius, new THREE.Vector3(x, y, z), seed, velocity));
    }
  }
}
