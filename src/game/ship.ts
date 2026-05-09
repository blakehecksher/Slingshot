import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/world';
import { COL_ASTEROID, COL_BASE, COL_PICKUP, COL_SHIP, interactionGroups } from './collision';
import type { ShipCommand } from './input';

// Build a readable Sparrow-style ship from primitives. Functional silhouette:
// cream hull, orange accents, teal cockpit, swept wings, twin rear engines.
// Attachment-point Object3Ds at known offsets so Phase 3 upgrades can mount
// visible bits without rewriting the ship.

interface BuiltShip {
  root: THREE.Object3D;
  attachments: Record<AttachmentName, THREE.Object3D>;
}

export type AttachmentName =
  | 'nose'
  | 'wing-l'
  | 'wing-r'
  | 'engine-l'
  | 'engine-r'
  | 'topspine'
  | 'cargo-bay';

const PALETTE = {
  hull:    0xe7d8b3, // cream
  accent:  0xd06424, // orange
  cockpit: 0x2c5d63, // teal glass
  trim:    0x6b3a1c, // dark orange-brown
  engine:  0x1f1d1b, // near-black
  exhaust: 0xff7a3a, // exhaust glow
} as const;

function buildPlaceholderShip(): BuiltShip {
  const root = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({ color: PALETTE.hull, roughness: 0.55, metalness: 0.25 });
  const accentMat = new THREE.MeshStandardMaterial({ color: PALETTE.accent, roughness: 0.45, metalness: 0.35 });
  const trimMat = new THREE.MeshStandardMaterial({ color: PALETTE.trim, roughness: 0.7, metalness: 0.15 });
  const cockpitMat = new THREE.MeshStandardMaterial({
    color: PALETTE.cockpit, roughness: 0.15, metalness: 0.7, emissive: 0x07252a, emissiveIntensity: 0.4,
  });
  const engineMat = new THREE.MeshStandardMaterial({ color: PALETTE.engine, roughness: 0.85, metalness: 0.2 });
  const exhaustMat = new THREE.MeshBasicMaterial({ color: PALETTE.exhaust });

  // Main fuselage. Tapered along Z by stacking three boxes — front narrow,
  // middle wide, rear narrow-ish.
  const midHull = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.62, 1.6), hullMat);
  midHull.position.set(0, 0, 0);
  root.add(midHull);

  const frontHull = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.5, 0.9), hullMat);
  frontHull.position.set(0, 0.02, -1.1);
  root.add(frontHull);

  const rearHull = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.55, 0.7), hullMat);
  rearHull.position.set(0, -0.02, 1.1);
  root.add(rearHull);

  // Orange accent stripe on top of the mid hull (visible from above + sides).
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 1.55), accentMat);
  stripe.position.set(0, 0.34, 0);
  root.add(stripe);

  // Nose: narrow swept cone.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.0, 8), trimMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.0, -2.05);
  root.add(nose);

  // Cockpit canopy: stretched dome made from a scaled half-sphere.
  const canopyGeom = new THREE.SphereGeometry(0.42, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const canopy = new THREE.Mesh(canopyGeom, cockpitMat);
  canopy.scale.set(0.95, 0.7, 1.55);
  canopy.position.set(0, 0.32, -0.5);
  root.add(canopy);

  // Wings: swept-back trapezoidal-ish via tapered boxes. Use ExtrudeGeometry
  // would be heavier; cheap approximation = two rotated thin boxes.
  function makeWing(side: 1 | -1): THREE.Object3D {
    const wing = new THREE.Group();
    const inner = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.10, 0.85), accentMat);
    inner.position.set(side * 0.95, 0.0, 0.25);
    wing.add(inner);
    const outer = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.55), trimMat);
    outer.position.set(side * 1.7, 0.0, 0.55);
    wing.add(outer);
    // Tip light
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshBasicMaterial({ color: side > 0 ? 0x3affa0 : 0xff5a4a }));
    tip.position.set(side * 2.0, 0.0, 0.65);
    wing.add(tip);
    return wing;
  }
  root.add(makeWing(-1));
  root.add(makeWing(1));

  // Twin rear engines, low on the hull.
  function makeEngine(side: 1 | -1): THREE.Object3D {
    const eng = new THREE.Group();
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.95, 12), engineMat);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(side * 0.55, -0.12, 1.3);
    eng.add(pod);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.04, 8, 18), accentMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(side * 0.55, -0.12, 1.78);
    eng.add(ring);
    const exhaust = new THREE.Mesh(new THREE.CircleGeometry(0.20, 14), new THREE.MeshBasicMaterial({ color: PALETTE.exhaust }));
    exhaust.position.set(side * 0.55, -0.12, 1.79);
    exhaust.rotation.y = Math.PI;
    eng.add(exhaust);
    return eng;
  }
  root.add(makeEngine(-1));
  root.add(makeEngine(1));
  void exhaustMat; // material defined for parity with prior version

  // Vertical tail fin (orange tipped, readable for roll).
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.55), trimMat);
  fin.position.set(0, 0.5, 0.95);
  root.add(fin);
  const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.4), accentMat);
  finTip.position.set(0, 0.78, 0.95);
  root.add(finTip);

  // Attachment-point Object3Ds — empty Object3D children at known offsets.
  // Phase 3 upgrades will parent visible bits to these without ship rewrite.
  function attach(name: AttachmentName, x: number, y: number, z: number): THREE.Object3D {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, z);
    root.add(o);
    return o;
  }
  const attachments: Record<AttachmentName, THREE.Object3D> = {
    'nose':      attach('nose',      0,    0.05, -2.4),
    'wing-l':    attach('wing-l',   -1.7,  0.0,   0.55),
    'wing-r':    attach('wing-r',    1.7,  0.0,   0.55),
    'engine-l':  attach('engine-l', -0.55, -0.12, 1.85),
    'engine-r':  attach('engine-r',  0.55, -0.12, 1.85),
    'topspine':  attach('topspine',  0,    0.5,   0.0),
    'cargo-bay': attach('cargo-bay', 0,   -0.35,  0.4),
  };

  return { root, attachments };
}

