import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/world';
import {
  ATTACHMENT_NAMES,
  buildShipVariant,
  SHIP_VARIANTS,
  SHIP_VISUALS,
  type AttachmentName,
  type BuiltShip,
  type ShipVariantId,
  type ThrusterSet,
} from '../render/shipVisual';
import {
  COL_ASTEROID,
  COL_BASE,
  COL_CHECKPOINT,
  COL_ENEMY,
  COL_PICKUP,
  COL_PROJECTILE,
  COL_SHIP,
  interactionGroups,
} from './collision';
import type { ShipCommand } from './input';

// Ship gameplay body. Visual is supplied by `setVisual()` from the
// shipVisual resolver — primitive variant by default, kit manifest after the
// builder applies one. Attachments are exposed by name regardless of source so
// upgrades, weapons, and VFX can mount without knowing the visual origin.

// Re-exports kept for back-compat with callers that expected these names from ship.ts.
export { SHIP_VARIANTS, SHIP_VISUALS, type ShipVariantId, type AttachmentName };

export interface ShipMods {
  // Multipliers and additions layered onto SHIP_TUNING by upgrades / parts.
  thrustMult: number;
  reverseMult: number;
  agilityMult: number;
  cargoCapAdd: number;
  energyMaxAdd: number;
  hullHpMax: number;
  miningCoefAdd: number;
  brakeMult: number;
  weaponDamage: number;
  weaponRof: number;
  weaponMuzzle: number;
  partMass: number;
}

export function defaultShipMods(): ShipMods {
  return {
    thrustMult: 1,
    reverseMult: 1,
    agilityMult: 1,
    cargoCapAdd: 0,
    energyMaxAdd: 0,
    hullHpMax: 100,
    miningCoefAdd: 0,
    brakeMult: 1,
    weaponDamage: 0,
    weaponRof: 0,
    weaponMuzzle: 0,
    partMass: 0,
  };
}

export const SHIP_TUNING = {
  MASS: 1.0,
  // Racing baseline: RT and LT are symmetric full thrust; strafe axes are
  // three-quarters of main thrust for correction without replacing line choice.
  FORWARD_THRUST: 200,
  REVERSE_THRUST: 200,
  STRAFE_THRUST: 150,
  FORWARD_THRUST_BIAS: 1.0,

  MAX_PITCH_RATE: 1.5,
  MAX_YAW_RATE: 1.5,
  MAX_ROLL_RATE: 1.5,

  // Brake (LT) is mild: damps speed, not a hard reverse cannon.
  BRAKE_DAMPING: 1.4,
  // Soft top-speed cap so the player can't accelerate off the field. Cap
  // suppressed inside real wells so slingshots still bite.
  SPEED_ASSIST_START: 130,
  SPEED_ASSIST_FULL: 280,
  SPEED_ASSIST_DAMPING: 0.6,
  SPEED_ASSIST_PULL_SUPPRESS_LO: 1.0,
  SPEED_ASSIST_PULL_SUPPRESS_HI: 8.0,

  // Boost multiplies every thrust axis while held.
  BOOST_THRUST_MULT: 2.4,
  BOOST_ENERGY_MULT: 4.0,

  // Cargo-fraction sluggishness. 0 = no effect; higher = full-cargo ship feels
  // heavier. Story §6.2: cargo coupling.
  CARGO_THRUST_PENALTY: 0.4,
  CARGO_AGILITY_PENALTY: 0.25,
};

const HULL_HX = 0.75;
const HULL_HY = 0.40;
const HULL_HZ = 1.25;
const HULL_VOLUME = (HULL_HX * 2) * (HULL_HY * 2) * (HULL_HZ * 2);

const LINEAR_DAMPING  = 0.0;
const ANGULAR_DAMPING = 0.0;
const SHIP_ACTIVE_FILTER = COL_ASTEROID | COL_PICKUP | COL_BASE | COL_PROJECTILE | COL_ENEMY | COL_CHECKPOINT;
const SHIP_INVULN_FILTER = COL_PICKUP | COL_BASE | COL_CHECKPOINT;

