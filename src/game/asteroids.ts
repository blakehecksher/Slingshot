import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/world';
import { COL_ASTEROID, COL_SHIP, ContactRegistry, interactionGroups } from './collision';
import type { CourseGravityAnchor, RaceCourse, RaceGate } from './racing/courseAuthoring';

export interface Asteroid {
  readonly mesh: THREE.Mesh;
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly radius: number;
  readonly hitRadius: number;
  readonly mass: number;
  readonly coreDensity: number;
  readonly gravityClass: AsteroidGravityClass;
  readonly rotationAxis: THREE.Vector3;
  readonly rotationRate: number;
  readonly body: RAPIER.RigidBody;
  readonly colliderHandle: number;
}

export type AsteroidGravityClass = 'ordinary' | 'weak' | 'strong';
export type AsteroidTuningPatch = Partial<typeof ASTEROID_TUNING>;

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
  WEAK_GRAVITY_CHANCE: 0.24,
  STRONG_GRAVITY_CHANCE: 0.07,
  WEAK_GRAVITY_MASS_SCALE: 0.24,
};

// metalness ~0.3 + roughness ~0.6 gives facets specular highlights under
// colored scene lights. Color is desaturated warm stone.
const ROCK_LOOK: Record<AsteroidGravityClass, {
  color: number;
  roughness: number;
  metalness: number;
  emissive: number;
  emissiveIntensity: number;
}> = {
  ordinary: {
    color: 0x8f694d,
    roughness: 0.72,
    metalness: 0.2,
    emissive: 0x3d2518,
    emissiveIntensity: 0.04,
  },
  weak: {
    color: 0x5e5a54,
    roughness: 0.58,
    metalness: 0.48,
    emissive: 0x17343a,
    emissiveIntensity: 0.12,
  },
  strong: {
    color: 0x252d31,
    roughness: 0.42,
    metalness: 0.82,
    emissive: 0x164b56,
    emissiveIntensity: 0.28,
  },
};

function makeRockBodyMaterial(gravityClass: AsteroidGravityClass): THREE.MeshStandardMaterial {
  const look = ROCK_LOOK[gravityClass];
  return new THREE.MeshStandardMaterial({
    ...look,
    envMapIntensity: 0.8,
  });
}

// Surface bumps share the body look so they read as part of the same rock.
const ROCK_FACE_MATERIAL = makeRockBodyMaterial('ordinary');
const WEAK_IRON_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x26383b,
  roughness: 0.38,
  metalness: 0.78,
  emissive: 0x2f7d84,
  emissiveIntensity: 0.34,
});
const STRONG_IRON_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x10191d,
  roughness: 0.26,
  metalness: 0.92,
  emissive: 0x4ec7cf,
  emissiveIntensity: 0.72,
});

const upAxis = new THREE.Vector3(0, 1, 0);
let baseAsteroidGeometry: THREE.BufferGeometry | null = null;
let baseAsteroidColliderPoints: Float32Array | null = null;
// Mean vertex radius (not max) keeps the sphere inside the visible rock body.
// 0.9 biases slightly tight so players must actually intersect the rock.
const ASTEROID_COLLIDER_VISUAL_MULT = 0.9;

function seededNoise(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function disposableMaterial<T extends THREE.Material>(material: T): T {
  material.userData.disposeWithAsteroid = true;
  return material;
}

function disposeAsteroidMesh(mesh: THREE.Mesh): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  mesh.traverse((obj) => {
    const candidate = obj as THREE.Mesh;
    if (candidate.geometry) geometries.add(candidate.geometry);
    const material = candidate.material;
    if (Array.isArray(material)) material.forEach((mat) => materials.add(mat));
    else if (material) materials.add(material);
  });

  geometries.forEach((geom) => geom.dispose());
  materials.forEach((mat) => {
    if (mat.userData.disposeWithAsteroid) mat.dispose();
  });
}