// Tuning knobs. Numbers chosen for feel, not realism. All are read each tick
// so live-mutating SHIP_TUNING via the debug panel takes effect immediately.
export const SHIP_TUNING = {
  MASS: 1.0, // kg (only read at construction; tweaks need ship rebuild)
  FORWARD_THRUST: 120,
  REVERSE_THRUST: 120,
  STRAFE_THRUST: 24,
  // Multiplier on forward thrust direction. <1 = forward is weaker than
  // reverse (asymmetric feel). 1.0 = symmetric. Tune per taste.
  FORWARD_THRUST_BIAS: 0.73,

  MAX_PITCH_RATE: 1.1,  // rad/s
  MAX_YAW_RATE: 1.5,
  MAX_ROLL_RATE: 1.5,

  // Brake (LT) applies a velocity-damping force scaled by trigger value.
  // Higher = stronger brake.
  BRAKE_DAMPING: 2.6,
  // Auto-overspeed damping. Above SPEED_ASSIST_START m/s, damping ramps in;
  // peaks at SPEED_ASSIST_FULL with magnitude SPEED_ASSIST_DAMPING.
  SPEED_ASSIST_START: 95,
  SPEED_ASSIST_FULL: 297,
  SPEED_ASSIST_DAMPING: 0.85,

  // Boost: extra forward thrust + faster energy drain when boost button held.
  // Applied as multiplier on forward thrust (1 = no change, 2 = double).
  BOOST_THRUST_MULT: 2.5,
  // Energy drain multiplier while boosting.
  BOOST_ENERGY_MULT: 4.0,
};

// Hull collider half-extents. Baked at construction — not live tunable.
const HULL_HX = 0.75;
const HULL_HY = 0.40;
const HULL_HZ = 1.25;
const HULL_VOLUME = (HULL_HX * 2) * (HULL_HY * 2) * (HULL_HZ * 2);

const LINEAR_DAMPING  = 0.0;
const ANGULAR_DAMPING = 0.0;

export class Ship {
  readonly body: RAPIER.RigidBody;
  readonly mesh: THREE.Object3D;
  readonly colliderHandle: number;
  readonly attachments: Record<AttachmentName, THREE.Object3D>;

  private _force = new THREE.Vector3();
  private _localAxis = new THREE.Vector3();
  private _quat = new THREE.Quaternion();
  private _velocity = new THREE.Vector3();
  private _physics: PhysicsWorld;
  private _frozen = false;
  private _thrustEnabled = true;
  private _thrustScale = 1;

  constructor(physics: PhysicsWorld, scene: THREE.Scene) {
    this._physics = physics;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 0, 0)
      .setLinearDamping(LINEAR_DAMPING)
      .setAngularDamping(ANGULAR_DAMPING);
    this.body = physics.world.createRigidBody(desc);