export class Ship {
  readonly body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
  readonly colliderHandle: number;
  attachments: Record<AttachmentName, THREE.Object3D>;
  mods: ShipMods = defaultShipMods();

  private _force = new THREE.Vector3();
  private _localAxis = new THREE.Vector3();
  private _quat = new THREE.Quaternion();
  private _velocity = new THREE.Vector3();
  private _physics: PhysicsWorld;
  private _scene: THREE.Scene;
  private _thrusters: ThrusterSet;
  private _thrustVisuals: Record<keyof ThrusterSet, number> = {
    main: 0,
    reverse: 0,
    strafeLeft: 0,
    strafeRight: 0,
    strafeUp: 0,
    strafeDown: 0,
    pitchUp: 0,
    pitchDown: 0,
    yawLeft: 0,
    yawRight: 0,
    rollLeft: 0,
    rollRight: 0,
  };
  private _variant: ShipVariantId;
  private _frozen = false;
  private _thrustEnabled = true;
  private _thrustScale = 1;
  private _ambientPull = 0;
  private _cargoFraction = 0;
  private _hp = 100;

  constructor(physics: PhysicsWorld, scene: THREE.Scene) {
    this._physics = physics;
    this._scene = scene;
    this._variant = SHIP_VISUALS.variant;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 0, 0)
      .setLinearDamping(LINEAR_DAMPING)
      .setAngularDamping(ANGULAR_DAMPING);
    this.body = physics.world.createRigidBody(desc);

    const density = SHIP_TUNING.MASS / HULL_VOLUME;
    const colliderDesc = RAPIER.ColliderDesc
      .cuboid(HULL_HX, HULL_HY, HULL_HZ)
      .setDensity(density)
      .setCollisionGroups(interactionGroups(COL_SHIP, SHIP_ACTIVE_FILTER))
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      .setFriction(0.1)
      .setRestitution(0.05);
    const collider = physics.world.createCollider(colliderDesc, this.body);
    this.colliderHandle = collider.handle;