function getBaseAsteroidGeometry(): THREE.BufferGeometry {
  if (baseAsteroidGeometry) return baseAsteroidGeometry;

  const geom = new THREE.IcosahedronGeometry(1, 3);
  const pos = geom.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const normal = v.clone().normalize();
    const n1 = seededNoise(1400 + normal.x * 17.1 + normal.y * 31.7 + normal.z * 43.3);
    const n2 = seededNoise(5200 + normal.x * 71.9 - normal.y * 19.1 + normal.z * 11.8);
    const ridge = Math.abs(normal.x * 0.58 - normal.y * 0.34 + normal.z * 0.86);
    const bulge = 0.72 + n1 * 0.36 + n2 * 0.14 + ridge * 0.07;
    v.copy(normal).multiplyScalar(bulge);
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  baseAsteroidGeometry = geom;
  return baseAsteroidGeometry;
}

function buildAsteroidGeometry(): THREE.BufferGeometry {
  return getBaseAsteroidGeometry().clone();
}

function getBaseAsteroidColliderPoints(): Float32Array {
  if (baseAsteroidColliderPoints) return baseAsteroidColliderPoints;

  const geom = getBaseAsteroidGeometry();
  const pos = geom.getAttribute('position') as THREE.BufferAttribute;
  const points = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    points[i * 3 + 0] = pos.getX(i);
    points[i * 3 + 1] = pos.getY(i);
    points[i * 3 + 2] = pos.getZ(i);
  }

  baseAsteroidColliderPoints = points;
  return points;
}

function asteroidColliderRadiusForScale(scaleX: number, scaleY: number, scaleZ: number): number {
  const base = getBaseAsteroidColliderPoints();
  let sum = 0;
  const count = base.length / 3;
  for (let i = 0; i < base.length; i += 3) {
    const x = base[i] * scaleX;
    const y = base[i + 1] * scaleY;
    const z = base[i + 2] * scaleZ;
    sum += Math.sqrt(x * x + y * y + z * z);
  }
  return (sum / count) * ASTEROID_COLLIDER_VISUAL_MULT;
}

function surfaceNormal(seed: number, index: number, target: THREE.Vector3): THREE.Vector3 {
  return target.set(
    seededNoise(seed + 23 + index * 4.1) * 2 - 1,
    seededNoise(seed + 24 + index * 4.1) * 2 - 1,
    seededNoise(seed + 25 + index * 4.1) * 2 - 1,
  ).normalize();
}

function addSurfacePatch(
  mesh: THREE.Mesh,
  geom: THREE.BufferGeometry,
  mat: THREE.Material,
  normal: THREE.Vector3,
  seed: number,
  index: number,
  size: number,
  lift = 1.08,
): THREE.Mesh {
  const patch = new THREE.Mesh(geom, mat);
  patch.position.copy(normal).multiplyScalar(lift);
  patch.quaternion.setFromUnitVectors(upAxis, normal);
  patch.rotateY(seededNoise(seed + 70 + index) * Math.PI);
  patch.scale.set(
    size * (1.4 + seededNoise(seed + 80 + index) * 1.2),
    size * (0.24 + seededNoise(seed + 90 + index) * 0.16),
    size * (0.75 + seededNoise(seed + 100 + index) * 0.65),
  );
  mesh.add(patch);
  return patch;
}

function addAsteroidSurfaceDetails(
  mesh: THREE.Mesh,
  radius: number,
  seed: number,
  gravityClass: AsteroidGravityClass,
  richness: number,
): void {
  // Rock bumps appear on medium+ rocks; glowing iron veins only on big OR
  // genuinely dense rocks, where they read as a "this one pulls hard" signal
  // rather than noise. Tiny rocks stay clean — their pull is negligible and
  // their density already shows through the body tint.
  const rockCount = Math.min(7, Math.max(0, Math.floor(radius / 75)));
  if (rockCount <= 0 && gravityClass === 'ordinary') return;

  const geom = new THREE.SphereGeometry(1, 8, 6);
  const normal = new THREE.Vector3();

  for (let i = 0; i < rockCount; i++) {
    surfaceNormal(seed + 200, i, normal);
    addSurfacePatch(mesh, geom, ROCK_FACE_MATERIAL, normal, seed + 210, i, 0.012 + seededNoise(seed + 220 + i) * 0.018, 1.06);
  }

  if (gravityClass === 'ordinary') return;
  const ironMaterial = gravityClass === 'strong' ? STRONG_IRON_MATERIAL : WEAK_IRON_MATERIAL;
  const ironCount = gravityClass === 'strong'
    ? Math.max(3, Math.min(9, Math.round(3 + richness * 6)))
    : Math.max(1, Math.min(4, Math.round(1 + richness * 3)));
  for (let i = 0; i < ironCount; i++) {
    surfaceNormal(seed + 500, i, normal);
    addSurfacePatch(
      mesh,
      geom,
      ironMaterial,
      normal,
      seed + 510,
      i,
      (gravityClass === 'strong' ? 0.02 : 0.014) + seededNoise(seed + 520 + i) * 0.018,
      1.075,
    );
  }
}

