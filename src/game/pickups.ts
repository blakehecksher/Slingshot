import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/world';
import { COL_PICKUP, COL_SHIP, ContactRegistry, interactionGroups } from './collision';

export type PickupKind = 'energy' | 'cargo';

export interface Pickup {
  readonly id: number;
  readonly kind: PickupKind;
  readonly mesh: THREE.Mesh;
  readonly body: RAPIER.RigidBody;
  readonly colliderHandle: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  value: number;
  alive: boolean;
  spinAxis: THREE.Vector3;
  spinRate: number;
}

export const PICKUP_TUNING = {
  // Visual / collider sizes — baked at spawn. Tweaks need a regenerate.
  ENERGY_RADIUS: 10,
  CARGO_RADIUS: 8,
  ENERGY_TRIGGER_RADIUS: 20,
  CARGO_TRIGGER_RADIUS: 20,
  // Per-second linear damping for floating cargo.
  CARGO_DRIFT_DAMPING: 0.05,
  // Seed area for energy pickups — random uniform inside this box centered
  // at origin. Tune to keep pickups inside the asteroid field.
  ENERGY_PICKUP_COUNT: 22,
  ENERGY_SEED_X_RANGE: 2200,
  ENERGY_SEED_Y_RANGE: 480,
  ENERGY_SEED_Z_NEAR: -200,
  ENERGY_SEED_Z_FAR: -3400,
};

const ENERGY_GEOM = new THREE.IcosahedronGeometry(PICKUP_TUNING.ENERGY_RADIUS, 0);
const ENERGY_MAT = new THREE.MeshStandardMaterial({
  color: 0x7ff7e8, roughness: 0.2, metalness: 0.45,
  emissive: 0x24d6c7, emissiveIntensity: 2.2,
  toneMapped: false,
});
const CARGO_GEOM = new THREE.BoxGeometry(
  PICKUP_TUNING.CARGO_RADIUS * 1.4,
  PICKUP_TUNING.CARGO_RADIUS,
  PICKUP_TUNING.CARGO_RADIUS,
);
const CARGO_MAT = new THREE.MeshStandardMaterial({
  color: 0xd06424, roughness: 0.5, metalness: 0.4,
  emissive: 0x6a2408, emissiveIntensity: 0.9,
});

export class PickupSystem {
  readonly pickups: Pickup[] = [];
  private nextId = 1;
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private registry: ContactRegistry;

  constructor(scene: THREE.Scene, physics: PhysicsWorld, registry: ContactRegistry) {
    this.scene = scene;
    this.physics = physics;
    this.registry = registry;
  }

  spawnEnergy(pos: THREE.Vector3): Pickup {
    return this._spawn('energy', pos, new THREE.Vector3(), 1);
  }

  spawnCargo(pos: THREE.Vector3, vel: THREE.Vector3, valueKg: number): Pickup {
    return this._spawn('cargo', pos, vel, valueKg);
  }

  private _spawn(kind: PickupKind, pos: THREE.Vector3, vel: THREE.Vector3, value: number): Pickup {
    const mesh = new THREE.Mesh(
      kind === 'energy' ? ENERGY_GEOM : CARGO_GEOM,
      kind === 'energy' ? ENERGY_MAT : CARGO_MAT,
    );
    mesh.position.copy(pos);
    this.scene.add(mesh);

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(pos.x, pos.y, pos.z);
    const body = this.physics.world.createRigidBody(bodyDesc);

    const triggerR = kind === 'energy' ? PICKUP_TUNING.ENERGY_TRIGGER_RADIUS : PICKUP_TUNING.CARGO_TRIGGER_RADIUS;
    const colliderDesc = RAPIER.ColliderDesc.ball(triggerR)
      .setSensor(true)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      .setCollisionGroups(interactionGroups(COL_PICKUP, COL_SHIP));
    const collider = this.physics.world.createCollider(colliderDesc, body);

    const id = this.nextId++;
    const pickup: Pickup = {
      id,
      kind,
      mesh,
      body,
      colliderHandle: collider.handle,
      position: pos.clone(),
      velocity: vel.clone(),
      value,
      alive: true,
      spinAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      spinRate: 0.4 + Math.random() * 1.2,
    };
    this.pickups.push(pickup);
    this.registry.register(collider.handle, {
      type: kind === 'energy' ? 'pickup-energy' : 'pickup-cargo',
      id,
    });
    return pickup;
  }

  collect(id: number): Pickup | undefined {
    const p = this.pickups.find((x) => x.id === id && x.alive);
    if (!p) return undefined;
    p.alive = false;
    p.mesh.visible = false;
    this.scene.remove(p.mesh);
    this.registry.unregister(p.colliderHandle);
    // removeRigidBody also removes attached colliders.
    this.physics.world.removeRigidBody(p.body);
    return p;
  }

  update(dt: number): void {
    for (const p of this.pickups) {
      if (!p.alive) continue;
      // Drift cargo chunks. Energy pickups have zero velocity so this is a no-op.
      if (p.velocity.lengthSq() > 0.0001) {
        const damp = Math.exp(-PICKUP_TUNING.CARGO_DRIFT_DAMPING * dt);
        p.velocity.multiplyScalar(damp);
        p.position.addScaledVector(p.velocity, dt);
        p.body.setNextKinematicTranslation({ x: p.position.x, y: p.position.y, z: p.position.z });
      }
      p.mesh.position.copy(p.position);
      p.mesh.rotateOnAxis(p.spinAxis, p.spinRate * dt);
    }
  }

  /** Spawn the starter scatter of energy pickups using current PICKUP_TUNING. */
  seedEnergyField(): void {
    const t = PICKUP_TUNING;
    for (let i = 0; i < t.ENERGY_PICKUP_COUNT; i++) {
      const x = (Math.random() * 2 - 1) * t.ENERGY_SEED_X_RANGE;
      const y = (Math.random() * 2 - 1) * t.ENERGY_SEED_Y_RANGE;
      const z = t.ENERGY_SEED_Z_NEAR + Math.random() * (t.ENERGY_SEED_Z_FAR - t.ENERGY_SEED_Z_NEAR);
      this.spawnEnergy(new THREE.Vector3(x, y, z));
    }
  }

  /** Tear down all pickups (energy + cargo) and re-seed energy field. */
  regenerate(): void {
    for (const p of this.pickups) {
      if (!p.alive) continue;
      p.alive = false;
      p.mesh.visible = false;
      this.scene.remove(p.mesh);
      this.registry.unregister(p.colliderHandle);
      this.physics.world.removeRigidBody(p.body);
    }
    this.pickups.length = 0;
    this.seedEnergyField();
  }

  /** Compact list (drop dead pickups). Optional, only call between major events. */
  compact(): void {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      if (!this.pickups[i].alive) this.pickups.splice(i, 1);
    }
  }
}