    const built = buildShipVariant(this._variant);
    this.mesh = built.root;
    this.attachments = built.attachments;
    this._thrusters = built.thrusters;
    scene.add(this.mesh);
    this._hp = this.mods.hullHpMax;
  }

  applyCommand(cmd: ShipCommand, dt: number): void {
    if (this._frozen) return;
    const r = this.body.rotation();
    this._quat.set(r.x, r.y, r.z, r.w);

    const cargoPenalty = 1 / (1 + this._cargoFraction * SHIP_TUNING.CARGO_THRUST_PENALTY);
    const cargoAgility = 1 / (1 + this._cargoFraction * SHIP_TUNING.CARGO_AGILITY_PENALTY);

    if (this._thrustEnabled) {
      const mass = SHIP_TUNING.MASS;
      const boost = Math.max(0, Math.min(1, cmd.boost ?? 0));
      const boostMult = 1 + boost * (SHIP_TUNING.BOOST_THRUST_MULT - 1);
      const fwdThrust = SHIP_TUNING.FORWARD_THRUST * SHIP_TUNING.FORWARD_THRUST_BIAS * mass * boostMult * this.mods.thrustMult * cargoPenalty;
      const revThrust = SHIP_TUNING.REVERSE_THRUST * mass * boostMult * this.mods.reverseMult * cargoPenalty;
      const forwardScale = cmd.thrust.z < 0 ? fwdThrust : revThrust;
      const strafe = SHIP_TUNING.STRAFE_THRUST * mass * boostMult * this.mods.thrustMult * cargoPenalty;
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
      this.updateThrustVisuals(cmd, boost);
    } else {
      this.clearThrustVisuals();
    }

    const ag = this.mods.agilityMult * cargoAgility;
    this._localAxis.set(
      cmd.rotate.pitch * SHIP_TUNING.MAX_PITCH_RATE * ag,
      cmd.rotate.yaw * SHIP_TUNING.MAX_YAW_RATE * ag,
      -cmd.rotate.roll * SHIP_TUNING.MAX_ROLL_RATE * ag,
    );
    this._localAxis.applyQuaternion(this._quat);
    this.body.setAngvel(
      { x: this._localAxis.x, y: this._localAxis.y, z: this._localAxis.z },
      true,
    );
  }

  /** Replace the visual with a freshly-built BuiltShip (kit, primitive, GLB).
   *  Does not affect the physics body — only the mesh + attachments. */
  setVisual(built: BuiltShip): void {
    const oldMesh = this.mesh;
    const wasVisible = oldMesh.visible;
    this.mesh = built.root;
    this.mesh.visible = wasVisible;
    this.attachments = built.attachments;
    this._thrusters = built.thrusters;
    this._scene.remove(oldMesh);
    this._scene.add(this.mesh);
    this.syncMeshFromBody();
  }

  setVariant(variant: ShipVariantId): void {
    if (variant === this._variant) return;
    this._variant = variant;
    SHIP_VISUALS.variant = variant;
    this.setVisual(buildShipVariant(variant));
  }

  cycleVariant(direction = 1): ShipVariantId {
    const ids = Object.keys(SHIP_VARIANTS) as ShipVariantId[];
    const i = ids.indexOf(this._variant);
    const next = ids[(i + direction + ids.length) % ids.length];
    this.setVariant(next);
    return next;
  }

  setMods(mods: ShipMods): void {
    this.mods = mods;
    if (this._hp > mods.hullHpMax) this._hp = mods.hullHpMax;
  }

  /** Reset HP to current max. Called on respawn. */
  refillHp(): void {
    this._hp = this.mods.hullHpMax;
  }

  applyDamage(amount: number): boolean {
    if (this._hp <= 0) return false;
    this._hp = Math.max(0, this._hp - amount);
    return this._hp <= 0;
  }

  get hp(): number { return this._hp; }
  get hpMax(): number { return this.mods.hullHpMax; }
  get hpFraction(): number { return this.mods.hullHpMax > 0 ? this._hp / this.mods.hullHpMax : 0; }

  /** Cargo fraction of cap [0..1]. Drives sluggishness + audio cargo hum. */
  setCargoFraction(f: number): void {
    this._cargoFraction = Math.max(0, Math.min(1, f));
  }

  get cargoFraction(): number { return this._cargoFraction; }

  /** Iterate over Object3D attachment points by canonical name. Useful for
   *  upgrade-mount loops without naming each slot. */
  forEachAttachment(fn: (name: AttachmentName, node: THREE.Object3D) => void): void {
    for (const name of ATTACHMENT_NAMES) fn(name, this.attachments[name]);
  }

  get variant(): ShipVariantId {
    return this._variant;
  }

  get variantName(): string {
    return SHIP_VARIANTS[this._variant];
  }

  private updateThrustVisuals(cmd: ShipCommand, boost: number): void {
    const forward = Math.max(0, -cmd.thrust.z);
    const reverse = Math.max(0, cmd.thrust.z);
    const boostCharge = forward * Math.max(0, Math.min(1, boost));

    this.setThrusterVisual('main', Math.max(forward * 0.55, boostCharge), 0.48 + boostCharge * 0.95, 0.75 + boostCharge * 1.9);
    this.setThrusterVisual('reverse', reverse, 0.46, 0.85);
    this.setThrusterVisual('strafeLeft', Math.max(0, cmd.thrust.x), 0.4, 0.7);
    this.setThrusterVisual('strafeRight', Math.max(0, -cmd.thrust.x), 0.4, 0.7);
    this.setThrusterVisual('strafeUp', Math.max(0, -cmd.thrust.y), 0.36, 0.62);
    this.setThrusterVisual('strafeDown', Math.max(0, cmd.thrust.y), 0.36, 0.62);
    this.setThrusterVisual('pitchUp', Math.max(0, cmd.rotate.pitch), 0.3, 0.5);
    this.setThrusterVisual('pitchDown', Math.max(0, -cmd.rotate.pitch), 0.3, 0.5);
    this.setThrusterVisual('yawLeft', Math.max(0, -cmd.rotate.yaw), 0.3, 0.5);
    this.setThrusterVisual('yawRight', Math.max(0, cmd.rotate.yaw), 0.3, 0.5);
    this.setThrusterVisual('rollLeft', Math.max(0, -cmd.rotate.roll), 0.28, 0.46);
    this.setThrusterVisual('rollRight', Math.max(0, cmd.rotate.roll), 0.28, 0.46);
  }

  private clearThrustVisuals(): void {
    this.setThrusterVisual('main', 0, 0.48, 0.75);
    this.setThrusterVisual('reverse', 0, 0.46, 0.85);
    this.setThrusterVisual('strafeLeft', 0, 0.4, 0.7);
    this.setThrusterVisual('strafeRight', 0, 0.4, 0.7);
    this.setThrusterVisual('strafeUp', 0, 0.36, 0.62);
    this.setThrusterVisual('strafeDown', 0, 0.36, 0.62);
    this.setThrusterVisual('pitchUp', 0, 0.3, 0.5);
    this.setThrusterVisual('pitchDown', 0, 0.3, 0.5);
    this.setThrusterVisual('yawLeft', 0, 0.3, 0.5);
    this.setThrusterVisual('yawRight', 0, 0.3, 0.5);
    this.setThrusterVisual('rollLeft', 0, 0.28, 0.46);
    this.setThrusterVisual('rollRight', 0, 0.28, 0.46);
  }

  private setThrusterVisual(key: keyof ThrusterSet, amount: number, baseWidth: number, baseLength: number): void {
    const target = Math.max(0, Math.min(1, amount));
    const current = this._thrustVisuals[key] + (target - this._thrustVisuals[key]) * 0.35;
    this._thrustVisuals[key] = current;

    for (const jet of this._thrusters[key]) {
      jet.visible = current > 0.02;
      jet.scale.set(
        baseWidth + current * 0.55,
        baseLength + current * 1.15,
        baseWidth + current * 0.55,
      );
      const mat = jet.material;
      if (mat instanceof THREE.MeshBasicMaterial) mat.opacity = current * 0.92;
    }
  }

  private applySpeedAssist(cmd: ShipCommand, dt: number): void {
    const v = this.body.linvel();
    this._velocity.set(v.x, v.y, v.z);
    const speed = this._velocity.length();
    if (speed <= 0.001) return;

    const brakeAmount = Math.max(0, cmd.thrust.z) * this.mods.brakeMult;
    const overspeed = Math.max(0, Math.min(1, (speed - SHIP_TUNING.SPEED_ASSIST_START) / (SHIP_TUNING.SPEED_ASSIST_FULL - SHIP_TUNING.SPEED_ASSIST_START)));
    const lo = SHIP_TUNING.SPEED_ASSIST_PULL_SUPPRESS_LO;
    const hi = SHIP_TUNING.SPEED_ASSIST_PULL_SUPPRESS_HI;
    const range = Math.max(0.0001, hi - lo);
    const t = Math.max(0, Math.min(1, (this._ambientPull - lo) / range));
    const wellSuppress = 1 - t * t * (3 - 2 * t);
    const damping = brakeAmount * SHIP_TUNING.BRAKE_DAMPING + overspeed * overspeed * SHIP_TUNING.SPEED_ASSIST_DAMPING * wellSuppress;
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

  teleport(pos: { x: number; y: number; z: number }): void {
    this.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  }

  setFrozen(frozen: boolean): void {
    this._frozen = frozen;
    if (frozen) {
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      this.clearThrustVisuals();
    }
  }

  setAmbientPull(pull: number): void {
    this._ambientPull = pull;
  }

  setThrustScale(scale: number): void {
    this._thrustScale = Math.max(0, scale);
    this._thrustEnabled = this._thrustScale > 0.0001;
  }

  setInvulnerable(invuln: boolean): void {
    const collider = this._physics.world.getCollider(this.colliderHandle);
    if (!collider) return;
    if (invuln) {
      collider.setCollisionGroups(interactionGroups(COL_SHIP, SHIP_INVULN_FILTER));
    } else {
      collider.setCollisionGroups(interactionGroups(COL_SHIP, SHIP_ACTIVE_FILTER));
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
