import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/world';
import type { Asteroid } from './asteroids';
import {
  COL_ENEMY,
  COL_PROJECTILE,
  COL_SHIP,
  ContactRegistry,
  interactionGroups,
} from './collision';
import { sampleGravityAt } from './gravity';
import type { PickupSystem } from './pickups';
import type { WeaponSystem } from './weapons';

// Light enemy AI. Each enemy is a primitive ship body with a basic state
// machine (patrol -> engage -> flee -> dead). Enemies do not mine; they
// scatter ore on death so the player has a reason to engage. Vision §Enemies:
// "not clever pilots" — kept intentionally simple.

export const ENEMY_TUNING = {
  COUNT: 32,
  ENGAGE_RANGE: 1100,
  FLEE_HP_FRAC: 0.28,
  FIRE_RANGE: 720,
  FIRE_COOLDOWN_MIN: 0.9,
  FIRE_COOLDOWN_MAX: 1.6,
  MAX_SPEED: 110,
  HP_MAX: 50,
  CARGO_REWARD_KG: 250,
  BANK_REWARD_KG: 80,
  THRUST: 70,
  TURN_RATE: 1.1,
  RESPAWN_DELAY_SEC: 18,
  // Spawn shell. Spread through whole field now that world is sphere-shaped.
  SPAWN_INNER: 600,
  SPAWN_OUTER: 4400,
  // Min asteroid clearance at spawn (rejection sample). Avoids stuck-in-rock.
  SPAWN_MIN_CLEARANCE: 90,
  // Visual scale multiplier on enemy mesh.
  VISUAL_SCALE: 1.6,
  // Half-extents for collider (scaled with VISUAL_SCALE in spawn()).
  HX: 1.0, HY: 0.5, HZ: 1.4,
};

type EnemyState = 'patrol' | 'engage' | 'flee' | 'dead';

export interface Enemy {
  readonly id: number;
  readonly body: RAPIER.RigidBody;
  readonly colliderHandle: number;
  readonly mesh: THREE.Group;
  hp: number;
  state: EnemyState;
  fireCooldown: number;
  patrolTarget: THREE.Vector3;
  patrolRetargetSec: number;
  respawnTimer: number;
  alive: boolean;
}

const HULL_MAT = new THREE.MeshStandardMaterial({ color: 0x4a3245, roughness: 0.55, metalness: 0.45 });
const ACCENT_MAT = new THREE.MeshStandardMaterial({
  color: 0xff4a3a,
  roughness: 0.4,
  metalness: 0.5,
  emissive: 0xc8200a,
  emissiveIntensity: 1.4,
  toneMapped: false,
});
const COCKPIT_MAT = new THREE.MeshStandardMaterial({
  color: 0xff7a3a,
  roughness: 0.18,
  metalness: 0.4,
  emissive: 0xff3a10,
  emissiveIntensity: 2.4,
  toneMapped: false,
});
const HALO_MAT = new THREE.MeshBasicMaterial({
  color: 0xff5a2a,
  transparent: true,
  opacity: 0.55,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});

function buildEnemyMesh(): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 2.4), HULL_MAT);
  g.add(hull);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 6), HULL_MAT);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -1.7;
  g.add(nose);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.85), ACCENT_MAT);
  fin.position.set(0, 0.7, 0.7);
  g.add(fin);
  for (const side of [-1, 1] as const) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.65), HULL_MAT);
    wing.position.set(side * 1.1, -0.05, 0.35);
    wing.rotation.y = side * 0.18;
    g.add(wing);
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.95, 10), ACCENT_MAT);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side * 0.6, -0.1, 1.2);
    g.add(engine);
    // Wingtip running lights — bright dots so they read at long range.
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), COCKPIT_MAT);
    tip.position.set(side * 1.85, 0.0, 0.55);
    g.add(tip);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), COCKPIT_MAT);
  eye.position.set(0, 0.32, -0.5);
  g.add(eye);
  // Halo billboard around eye — additive sprite-ish disc, always visible.
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 10), HALO_MAT);
  halo.position.copy(eye.position);
  g.add(halo);
  // Strong local glow so they read at distance through fog/dark.
  const glow = new THREE.PointLight(0xff5a2a, 4.2, 60, 1.8);
  glow.position.set(0, 0.1, 0);
  g.add(glow);
  return g;
}

const tmpDelta = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpForward = new THREE.Vector3(0, 0, -1);

export class EnemyManager {
  readonly enemies: Enemy[] = [];
  private nextId = 1;
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private registry: ContactRegistry;
  private weapons: WeaponSystem;
  private pickups: PickupSystem;
  private asteroidsRef: readonly Asteroid[] = [];

  constructor(
    scene: THREE.Scene,
    physics: PhysicsWorld,
    registry: ContactRegistry,
    weapons: WeaponSystem,
    pickups: PickupSystem,
  ) {
    this.scene = scene;
    this.physics = physics;
    this.registry = registry;
    this.weapons = weapons;
    this.pickups = pickups;
  }

  seed(asteroids: readonly Asteroid[]): void {
    this.asteroidsRef = asteroids;
    for (let i = 0; i < ENEMY_TUNING.COUNT; i++) {
      this.spawnAtRandom();
    }
  }

