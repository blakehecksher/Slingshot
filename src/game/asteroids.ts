import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/world';
import { COL_ASTEROID, COL_SHIP, ContactRegistry, interactionGroups } from './collision';
import type { CourseGravityAnchor } from './racing/courseAuthoring';

export interface Asteroid {
  readonly mesh: THREE.Mesh;
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly radius: number;
  readonly mass: number;
  readonly coreDensity: number;
  readonly rotationAxis: THREE.Vector3;
  readonly rotationRate: number;
  readonly body: RAPIER.RigidBody;
  readonly colliderHandle: number;
}

export type AsteroidTuningPatch = Partial<typeof ASTEROID_TUNING>;

// Procedural-field tunables. Hand-placed rocks remain hardcoded below since
// their positions are deliberate landmarks. Regenerate the field via
// AsteroidField.regenerate() to apply changes to existing runs.
export const ASTEROID_TUNING = {
  PROCEDURAL_COUNT: 900,
  VISUAL_COUNT: 0,
  VISUAL_RADIUS_MIN: 10,
  VISUAL_RADIUS_RANGE: 150,
  VISUAL_RADIUS_POWER: 1.65,
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

const DEAD_IRON_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0xff4f2f,
  transparent: true,
  opacity: 0.48,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});

const visualMatrix = new THREE.Matrix4();
const visualQuat = new THREE.Quaternion();
const visualScale = new THREE.Vector3();
const visualEuler = new THREE.Euler();
const visualColor = new THREE.Color();
const visualPosition = new THREE.Vector3();

interface VisualHazard {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
}

