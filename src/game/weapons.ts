import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/world';
import type { Asteroid } from './asteroids';
import {
  COL_ASTEROID,
  COL_ENEMY,
  COL_PROJECTILE,
  COL_SHIP,
  ContactRegistry,
  interactionGroups,
} from './collision';
import { sampleGravityAt } from './gravity';

// Projectile system. Each shot is a dynamic Rapier rigid body with a sphere
// collider, plus a small THREE mesh for visibility. Per tick we apply
// gravity acceleration so projectiles curve in wells (vision: "Combat is a
// gravity problem"). Owner kind keeps friendly fire off — the player's own
// projectiles do not collide with the player ship; enemy projectiles do not
// collide with enemies.

export const WEAPON_TUNING = {
  PROJECTILE_TTL_SEC: 2.4,
  PROJECTILE_RADIUS: 0.7,
  PROJECTILE_VISUAL_SCALE: 1.1,
  PROJECTILE_DENSITY: 0.02,
  // Visual trail length in world units behind the projectile.
  TRAIL_LEN: 14.0,
};

export type ProjectileOwnerKind = 'player' | 'enemy';

export interface Projectile {
  readonly id: number;
  readonly body: RAPIER.RigidBody;
  readonly colliderHandle: number;
  readonly mesh: THREE.Mesh;
  readonly trail: THREE.Mesh;
  alive: boolean;
  ageSec: number;
  damage: number;
  ownerKind: ProjectileOwnerKind;
}

const PLAYER_BULLET_GEOM = new THREE.SphereGeometry(WEAPON_TUNING.PROJECTILE_RADIUS, 6, 6);
const PLAYER_BULLET_MAT = new THREE.MeshBasicMaterial({
  color: 0xffd06a,
  toneMapped: false,
  transparent: true,
  opacity: 0.95,
});
const ENEMY_BULLET_MAT = new THREE.MeshBasicMaterial({
  color: 0x6dd6ff,
  toneMapped: false,
  transparent: true,
  opacity: 0.95,
});

const TRAIL_GEOM = new THREE.CylinderGeometry(0.18, 0.04, WEAPON_TUNING.TRAIL_LEN, 6);
TRAIL_GEOM.translate(0, WEAPON_TUNING.TRAIL_LEN * 0.5, 0);
const TRAIL_MAT_PLAYER = new THREE.MeshBasicMaterial({
  color: 0xff9a3a,
  blending: THREE.AdditiveBlending,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  toneMapped: false,
});
const TRAIL_MAT_ENEMY = new THREE.MeshBasicMaterial({
  color: 0x35d6ff,
  blending: THREE.AdditiveBlending,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  toneMapped: false,
});

const tmpPos = new THREE.Vector3();
const tmpVel = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpUp = new THREE.Vector3(0, 1, 0);

export class WeaponSystem {
  readonly projectiles: Projectile[] = [];
  private nextId = 1;
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private registry: ContactRegistry;

  constructor(scene: THREE.Scene, physics: PhysicsWorld, registry: ContactRegistry) {
    this.scene = scene;
    this.physics = physics;
    this.registry = registry;
  }

  /** Spawn a single projectile from a given world position + direction. */
  spawn(
    ownerKind: ProjectileOwnerKind,
    position: THREE.Vector3,
    direction: THREE.Vector3,
    inheritVel: THREE.Vector3,
    muzzleSpeed: number,
    damage: number,
  ): Projectile {
    const id = this.nextId++;

    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(0)
      .setAngularDamping(0)
      .setCcdEnabled(true);
    const body = this.physics.world.createRigidBody(desc);

    const filter = ownerKind === 'player'
      ? COL_ASTEROID | COL_ENEMY
      : COL_ASTEROID | COL_SHIP;
    const colliderDesc = RAPIER.ColliderDesc.ball(WEAPON_TUNING.PROJECTILE_RADIUS)
      .setDensity(WEAPON_TUNING.PROJECTILE_DENSITY)
      .setCollisionGroups(interactionGroups(COL_PROJECTILE, filter))
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      .setFriction(0)
      .setRestitution(0);
    const collider = this.physics.world.createCollider(colliderDesc, body);

    const dir = direction.clone().normalize();
    const vx = inheritVel.x + dir.x * muzzleSpeed;
    const vy = inheritVel.y + dir.y * muzzleSpeed;
    const vz = inheritVel.z + dir.z * muzzleSpeed;
    body.setLinvel({ x: vx, y: vy, z: vz }, true);

    const mesh = new THREE.Mesh(PLAYER_BULLET_GEOM, ownerKind === 'player' ? PLAYER_BULLET_MAT : ENEMY_BULLET_MAT);
    mesh.scale.setScalar(WEAPON_TUNING.PROJECTILE_VISUAL_SCALE);
    mesh.position.copy(position);
    this.scene.add(mesh);

    const trail = new THREE.Mesh(TRAIL_GEOM, ownerKind === 'player' ? TRAIL_MAT_PLAYER : TRAIL_MAT_ENEMY);
    trail.position.copy(position);
    trail.quaternion.setFromUnitVectors(tmpUp, dir.clone().multiplyScalar(-1));
    this.scene.add(trail);

    const proj: Projectile = {
      id,
      body,
      colliderHandle: collider.handle,
      mesh,
      trail,
      alive: true,
      ageSec: 0,
      damage,
      ownerKind,
    };
    this.projectiles.push(proj);
    this.registry.register(collider.handle, { type: 'projectile', id, ownerKind });
    return proj;
  }