function massForRadius(radius: number, coreDensity: number): number {
  return Math.pow(radius, ASTEROID_TUNING.MASS_RADIUS_POWER) * ASTEROID_TUNING.MASS_COEF * coreDensity;
}

interface MakeAsteroidOptions {
  readonly coreDensity?: number;
  readonly massScale?: number;
  readonly deadIronRichness?: number;
  readonly gravityClass?: AsteroidGravityClass;
}

function makeAsteroid(
  scene: THREE.Scene,
  physics: PhysicsWorld,
  registry: ContactRegistry,
  radius: number,
  position: THREE.Vector3,
  seed: number,
  velocity = new THREE.Vector3(),
  options: MakeAsteroidOptions = {},
): Asteroid {
  const coreDensity = options.coreDensity ?? ASTEROID_TUNING.CORE_DENSITY_MIN + seededNoise(seed + 11) * ASTEROID_TUNING.CORE_DENSITY_RANGE;
  const gravityClass = options.gravityClass ?? proceduralGravityClass(seed);
  const mat = disposableMaterial(makeRockBodyMaterial(gravityClass));
  const massScale = options.massScale ?? 1;
  const deadIronRichness = options.deadIronRichness ?? gravityRichness(gravityClass, coreDensity);
  // Pull scales with mass = radius^3 × coreDensity, so density is a real
  const mesh = new THREE.Mesh(buildAsteroidGeometry(), mat);
  const squishA = 0.9 + seededNoise(seed + 602) * 0.2;
  const squishB = 0.86 + seededNoise(seed + 603) * 0.25;
  const squishC = 0.92 + seededNoise(seed + 604) * 0.16;
  const scaleX = radius * squishA;
  const scaleY = radius * squishB;
  const scaleZ = radius * squishC;
  mesh.scale.set(scaleX, scaleY, scaleZ);
  addAsteroidSurfaceDetails(mesh, radius, seed, gravityClass, deadIronRichness);
  mesh.position.copy(position);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  scene.add(mesh);

  const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(position.x, position.y, position.z);
  const body = physics.world.createRigidBody(bodyDesc);

  const hitRadius = asteroidColliderRadiusForScale(scaleX, scaleY, scaleZ);
  const colliderDesc = RAPIER.ColliderDesc.ball(hitRadius)
    .setCollisionGroups(interactionGroups(COL_ASTEROID, COL_SHIP))
    .setFriction(0)
    .setRestitution(0);
  const collider = physics.world.createCollider(colliderDesc, body);

  const asteroid: Asteroid = {
    mesh,
    position: position.clone(),
    velocity: velocity.clone(),
    radius,
    hitRadius,
    mass: gravityMass(radius, coreDensity, gravityClass) * massScale,
    coreDensity,
    gravityClass,
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

function proceduralGravityClass(seed: number): AsteroidGravityClass {
  const roll = seededNoise(seed + 401);
  if (roll < ASTEROID_TUNING.STRONG_GRAVITY_CHANCE) return 'strong';
  if (roll < ASTEROID_TUNING.STRONG_GRAVITY_CHANCE + ASTEROID_TUNING.WEAK_GRAVITY_CHANCE) return 'weak';
  return 'ordinary';
}

function gravityMass(radius: number, coreDensity: number, gravityClass: AsteroidGravityClass): number {
  if (gravityClass === 'ordinary') return 0;
  const classScale = gravityClass === 'weak' ? ASTEROID_TUNING.WEAK_GRAVITY_MASS_SCALE : 1;
  return massForRadius(radius, coreDensity) * classScale;
}

function gravityRichness(gravityClass: AsteroidGravityClass, coreDensity: number): number {
  if (gravityClass === 'ordinary') return 0;
  const densityRange = Math.max(0.0001, ASTEROID_TUNING.CORE_DENSITY_RANGE);
  const densityT = clamp01((coreDensity - ASTEROID_TUNING.CORE_DENSITY_MIN) / densityRange);
  return gravityClass === 'strong' ? 0.65 + densityT * 0.35 : 0.22 + densityT * 0.28;
}

export class AsteroidField {
  readonly asteroids: Asteroid[] = [];
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private registry: ContactRegistry;
  private seedBase: number;
  private gravityAnchors: readonly CourseGravityAnchor[];
  private course: RaceCourse | null = null;

  constructor(scene: THREE.Scene, physics: PhysicsWorld, registry: ContactRegistry, course: RaceCourse) {
    this.scene = scene;
    this.physics = physics;
    this.registry = registry;
    this.seedBase = course.seed;
    this.gravityAnchors = course.field.gravityAnchors ?? [];
    this.course = course;
    this.addProcedural();
    this.addGravityAnchors(this.gravityAnchors);
  }

  gravityClassCounts(): Record<AsteroidGravityClass, number> {
    const counts: Record<AsteroidGravityClass, number> = { ordinary: 0, weak: 0, strong: 0 };
    for (const asteroid of this.asteroids) counts[asteroid.gravityClass]++;
    return counts;
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
  regenerate(course = this.course, tuning?: AsteroidTuningPatch): void {
    if (course) {
      this.course = course;
      this.seedBase = course.seed;
      this.gravityAnchors = course.field.gravityAnchors ?? [];
    }
    if (tuning) Object.assign(ASTEROID_TUNING, tuning);
    for (const a of this.asteroids) {
      this.registry.unregister(a.colliderHandle);
      this.physics.world.removeRigidBody(a.body);
      this.scene.remove(a.mesh);
      disposeAsteroidMesh(a.mesh);
    }
    this.asteroids.length = 0;
    this.addProcedural();
    this.addGravityAnchors(this.gravityAnchors);
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
      const position = new THREE.Vector3(x, y, z);
      if (!this.realAsteroidAllowed(position, radius)) continue;
      this.asteroids.push(makeAsteroid(this.scene, this.physics, this.registry, radius, position, seed, velocity));
    }
  }

  private addGravityAnchors(anchors: readonly CourseGravityAnchor[]): void {
    anchors.forEach((anchor, index) => {
      const seed = this.seedBase + 9000 + index * 41.3;
      const [x, y, z] = anchor.position;
      const [vx, vy, vz] = anchor.drift ?? [0, 0, 0];
      const massT = clamp01((anchor.massScale - 0.68) / 0.9);
      const deadIronRichness = clamp01(anchor.visualIntensity * 0.68 + massT * 0.32);
      const coreDensity = ASTEROID_TUNING.CORE_DENSITY_MIN + ASTEROID_TUNING.CORE_DENSITY_RANGE * deadIronRichness;
      this.asteroids.push(makeAsteroid(
        this.scene,
        this.physics,
        this.registry,
        anchor.radius,
        new THREE.Vector3(x, y, z),
        seed,
        new THREE.Vector3(vx, vy, vz),
        { coreDensity, massScale: anchor.massScale, deadIronRichness, gravityClass: 'strong' },
      ));
    });
  }

  private realAsteroidAllowed(position: THREE.Vector3, radius: number): boolean {
    if (!this.course) return true;
    return this.outsideStartClearance(position, radius) && this.outsideGateClearance(position, radius);
  }

  private outsideStartClearance(position: THREE.Vector3, radius: number): boolean {
    if (!this.course) return true;
    const clearance = Math.max(420, this.course.field.routeCorridor * 0.7);
    return position.distanceTo(this.course.startPosition) >= clearance + radius;
  }

  private outsideGateClearance(position: THREE.Vector3, radius: number): boolean {
    if (!this.course) return true;
    return this.course.gates.every((gate) => this.outsideOneGateClearance(position, radius, gate));
  }

  private outsideOneGateClearance(position: THREE.Vector3, radius: number, gate: RaceGate): boolean {
    if (!this.course) return true;
    const clearance = this.course.field.gateClearance + gate.radius + radius;
    return position.distanceTo(gate.position) >= clearance;
  }

}