  spawnAtRandom(): Enemy {
    const pos = this.findClearSpawn();
    return this.spawn(pos);
  }

  private findClearSpawn(): THREE.Vector3 {
    const t = ENEMY_TUNING;
    let best = new THREE.Vector3();
    let bestClearance = -Infinity;
    for (let attempt = 0; attempt < 12; attempt++) {
      // Uniform point in spherical shell.
      const u = Math.random();
      const v = Math.random();
      const w = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const r = t.SPAWN_INNER + (t.SPAWN_OUTER - t.SPAWN_INNER) * Math.cbrt(w);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      const candidate = new THREE.Vector3(x, y, z);
      const clearance = this.minAsteroidClearance(candidate);
      if (clearance > bestClearance) {
        bestClearance = clearance;
        best.copy(candidate);
      }
      if (clearance >= t.SPAWN_MIN_CLEARANCE) return candidate;
    }
    return best;
  }

  private minAsteroidClearance(p: THREE.Vector3): number {
    let best = Infinity;
    for (const a of this.asteroidsRef) {
      const dx = a.position.x - p.x;
      const dy = a.position.y - p.y;
      const dz = a.position.z - p.z;
      const d = Math.hypot(dx, dy, dz) - a.radius;
      if (d < best) best = d;
    }
    return best;
  }

  spawn(pos: THREE.Vector3): Enemy {
    const id = this.nextId++;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.2)
      .setAngularDamping(2.0);
    const body = this.physics.world.createRigidBody(desc);
    const s = ENEMY_TUNING.VISUAL_SCALE;
    // No COL_ASTEROID in filter: enemies ghost through rocks rather than
    // getting flung by collisions. Their AI is dumb — letting them clip is
    // less broken than having them launched off the map. Player ship + enemy
    // projectiles still hit them.
    const colDesc = RAPIER.ColliderDesc
      .cuboid(ENEMY_TUNING.HX * s, ENEMY_TUNING.HY * s, ENEMY_TUNING.HZ * s)
      .setDensity(0.6)
      .setCollisionGroups(interactionGroups(COL_ENEMY, COL_SHIP | COL_PROJECTILE))
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      .setFriction(0.3)
      .setRestitution(0.0);
    const collider = this.physics.world.createCollider(colDesc, body);

    const mesh = buildEnemyMesh();
    mesh.scale.setScalar(s);
    mesh.position.copy(pos);
    this.scene.add(mesh);

