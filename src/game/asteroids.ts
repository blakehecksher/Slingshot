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
  PROCEDURAL_COUNT: 150,
  RADIUS_MIN: 10,
  RADIUS_RANGE: 150,
  RADIUS_POWER: 2.4,
  BAND_INNER: 260,
  BAND_RANGE: 2350,
  BAND_JITTER: 220,
  Z_NEAR: 0,
  Z_DEPTH: 8000,
  Y_RANGE: 1500,
  DRIFT_MIN: 0.15,
  DRIFT_RANGE: 0.75,
  ROT_MIN: 0.015,
  ROT_RANGE: 0.045,
  // Mass = radius² × MASS_COEF. Bigger coef = stronger gravity wells.
  MASS_COEF: 900,
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

function massForRadius(radius: number): number {
  return radius * radius * ASTEROID_TUNING.MASS_COEF;
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

  const asteroid: Asteroid = {
    mesh,
    position: position.clone(),
    velocity: velocity.clone(),
    radius,
    mass: massForRadius(radius),
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
    this.addHandPlaced();
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
    this.addHandPlaced();
    this.addProcedural();
  }

  private addHandPlaced(): void {
    const placements: Array<[number, number, number, number]> = [
      [105, -240, 30, -620],
      [70, 280, -65, -980],
      [145, -90, 140, -1380],
      [48, 160, 110, -420],
      [92, -460, -120, -1140],
    ];
    placements.forEach(([radius, x, y, z], index) => {
      this.asteroids.push(makeAsteroid(this.scene, this.physics, this.registry, radius, new THREE.Vector3(x, y, z), 100 + index));
    });
  }

  private addProcedural(): void {
    const t = ASTEROID_TUNING;
    for (let i = 0; i < t.PROCEDURAL_COUNT; i++) {
      const seed = 200 + i * 13.37;
      const sizeRoll = seededNoise(seed);
      const radius = t.RADIUS_MIN + Math.pow(sizeRoll, t.RADIUS_POWER) * t.RADIUS_RANGE;
      const angle = seededNoise(seed + 1) * Math.PI * 2;
      const band = t.BAND_INNER + seededNoise(seed + 2) * t.BAND_RANGE;
      const x = Math.cos(angle) * band + (seededNoise(seed + 3) * 2 - 1) * t.BAND_JITTER;
      const z = t.Z_NEAR - seededNoise(seed + 4) * t.Z_DEPTH;
      const y = (seededNoise(seed + 5) * 2 - 1) * t.Y_RANGE;
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