function seededNoise(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function buildAsteroidGeometry(radius: number, seed: number): THREE.BufferGeometry {
  const detail = ASTEROID_TUNING.PROCEDURAL_COUNT > 3500 ? 1 : ASTEROID_TUNING.PROCEDURAL_COUNT > 1800 ? 2 : 3;
  const geom = new THREE.IcosahedronGeometry(radius, detail);
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

function buildVisualAsteroidGeometry(seed: number): THREE.BufferGeometry {
  const geom = new THREE.IcosahedronGeometry(1, 1);
  const pos = geom.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const normal = v.clone().normalize();
    const ridge = Math.abs(normal.x * 0.7 - normal.y * 0.35 + normal.z * 0.9);
    const n1 = seededNoise(seed + normal.x * 29.3 + normal.y * 47.1 + normal.z * 61.7);
    const n2 = seededNoise(seed * 2.1 - normal.x * 83.5 + normal.y * 13.9 + normal.z * 37.4);
    const faceted = 0.68 + n1 * 0.36 + n2 * 0.16 + ridge * 0.08;
    v.copy(normal).multiplyScalar(faceted);
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}

function addMineralGlints(mesh: THREE.Mesh, radius: number, seed: number, coreDensity: number): void {
  if (radius < 42) return;

  const densityT = Math.max(0, Math.min(1, (coreDensity - ASTEROID_TUNING.CORE_DENSITY_MIN) / ASTEROID_TUNING.CORE_DENSITY_RANGE));
  const maxGlints = ASTEROID_TUNING.PROCEDURAL_COUNT > 3500 ? 5 : 14;
  const count = Math.min(maxGlints, 2 + Math.floor(radius / 34) + Math.floor(densityT * 5));
  const geom = new THREE.SphereGeometry(1, 8, 6);
  const normal = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    normal.set(
      seededNoise(seed + 23 + i * 4.1) * 2 - 1,
      seededNoise(seed + 24 + i * 4.1) * 2 - 1,
      seededNoise(seed + 25 + i * 4.1) * 2 - 1,
    ).normalize();
    const mat = densityT > 0.62 && i % 2 === 0 ? DEAD_IRON_MATERIAL : GLINT_MATERIALS[(i + Math.floor(seed)) % GLINT_MATERIALS.length];
    const glint = new THREE.Mesh(geom, mat);
    glint.position.copy(normal).multiplyScalar(radius * (0.74 + seededNoise(seed + i) * 0.18));
    const s = Math.max(1.2, radius * (0.012 + densityT * 0.012 + seededNoise(seed + i * 2) * 0.018));
    glint.scale.set(s * 1.7, s * 0.55, s);
    glint.lookAt(normal.clone().multiplyScalar(radius * 2));
    mesh.add(glint);
  }

  if (densityT > 0.48) {
    const ringCount = ASTEROID_TUNING.PROCEDURAL_COUNT > 3500 ? 1 : densityT > 0.78 ? 3 : 2;
    for (let i = 0; i < ringCount; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius * (0.76 + i * 0.055), Math.max(0.5, radius * 0.006), 6, 48),
        DEAD_IRON_MATERIAL,
      );
      ring.rotation.set(
        seededNoise(seed + 80 + i) * Math.PI,
        seededNoise(seed + 90 + i) * Math.PI,
        seededNoise(seed + 100 + i) * Math.PI,
      );
      ring.scale.set(1, 0.52 + seededNoise(seed + 110 + i) * 0.26, 1);
      mesh.add(ring);
    }
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
  options: { coreDensity?: number; massScale?: number } = {},
): Asteroid {
  const coreDensity = options.coreDensity ?? ASTEROID_TUNING.CORE_DENSITY_MIN + seededNoise(seed + 11) * ASTEROID_TUNING.CORE_DENSITY_RANGE;
  const densityT = Math.max(0, Math.min(1, (coreDensity - ASTEROID_TUNING.CORE_DENSITY_MIN) / ASTEROID_TUNING.CORE_DENSITY_RANGE));
  const baseMat = ASTEROID_MATERIALS[Math.floor(seed) % ASTEROID_MATERIALS.length];
  const mat = baseMat.clone();
  mat.color.lerp(new THREE.Color(0x2b2623), densityT * 0.55);
  mat.metalness = Math.min(0.28, mat.metalness + densityT * 0.18);
  mat.roughness = Math.max(0.62, mat.roughness - densityT * 0.16);
  const mesh = new THREE.Mesh(buildAsteroidGeometry(radius, seed), mat);
  addMineralGlints(mesh, radius, seed, coreDensity);
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
    mass: massForRadius(radius, coreDensity) * (options.massScale ?? 1),
    coreDensity,
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
  private seedBase: number;
  private gravityAnchors: readonly CourseGravityAnchor[];
  private visualField: THREE.InstancedMesh | null = null;
  private visualHazards: VisualHazard[] = [];

  constructor(scene: THREE.Scene, physics: PhysicsWorld, registry: ContactRegistry, seedBase = 200, gravityAnchors: readonly CourseGravityAnchor[] = []) {
    this.scene = scene;
    this.physics = physics;
    this.registry = registry;
    this.seedBase = seedBase;
    this.gravityAnchors = gravityAnchors;
    this.addProcedural();
    this.addGravityAnchors(this.gravityAnchors);
    this.addVisualProcedural();
  }

  update(dt: number): void {
    for (const a of this.asteroids) {
      a.position.addScaledVector(a.velocity, dt);
      a.mesh.position.copy(a.position);
      a.mesh.rotateOnAxis(a.rotationAxis, a.rotationRate * dt);
      a.body.setNextKinematicTranslation({ x: a.position.x, y: a.position.y, z: a.position.z });
    }
  }

  intersectsVisualHazardSegment(
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
    shipRadius = 2.0,
  ): boolean {
    if (this.visualHazards.length <= 0) return false;

    const abx = to.x - from.x;
    const aby = to.y - from.y;
    const abz = to.z - from.z;
    const abLenSq = abx * abx + aby * aby + abz * abz;

    for (const hazard of this.visualHazards) {
      let closestX = from.x;
      let closestY = from.y;
      let closestZ = from.z;

      if (abLenSq > 0.0001) {
        const apx = hazard.x - from.x;
        const apy = hazard.y - from.y;
        const apz = hazard.z - from.z;
        const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / abLenSq));
        closestX += abx * t;
        closestY += aby * t;
        closestZ += abz * t;
      }

      const dx = hazard.x - closestX;
      const dy = hazard.y - closestY;
      const dz = hazard.z - closestZ;
      const hitRadius = hazard.radius + shipRadius;
      if (dx * dx + dy * dy + dz * dz <= hitRadius * hitRadius) return true;
    }

    return false;
  }

  /** Tear down + rebuild the field. Used by tuning panel after editing
   *  ASTEROID_TUNING. Existing trajectory ribbon will refresh next frame. */
  regenerate(seedBase = this.seedBase, tuning?: AsteroidTuningPatch, gravityAnchors?: readonly CourseGravityAnchor[]): void {
    this.seedBase = seedBase;
    if (gravityAnchors) this.gravityAnchors = gravityAnchors;
    if (tuning) Object.assign(ASTEROID_TUNING, tuning);
    this.disposeVisualField();
    this.disposeVisualHazards();
    for (const a of this.asteroids) {
      this.registry.unregister(a.colliderHandle);
      this.physics.world.removeRigidBody(a.body);
      this.scene.remove(a.mesh);
      a.mesh.geometry.dispose();
    }
    this.asteroids.length = 0;
    this.addProcedural();
    this.addGravityAnchors(this.gravityAnchors);
    this.addVisualProcedural();
  }

  private addProcedural(): void {
    const t = ASTEROID_TUNING;
    for (let i = 0; i < t.PROCEDURAL_COUNT; i++) {
      const seed = this.seedBase + i * 13.37;
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

  private addGravityAnchors(anchors: readonly CourseGravityAnchor[]): void {
    anchors.forEach((anchor, index) => {
      const seed = this.seedBase + 9000 + index * 41.3;
      const [x, y, z] = anchor.position;
      const [vx, vy, vz] = anchor.drift ?? [0, 0, 0];
      const visualT = Math.max(0, Math.min(1, anchor.visualIntensity));
      const coreDensity = ASTEROID_TUNING.CORE_DENSITY_MIN + ASTEROID_TUNING.CORE_DENSITY_RANGE * visualT;
      this.asteroids.push(makeAsteroid(
        this.scene,
        this.physics,
        this.registry,
        anchor.radius,
        new THREE.Vector3(x, y, z),
        seed,
        new THREE.Vector3(vx, vy, vz),
        { coreDensity, massScale: anchor.massScale },
      ));
    });
  }

  private addVisualProcedural(): void {
    const t = ASTEROID_TUNING;
    if (t.VISUAL_COUNT <= 0) return;

    const geometry = buildVisualAsteroidGeometry(this.seedBase + 81200);
    const material = new THREE.MeshStandardMaterial({
      color: 0x655d53,
      roughness: 0.92,
      metalness: 0.08,
      vertexColors: true,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, t.VISUAL_COUNT);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;

    for (let i = 0; i < t.VISUAL_COUNT; i++) {
      const seed = this.seedBase + 50000 + i * 17.31;
      const sizeRoll = seededNoise(seed);
      const u = seededNoise(seed + 1);
      const v = seededNoise(seed + 2);
      const wRoll = seededNoise(seed + 3);
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const radialT = Math.pow(wRoll, t.RADIAL_BIAS);
      const r = t.SPHERE_INNER + (t.SPHERE_OUTER - t.SPHERE_INNER) * radialT;
      const radius = t.VISUAL_RADIUS_MIN + Math.pow(sizeRoll, t.VISUAL_RADIUS_POWER) * t.VISUAL_RADIUS_RANGE;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      visualEuler.set(
        seededNoise(seed + 4) * Math.PI,
        seededNoise(seed + 5) * Math.PI,
        seededNoise(seed + 6) * Math.PI,
      );
      visualQuat.setFromEuler(visualEuler);
      visualPosition.set(x, y, z);
      visualScale.set(
        radius * (0.74 + seededNoise(seed + 8) * 0.5),
        radius * (0.58 + seededNoise(seed + 9) * 0.48),
        radius * (0.82 + seededNoise(seed + 10) * 0.58),
      );
      visualMatrix.compose(visualPosition, visualQuat, visualScale);
      mesh.setMatrixAt(i, visualMatrix);

      const densityT = seededNoise(seed + 7);
      visualColor.set(densityT > 0.74 ? 0x3c4149 : densityT > 0.52 ? 0x6f5f4f : 0x5c554d);
      visualColor.lerp(new THREE.Color(0x231f1d), densityT * 0.36);
      mesh.setColorAt(i, visualColor);

      const hitRadius = radius * Math.max(0.62, Math.min(0.92, Math.max(visualScale.x, visualScale.y, visualScale.z) / radius * 0.72));
      this.visualHazards.push({ x, y, z, radius: hitRadius });
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.scene.add(mesh);
    this.visualField = mesh;
  }

  private disposeVisualHazards(): void {
    this.visualHazards = [];
  }

  private disposeVisualField(): void {
    if (!this.visualField) return;
    this.scene.remove(this.visualField);
    this.visualField.geometry.dispose();
    const material = this.visualField.material;
    if (Array.isArray(material)) material.forEach((mat) => mat.dispose());
    else material.dispose();
    this.visualField = null;
  }
}
