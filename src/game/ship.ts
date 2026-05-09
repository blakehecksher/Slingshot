import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/world';
import type { ShipCommand } from './input';

// Build a readable placeholder ship from primitives. Vision calls for blocky,
// functional silhouettes — Cowboy Bebop sensibility. The point right now is
// that the player can read orientation at a glance from any angle: nose, wings,
// engine pods all asymmetric front-to-back and top-to-bottom.
function buildPlaceholderShip(): THREE.Object3D {
  const ship = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.65, metalness: 0.25 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x8a6240, roughness: 0.75, metalness: 0.15 });
  const cockpitMat = new THREE.MeshStandardMaterial({ color: 0x1c2a3a, roughness: 0.25, metalness: 0.6 });
  const engineMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.85, metalness: 0.2 });
  const exhaustMat = new THREE.MeshBasicMaterial({ color: 0xff7a3a });

  // Main body (Three convention: -Z is forward).
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 2.4), hullMat);
  ship.add(body);

  // Nose: cone pointing -Z.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 8), trimMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.05, -1.6);
  ship.add(nose);

  // Cockpit dome: small box on top-front. Asymmetry: pilot sits forward.
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.7), cockpitMat);
  cockpit.position.set(0, 0.45, -0.4);
  ship.add(cockpit);

  // Wings: thin cuboids extending laterally.
  const wingGeom = new THREE.BoxGeometry(1.6, 0.12, 0.9);
  const wingL = new THREE.Mesh(wingGeom, trimMat);
  wingL.position.set(-1.3, 0.0, 0.4);
  ship.add(wingL);
  const wingR = new THREE.Mesh(wingGeom, trimMat);
  wingR.position.set(1.3, 0.0, 0.4);
  ship.add(wingR);

  // Engine pods: cylinders mounted at the rear of each wing.
  const engineGeom = new THREE.CylinderGeometry(0.22, 0.26, 0.95, 12);
  const engineL = new THREE.Mesh(engineGeom, engineMat);
  engineL.rotation.x = Math.PI / 2;
  engineL.position.set(-1.6, 0.0, 0.85);
  ship.add(engineL);
  const engineR = new THREE.Mesh(engineGeom, engineMat);
  engineR.rotation.x = Math.PI / 2;
  engineR.position.set(1.6, 0.0, 0.85);
  ship.add(engineR);

  // Exhaust glow: small disc at the back of each engine. Always-bright.
  const exhaustGeom = new THREE.CircleGeometry(0.18, 12);
  const exhaustL = new THREE.Mesh(exhaustGeom, exhaustMat);
  exhaustL.position.set(-1.6, 0.0, 1.33);
  exhaustL.rotation.y = Math.PI; // face backward
  ship.add(exhaustL);
  const exhaustR = new THREE.Mesh(exhaustGeom, exhaustMat);
  exhaustR.position.set(1.6, 0.0, 1.33);
  exhaustR.rotation.y = Math.PI;
  ship.add(exhaustR);

  // Vertical tail fin so roll is readable from behind.
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.7), trimMat);
  fin.position.set(0, 0.55, 0.7);
  ship.add(fin);

  return ship;
}

// Tuning knobs. Numbers chosen for feel, not realism. Adjust freely.
// Forces are in N. Ship mass derived from collider volume × density (see
// constructor), so tune SHIP_MASS for inertia feel and *_THRUST for peak
// acceleration: peak a = THRUST / SHIP_MASS.
const SHIP_MASS = 1.0; // kg
const FORWARD_THRUST = 30 * SHIP_MASS;   // peak ~30 m/s² forward
const REVERSE_THRUST = 34 * SHIP_MASS;
const STRAFE_THRUST  = 16 * SHIP_MASS;

// Collider half-extents for the ship hull. Used both for mass derivation and
// for visual proxy sizing. Width × height × depth: 1.5 × 0.8 × 2.5 m.
const HULL_HX = 0.75;
const HULL_HY = 0.40;
const HULL_HZ = 1.25;
const HULL_VOLUME = (HULL_HX * 2) * (HULL_HY * 2) * (HULL_HZ * 2);

// Direct angular-velocity control. No torque integration — letting go of
// the stick zeros rotation immediately. Snappy, easier to tune for "feel."
const MAX_PITCH_RATE = 2.0;  // rad/s
const MAX_YAW_RATE   = 2.15;
const MAX_ROLL_RATE  = 2.2;

const BRAKE_DAMPING = 2.6;
const SPEED_ASSIST_START = 95;
const SPEED_ASSIST_FULL = 165;
const SPEED_ASSIST_DAMPING = 0.42;

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
  private _velocity = new THREE.Vector3();

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

    this.mesh = buildPlaceholderShip();
    scene.add(this.mesh);
  }

  // Apply input → impulse + angular velocity. Called every physics tick BEFORE
  // physicsWorld.step(). We use applyImpulse(force * dt) rather than addForce
  // to sidestep ambiguity about whether Rapier's force accumulator clears
  // between steps in this build — explicit per-tick impulses are unambiguous.
  applyCommand(cmd: ShipCommand, dt: number): void {
    const r = this.body.rotation();
    this._quat.set(r.x, r.y, r.z, r.w);

    // Local thrust → impulse this tick.
    const forwardScale = cmd.thrust.z < 0 ? FORWARD_THRUST * 0.73 : REVERSE_THRUST;
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
    this.applySpeedAssist(cmd, dt);

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

  private applySpeedAssist(cmd: ShipCommand, dt: number): void {
    const v = this.body.linvel();
    this._velocity.set(v.x, v.y, v.z);
    const speed = this._velocity.length();
    if (speed <= 0.001) return;

    const brakeAmount = Math.max(0, cmd.thrust.z);
    const overspeed = Math.max(0, Math.min(1, (speed - SPEED_ASSIST_START) / (SPEED_ASSIST_FULL - SPEED_ASSIST_START)));
    const damping = brakeAmount * BRAKE_DAMPING + overspeed * overspeed * SPEED_ASSIST_DAMPING;
    if (damping <= 0) return;

    const deltaV = Math.min(speed, speed * damping * dt);
    this._velocity.normalize().multiplyScalar(-deltaV * SHIP_MASS);
    this.body.applyImpulse(
      { x: this._velocity.x, y: this._velocity.y, z: this._velocity.z },
      true,
    );
  }

  applyAcceleration(acceleration: THREE.Vector3, dt: number): void {
    if (acceleration.lengthSq() === 0) return;
    this.body.applyImpulse(
      {
        x: acceleration.x * SHIP_MASS * dt,
        y: acceleration.y * SHIP_MASS * dt,
        z: acceleration.z * SHIP_MASS * dt,
      },
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
