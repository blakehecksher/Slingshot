import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/world';
import type { ShipCommand } from './input';

// Tuning knobs. Numbers chosen for feel, not realism. Adjust freely.
// Forces are in N. Ship mass derived from collider volume × density (see
// constructor), so tune SHIP_MASS for inertia feel and *_THRUST for peak
// acceleration: peak a = THRUST / SHIP_MASS.
const SHIP_MASS = 1.0; // kg
const FORWARD_THRUST = 30 * SHIP_MASS;   // peak ~30 m/s² forward
const REVERSE_THRUST = 18 * SHIP_MASS;
const STRAFE_THRUST  = 18 * SHIP_MASS;

// Collider half-extents for the ship hull. Used both for mass derivation and
// for visual proxy sizing. Width × height × depth: 1.5 × 0.8 × 2.5 m.
const HULL_HX = 0.75;
const HULL_HY = 0.40;
const HULL_HZ = 1.25;
const HULL_VOLUME = (HULL_HX * 2) * (HULL_HY * 2) * (HULL_HZ * 2);

// Direct angular-velocity control. No torque integration — letting go of
// the stick zeros rotation immediately. Snappy, easier to tune for "feel."
const MAX_PITCH_RATE = 2.5;  // rad/s
const MAX_YAW_RATE   = 2.5;
const MAX_ROLL_RATE  = 3.0;

// Linear damping is normally zero in space — we leave it that way so
// momentum carries (slingshots will need this in M2). Add small damping
// only if free flight feels uncontrollable.
const LINEAR_DAMPING  = 0.0;
const ANGULAR_DAMPING = 0.0;

export class Ship {
  readonly body: RAPIER.RigidBody;
  readonly mesh: THREE.Object3D;

  // Persistent buffers to avoid per-frame allocations.
  private _force = new THREE.Vector3();
  private _localAxis = new THREE.Vector3();
  private _quat = new THREE.Quaternion();

  constructor(physics: PhysicsWorld, scene: THREE.Scene) {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 0, 0)
      .setLinearDamping(LINEAR_DAMPING)
      .setAngularDamping(ANGULAR_DAMPING);
    this.body = physics.world.createRigidBody(desc);

    // A collider is required for Rapier to derive a real mass + inertia tensor.
    // Without one, the body has effectively zero mass and forces produce
    // ludicrous accelerations. M1 has nothing to collide with — collision
    // membership is set to 0/0 so this never reports a contact even once
    // asteroids land in M2 (we'll opt-in deliberately when collisions matter).
    const density = SHIP_MASS / HULL_VOLUME;
    const colliderDesc = RAPIER.ColliderDesc
      .cuboid(HULL_HX, HULL_HY, HULL_HZ)
      .setDensity(density)
      .setCollisionGroups(0x00000000);
    physics.world.createCollider(colliderDesc, this.body);

    // Visual proxy. M1 placeholder — will be replaced by procedural ship later.
    // From the cockpit view this is mostly invisible (camera sits at the body
    // origin), but we keep it so external observers and minimaps can see it.
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.8, 2.5),
      new THREE.MeshStandardMaterial({
        color: 0xb87333,
        roughness: 0.6,
        metalness: 0.3,
      }),
    );
    // Nose pip so we can see orientation from outside.
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 0.8, 8),
      new THREE.MeshStandardMaterial({ color: 0xeae0c8, roughness: 0.7 }),
    );
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -1.6;
    mesh.add(nose);
    this.mesh = mesh;
    scene.add(mesh);
  }

  // Apply input → impulse + angular velocity. Called every physics tick BEFORE
  // physicsWorld.step(). We use applyImpulse(force * dt) rather than addForce
  // to sidestep ambiguity about whether Rapier's force accumulator clears
  // between steps in this build — explicit per-tick impulses are unambiguous.
  applyCommand(cmd: ShipCommand, dt: number): void {
    const r = this.body.rotation();
    this._quat.set(r.x, r.y, r.z, r.w);

    // Local thrust → impulse this tick.
    const forwardScale = cmd.thrust.z < 0 ? FORWARD_THRUST : REVERSE_THRUST;
    this._force.set(
      cmd.thrust.x * STRAFE_THRUST,
      cmd.thrust.y * STRAFE_THRUST,
      cmd.thrust.z * forwardScale,
    );
    this._force.applyQuaternion(this._quat);
    this._force.multiplyScalar(dt);
    if (this._force.lengthSq() > 0) {
      this.body.applyImpulse(
        { x: this._force.x, y: this._force.y, z: this._force.z },
        true,
      );
    }

    // Direct angular-velocity control in ship-local axes (zero when no input).
    this._localAxis.set(
      cmd.rotate.pitch * MAX_PITCH_RATE,
      cmd.rotate.yaw * MAX_YAW_RATE,
      -cmd.rotate.roll * MAX_ROLL_RATE,
    );
    this._localAxis.applyQuaternion(this._quat);
    this.body.setAngvel(
      { x: this._localAxis.x, y: this._localAxis.y, z: this._localAxis.z },
      true,
    );
  }

  // Sync the visual mesh from the physics body. Called once per render frame
  // (not per physics tick) so we get the smoothest visual.
  syncMeshFromBody(): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.mesh.position.set(t.x, t.y, t.z);
    this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }

  // Convenience accessors used by camera / HUD / future minimap.
  get position(): { x: number; y: number; z: number } {
    return this.body.translation();
  }

  get linearVelocity(): { x: number; y: number; z: number } {
    return this.body.linvel();
  }

  get speed(): number {
    const v = this.body.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }
}