  /** Per fixed step: apply gravity acceleration; advance TTL. */
  update(dt: number, asteroids: readonly Asteroid[]): void {
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.ageSec += dt;
      if (p.ageSec >= WEAPON_TUNING.PROJECTILE_TTL_SEC) {
        this.kill(p);
        continue;
      }
      const t = p.body.translation();
      tmpPos.set(t.x, t.y, t.z);
      const sample = sampleGravityAt(tmpPos, asteroids);
      if (sample.acceleration.lengthSq() > 0) {
        // F = m*a; impulse = m*a*dt. With dynamic body Rapier infers mass from
        // collider density × volume. Use applyImpulse so curving feels real.
        const mass = p.body.mass();
        p.body.applyImpulse(
          {
            x: sample.acceleration.x * mass * dt,
            y: sample.acceleration.y * mass * dt,
            z: sample.acceleration.z * mass * dt,
          },
          true,
        );
      }
    }
  }

  /** Per render frame: sync visuals to physics. Trail orients along velocity. */
  syncVisuals(): void {
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      const t = p.body.translation();
      const v = p.body.linvel();
      p.mesh.position.set(t.x, t.y, t.z);
      tmpVel.set(v.x, v.y, v.z);
      const speed = tmpVel.length();
      if (speed > 0.001) {
        tmpVel.divideScalar(speed);
        tmpQuat.setFromUnitVectors(tmpUp, tmpVel.clone().multiplyScalar(-1));
        p.trail.position.set(t.x, t.y, t.z);
        p.trail.quaternion.copy(tmpQuat);
      }
    }
  }

  kill(p: Projectile): void {
    if (!p.alive) return;
    p.alive = false;
    this.registry.unregister(p.colliderHandle);
    this.scene.remove(p.mesh);
    this.scene.remove(p.trail);
    this.physics.world.removeRigidBody(p.body);
  }

  killById(id: number): void {
    const p = this.projectiles.find((x) => x.id === id && x.alive);
    if (p) this.kill(p);
  }

  /** Drop dead entries to keep the array small. Call between major events. */
  compact(): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (!this.projectiles[i].alive) this.projectiles.splice(i, 1);
    }
  }
}

/** Player firing helper. Computes muzzle world transform from ship attachment
 *  and pulls weapon stats from ship.mods. Returns true if a shot fired (at
 *  least one mounted weapon and cooldown elapsed). */
export class PlayerWeaponController {
  private cooldown = 0;
  private weapons: WeaponSystem;

  constructor(weapons: WeaponSystem) {
    this.weapons = weapons;
  }

  tick(
    dt: number,
    fire: boolean,
    ship: import('./ship').Ship,
  ): boolean {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!fire) return false;
    const damage = ship.mods.weaponDamage;
    const rof = ship.mods.weaponRof;
    const muzzle = ship.mods.weaponMuzzle;
    if (damage <= 0 || rof <= 0 || muzzle <= 0) return false;
    if (this.cooldown > 0) return false;

    this.cooldown = 1 / rof;

    const r = ship.body.rotation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const v = ship.body.linvel();
    const inherit = new THREE.Vector3(v.x, v.y, v.z);

    let fired = false;
    for (const slot of ['weapon-l', 'weapon-r'] as const) {
      const node = ship.attachments[slot];
      if (!node) continue;
      node.updateWorldMatrix(true, false);
      const muzzlePos = new THREE.Vector3();
      node.getWorldPosition(muzzlePos);
      // Spawn slightly ahead so we don't immediately hit the firing ship.
      muzzlePos.addScaledVector(dir, 1.5);
      this.weapons.spawn('player', muzzlePos, dir, inherit, muzzle, damage);
      fired = true;
    }
    return fired;
  }
}