    const density = SHIP_TUNING.MASS / HULL_VOLUME;
    const colliderDesc = RAPIER.ColliderDesc
      .cuboid(HULL_HX, HULL_HY, HULL_HZ)
      .setDensity(density)
      .setCollisionGroups(interactionGroups(COL_SHIP, COL_ASTEROID | COL_PICKUP | COL_BASE))
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      .setFriction(0.1)
      .setRestitution(0.05);
    const collider = physics.world.createCollider(colliderDesc, this.body);
    this.colliderHandle = collider.handle;

    const built = buildPlaceholderShip();
    this.mesh = built.root;
    this.attachments = built.attachments;
    scene.add(this.mesh);
  }

  applyCommand(cmd: ShipCommand, dt: number): void {
    if (this._frozen) return;
    const r = this.body.rotation();
    this._quat.set(r.x, r.y, r.z, r.w);

    if (this._thrustEnabled) {
      const mass = SHIP_TUNING.MASS;
      // Boost only multiplies forward direction (cmd.thrust.z < 0).
      const boost = Math.max(0, Math.min(1, cmd.boost ?? 0));
      const boostMult = 1 + boost * (SHIP_TUNING.BOOST_THRUST_MULT - 1);
      const forwardScale = cmd.thrust.z < 0
        ? SHIP_TUNING.FORWARD_THRUST * SHIP_TUNING.FORWARD_THRUST_BIAS * mass * boostMult
        : SHIP_TUNING.REVERSE_THRUST * mass;
      const strafe = SHIP_TUNING.STRAFE_THRUST * mass;
      this._force.set(
        cmd.thrust.x * strafe,
        cmd.thrust.y * strafe,
        cmd.thrust.z * forwardScale,
      );
      this._force.multiplyScalar(this._thrustScale);
      this._force.applyQuaternion(this._quat);
      this._force.multiplyScalar(dt);
      if (this._force.lengthSq() > 0) {
        this.body.applyImpulse(
          { x: this._force.x, y: this._force.y, z: this._force.z },
          true,
        );
      }
      this.applySpeedAssist(cmd, dt);
    }

    this._localAxis.set(
      cmd.rotate.pitch * SHIP_TUNING.MAX_PITCH_RATE,
      cmd.rotate.yaw * SHIP_TUNING.MAX_YAW_RATE,
      -cmd.rotate.roll * SHIP_TUNING.MAX_ROLL_RATE,
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
    const overspeed = Math.max(0, Math.min(1, (speed - SHIP_TUNING.SPEED_ASSIST_START) / (SHIP_TUNING.SPEED_ASSIST_FULL - SHIP_TUNING.SPEED_ASSIST_START)));
    const damping = brakeAmount * SHIP_TUNING.BRAKE_DAMPING + overspeed * overspeed * SHIP_TUNING.SPEED_ASSIST_DAMPING;
    if (damping <= 0) return;

    const deltaV = Math.min(speed, speed * damping * dt);
    this._velocity.normalize().multiplyScalar(-deltaV * SHIP_TUNING.MASS);
    this.body.applyImpulse(
      { x: this._velocity.x, y: this._velocity.y, z: this._velocity.z },
      true,
    );
  }

  applyAcceleration(acceleration: THREE.Vector3, dt: number): void {
    if (this._frozen) return;
    if (acceleration.lengthSq() === 0) return;
    const mass = SHIP_TUNING.MASS;
    this.body.applyImpulse(
      {
        x: acceleration.x * mass * dt,
        y: acceleration.y * mass * dt,
        z: acceleration.z * mass * dt,
      },
      true,
    );
  }

  syncMeshFromBody(): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.mesh.position.set(t.x, t.y, t.z);
    this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }

  /** Teleport ship to a position with zero velocity. Used by respawn + scatter. */
  teleport(pos: { x: number; y: number; z: number }): void {
    this.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  }

  /** Pause physics integration for this body. Used during dying/respawning. */
  setFrozen(frozen: boolean): void {
    this._frozen = frozen;
    if (frozen) {
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  /** Disable thrust without freezing physics (e.g., out of energy). */
  setThrustScale(scale: number): void {
    this._thrustScale = Math.max(0, scale);
    this._thrustEnabled = this._thrustScale > 0.0001;
  }

  /** Briefly disable collision-group filter (post-respawn invuln). */
  setInvulnerable(invuln: boolean): void {
    const collider = this._physics.world.getCollider(this.colliderHandle);
    if (!collider) return;
    if (invuln) {
      collider.setCollisionGroups(interactionGroups(COL_SHIP, COL_PICKUP | COL_BASE));
    } else {
      collider.setCollisionGroups(interactionGroups(COL_SHIP, COL_ASTEROID | COL_PICKUP | COL_BASE));
    }
  }

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