    const e: Enemy = {
      id,
      body,
      colliderHandle: collider.handle,
      mesh,
      hp: ENEMY_TUNING.HP_MAX,
      state: 'patrol',
      fireCooldown: ENEMY_TUNING.FIRE_COOLDOWN_MIN + Math.random(),
      patrolTarget: this.randomPatrolTarget(),
      patrolRetargetSec: 8 + Math.random() * 6,
      respawnTimer: 0,
      alive: true,
    };
    this.enemies.push(e);
    this.registry.register(collider.handle, { type: 'enemy', id });
    return e;
  }

  private randomPatrolTarget(): THREE.Vector3 {
    return this.findClearSpawn();
  }

  update(
    dt: number,
    playerPos: { x: number; y: number; z: number },
    playerHasCargo: boolean,
    playerVel: { x: number; y: number; z: number },
    asteroids: readonly Asteroid[],
  ): void {
    for (const e of this.enemies) {
      if (!e.alive) {
        e.respawnTimer += dt;
        continue;
      }

      const t = e.body.translation();
      const v = e.body.linvel();
      tmpDelta.set(playerPos.x - t.x, playerPos.y - t.y, playerPos.z - t.z);
      const distToPlayer = tmpDelta.length();

      // State transitions.
      const lowHp = e.hp / ENEMY_TUNING.HP_MAX < ENEMY_TUNING.FLEE_HP_FRAC;
      if (lowHp) e.state = 'flee';
      else if (playerHasCargo && distToPlayer < ENEMY_TUNING.ENGAGE_RANGE) e.state = 'engage';
      else e.state = 'patrol';

      let target: THREE.Vector3;
      if (e.state === 'engage') {
        // Lead the player a little for dumb-but-not-stupid intercept.
        target = tmpDelta.clone().multiplyScalar(0.55).add(new THREE.Vector3(t.x, t.y, t.z));
        target.x += playerVel.x * 0.4;
        target.y += playerVel.y * 0.4;
        target.z += playerVel.z * 0.4;
      } else if (e.state === 'flee') {
        // Head away from player.
        target = new THREE.Vector3(t.x, t.y, t.z).addScaledVector(tmpDelta.clone().normalize(), -1500);
      } else {
        e.patrolRetargetSec -= dt;
        if (e.patrolRetargetSec <= 0 || tmpDeltaToTarget(t, e.patrolTarget) < 200) {
          e.patrolTarget = this.randomPatrolTarget();
          e.patrolRetargetSec = 8 + Math.random() * 6;
        }
        target = e.patrolTarget;
      }

      // Steer toward target. Compute desired direction; lerp current rotation
      // toward it; apply forward thrust along ship-forward.
      tmpDir.set(target.x - t.x, target.y - t.y, target.z - t.z);
      const distToTarget = tmpDir.length();
      if (distToTarget > 0.01) tmpDir.divideScalar(distToTarget);

      const desiredQuat = tmpQuat.setFromUnitVectors(tmpForward, tmpDir);
      const r = e.body.rotation();
      const cur = new THREE.Quaternion(r.x, r.y, r.z, r.w);
      cur.slerp(desiredQuat, Math.min(1, ENEMY_TUNING.TURN_RATE * dt));
      e.body.setRotation({ x: cur.x, y: cur.y, z: cur.z, w: cur.w }, true);

      // Forward thrust.
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cur);
      const speed = Math.hypot(v.x, v.y, v.z);
      const throttle = e.state === 'flee' ? 1.0 : 0.78;
      if (speed < ENEMY_TUNING.MAX_SPEED) {
        const mass = e.body.mass();
        const f = ENEMY_TUNING.THRUST * mass * throttle * dt;
        e.body.applyImpulse({ x: fwd.x * f, y: fwd.y * f, z: fwd.z * f }, true);
      }

      // Apply gravity.
      const sample = sampleGravityAt(new THREE.Vector3(t.x, t.y, t.z), asteroids);
      if (sample.acceleration.lengthSq() > 0) {
        const mass = e.body.mass();
        e.body.applyImpulse({
          x: sample.acceleration.x * mass * dt,
          y: sample.acceleration.y * mass * dt,
          z: sample.acceleration.z * mass * dt,
        }, true);
      }

      // Firing.
      e.fireCooldown -= dt;
      if (e.state === 'engage' && distToPlayer < ENEMY_TUNING.FIRE_RANGE && e.fireCooldown <= 0) {
        const muzzleAt = new THREE.Vector3(t.x, t.y, t.z).addScaledVector(fwd, 2.0);
        this.weapons.spawn(
          'enemy',
          muzzleAt,
          fwd,
          new THREE.Vector3(v.x, v.y, v.z),
          560,
          14,
        );
        e.fireCooldown = ENEMY_TUNING.FIRE_COOLDOWN_MIN + Math.random() * (ENEMY_TUNING.FIRE_COOLDOWN_MAX - ENEMY_TUNING.FIRE_COOLDOWN_MIN);
      }

      e.mesh.position.set(t.x, t.y, t.z);
      e.mesh.quaternion.copy(cur);
    }

    // Lazy fill — if ENEMY_TUNING.COUNT was raised live via the panel, top
    // up the roster (one new enemy per tick to avoid burst spawning).
    if (this.enemies.length < ENEMY_TUNING.COUNT) {
      this.spawnAtRandom();
    }

    // Respawn dead enemies after a delay so the field stays populated.
    for (const e of this.enemies) {
      if (e.alive) continue;
      if (e.respawnTimer < ENEMY_TUNING.RESPAWN_DELAY_SEC) continue;
      // Reincarnate this slot at a fresh clear spot.
      const found = this.findClearSpawn();
      e.body.setTranslation({ x: found.x, y: found.y, z: found.z }, true);
      e.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      e.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      e.hp = ENEMY_TUNING.HP_MAX;
      e.state = 'patrol';
      e.patrolTarget = this.randomPatrolTarget();
      e.patrolRetargetSec = 6 + Math.random() * 6;
      e.respawnTimer = 0;
      e.alive = true;
      e.mesh.visible = true;
      const collider = this.physics.world.getCollider(e.colliderHandle);
      if (collider) collider.setEnabled(true);
    }
  }

  /** Apply damage from a projectile hit; returns true if killed. */
  applyDamage(id: number, amount: number): { killed: boolean; pos: THREE.Vector3 } | null {
    const e = this.enemies.find((x) => x.id === id && x.alive);
    if (!e) return null;
    e.hp = Math.max(0, e.hp - amount);
    if (e.hp <= 0) {
      const t = e.body.translation();
      const pos = new THREE.Vector3(t.x, t.y, t.z);
      this.kill(e);
      return { killed: true, pos };
    }
    return { killed: false, pos: new THREE.Vector3() };
  }

  private kill(e: Enemy): void {
    e.alive = false;
    e.mesh.visible = false;
    const collider = this.physics.world.getCollider(e.colliderHandle);
    if (collider) collider.setEnabled(false);
    e.respawnTimer = 0;
    // Scatter reward.
    const v = e.body.linvel();
    const t = e.body.translation();
    const drift = new THREE.Vector3(v.x, v.y, v.z).multiplyScalar(0.2);
    for (let i = 0; i < 3; i++) {
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
      );
      const dropPos = new THREE.Vector3(t.x, t.y, t.z).add(offset);
      this.pickups.spawnCargo(dropPos, drift.clone(), ENEMY_TUNING.CARGO_REWARD_KG / 3);
    }
  }
}

function tmpDeltaToTarget(from: { x: number; y: number; z: number }, to: THREE.Vector3): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  return Math.hypot(dx, dy, dz);
}
