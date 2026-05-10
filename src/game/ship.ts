import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/world';
import { COL_ASTEROID, COL_BASE, COL_PICKUP, COL_SHIP, interactionGroups } from './collision';
import type { ShipCommand } from './input';

// Ships are readable procedural primitives, not final art. Each variant keeps
// the same attachment names and collider bounds so gameplay/upgrades can treat
// the visual body as a swappable skin.

interface BuiltShip {
  root: THREE.Object3D;
  attachments: Record<AttachmentName, THREE.Object3D>;
  thrusters: ThrusterSet;
}

type ThrusterKey = 'main' | 'reverse' | 'strafeLeft' | 'strafeRight' | 'strafeUp' | 'strafeDown';

type ThrusterSet = Record<ThrusterKey, THREE.Mesh[]>;

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

type ShipPalette = Record<keyof typeof PALETTE, number>;

export type ShipVariantId = 'sparrow' | 'scrapper' | 'tamarack' | 'courier';

export const SHIP_VARIANTS: Record<ShipVariantId, string> = {
  sparrow: 'Sparrow prototype',
  scrapper: 'Scrapper Mk-I',
  tamarack: 'Tamarack-07',
  courier: 'Veteran gravity-runner',
};

export const SHIP_VISUALS = {
  variant: 'scrapper' as ShipVariantId,
};

function createShipMaterials(palette: ShipPalette = PALETTE) {
  return {
    hull: new THREE.MeshStandardMaterial({ color: palette.hull, roughness: 0.55, metalness: 0.34 }),
    accent: new THREE.MeshStandardMaterial({
      color: palette.accent,
      roughness: 0.42,
      metalness: 0.42,
      emissive: 0x361006,
      emissiveIntensity: 0.1,
    }),
    trim: new THREE.MeshStandardMaterial({ color: palette.trim, roughness: 0.68, metalness: 0.24 }),
    cockpit: new THREE.MeshStandardMaterial({
      color: palette.cockpit,
      roughness: 0.08,
      metalness: 0.55,
      emissive: 0x0b7184,
      emissiveIntensity: 0.9,
    }),
    engine: new THREE.MeshStandardMaterial({ color: palette.engine, roughness: 0.85, metalness: 0.22 }),
    cargo: new THREE.MeshStandardMaterial({ color: 0x4f5542, roughness: 0.8, metalness: 0.2 }),
    darkPanel: new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.7, metalness: 0.28 }),
    boost: new THREE.MeshBasicMaterial({
      color: 0xffb36a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  };
}

type MaterialSet = ReturnType<typeof createShipMaterials>;

function emptyThrusterSet(): ThrusterSet {
  return {
    main: [],
    reverse: [],
    strafeLeft: [],
    strafeRight: [],
    strafeUp: [],
    strafeDown: [],
  };
}

function plumeMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
}

function box(root: THREE.Object3D, size: [number, number, number], pos: [number, number, number], mat: THREE.Material, rot?: [number, number, number]): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
  mesh.position.set(pos[0], pos[1], pos[2]);
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
  root.add(mesh);
}

function cyl(root: THREE.Object3D, radius: number, length: number, pos: [number, number, number], mat: THREE.Material, radialSegments = 14): void {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, radialSegments), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(pos[0], pos[1], pos[2]);
  root.add(mesh);
}

function cone(root: THREE.Object3D, radius: number, length: number, pos: [number, number, number], mat: THREE.Material, radialSegments = 8): void {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, length, radialSegments), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(pos[0], pos[1], pos[2]);
  root.add(mesh);
}

function canopy(root: THREE.Object3D, pos: [number, number, number], scale: [number, number, number], mat: THREE.Material): void {
  const geom = new THREE.SphereGeometry(0.42, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.position.set(pos[0], pos[1], pos[2]);
  root.add(mesh);
}

function addPlume(
  root: THREE.Object3D,
  jets: THREE.Mesh[],
  position: [number, number, number],
  direction: [number, number, number],
  radius: number,
  length: number,
  color: number,
): void {
  const geom = new THREE.ConeGeometry(radius, length, 14);
  // ConeGeometry is centered by default. Move it so scaling grows outward from
  // the nozzle instead of clipping back through the hull.
  geom.translate(0, length * 0.5, 0);
  const exhaust = new THREE.Mesh(geom, plumeMaterial(color));
  exhaust.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(direction[0], direction[1], direction[2]).normalize(),
  );
  exhaust.position.set(position[0], position[1], position[2]);
  exhaust.scale.setScalar(0.2);
  exhaust.visible = false;
  root.add(exhaust);
  jets.push(exhaust);
}

function addEngine(root: THREE.Object3D, thrusters: ThrusterSet, mats: MaterialSet, x: number, y: number, z: number, radius = 0.22, length = 0.85): void {
  cyl(root, radius, length, [x, y, z], mats.engine, 16);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.08, radius * 0.16, 8, 18), mats.accent);
  ring.rotation.y = Math.PI / 2;
  ring.position.set(x, y, z + length * 0.5);
  root.add(ring);

  addPlume(
    root,
    thrusters.main,
    [x, y, z + length * 0.5 + radius * 0.58],
    [0, 0, 1],
    radius * 0.78,
    radius * 2.2,
    0xffb36a,
  );
}

function attachPoints(root: THREE.Object3D): Record<AttachmentName, THREE.Object3D> {
  function attach(name: AttachmentName, x: number, y: number, z: number): THREE.Object3D {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, z);
    root.add(o);
    return o;
  }
  return {
    'nose': attach('nose', 0, 0.05, -2.4),
    'wing-l': attach('wing-l', -1.7, 0.0, 0.55),
    'wing-r': attach('wing-r', 1.7, 0.0, 0.55),
    'engine-l': attach('engine-l', -0.55, -0.12, 1.85),
    'engine-r': attach('engine-r', 0.55, -0.12, 1.85),
    'topspine': attach('topspine', 0, 0.5, 0.0),
    'cargo-bay': attach('cargo-bay', 0, -0.35, 0.4),
  };
}

function addManeuverThrusters(root: THREE.Object3D, thrusters: ThrusterSet): void {
  addPlume(root, thrusters.reverse, [-0.48, 0.08, -1.7], [0, 0, -1], 0.11, 0.72, 0x6defff);
  addPlume(root, thrusters.reverse, [0.48, 0.08, -1.7], [0, 0, -1], 0.11, 0.72, 0x6defff);

  addPlume(root, thrusters.strafeLeft, [-1.25, -0.02, 0.45], [-1, 0, 0], 0.09, 0.58, 0x7dffb2);
  addPlume(root, thrusters.strafeLeft, [-1.25, -0.02, 1.02], [-1, 0, 0], 0.08, 0.48, 0x7dffb2);
  addPlume(root, thrusters.strafeRight, [1.25, -0.02, 0.45], [1, 0, 0], 0.09, 0.58, 0x7dffb2);
  addPlume(root, thrusters.strafeRight, [1.25, -0.02, 1.02], [1, 0, 0], 0.08, 0.48, 0x7dffb2);

  addPlume(root, thrusters.strafeUp, [-0.42, 0.48, 0.72], [0, 1, 0], 0.08, 0.5, 0x7dffb2);
  addPlume(root, thrusters.strafeUp, [0.42, 0.48, 0.72], [0, 1, 0], 0.08, 0.5, 0x7dffb2);
  addPlume(root, thrusters.strafeDown, [-0.42, -0.48, 0.72], [0, -1, 0], 0.08, 0.5, 0x7dffb2);
  addPlume(root, thrusters.strafeDown, [0.42, -0.48, 0.72], [0, -1, 0], 0.08, 0.5, 0x7dffb2);
}

function finishShip(root: THREE.Object3D, thrusters: ThrusterSet): BuiltShip {
  addManeuverThrusters(root, thrusters);

  const cockpitGlow = new THREE.PointLight(0x5defff, 1.2, 8, 2.2);
  cockpitGlow.position.set(0, 0.45, -0.45);
  root.add(cockpitGlow);

  const engineGlow = new THREE.PointLight(0xff7a3a, 1.6, 9, 2.0);
  engineGlow.position.set(0, -0.08, 1.55);
  root.add(engineGlow);

  return { root, attachments: attachPoints(root), thrusters };
}

function buildSparrowShip(): BuiltShip {
  const root = new THREE.Group();
  const mats = createShipMaterials();
  const thrusters = emptyThrusterSet();

  box(root, [1.3, 0.62, 1.6], [0, 0, 0], mats.hull);
  box(root, [0.95, 0.5, 0.9], [0, 0.02, -1.1], mats.hull);
  box(root, [1.05, 0.55, 0.7], [0, -0.02, 1.1], mats.hull);
  box(root, [0.32, 0.04, 1.55], [0, 0.34, 0], mats.accent);
  cone(root, 0.32, 1.0, [0, 0.0, -2.05], mats.trim);
  canopy(root, [0, 0.32, -0.5], [0.95, 0.7, 1.55], mats.cockpit);

  for (const side of [-1, 1] as const) {
    box(root, [1.0, 0.10, 0.85], [side * 0.95, 0.0, 0.25], mats.accent);
    box(root, [0.7, 0.08, 0.55], [side * 1.7, 0.0, 0.55], mats.trim);
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshBasicMaterial({ color: side > 0 ? 0x3affa0 : 0xff5a4a }),
    );
    tip.position.set(side * 2.0, 0.0, 0.65);
    root.add(tip);
    addEngine(root, thrusters, mats, side * 0.55, -0.12, 1.3, 0.24, 0.95);
  }

  box(root, [0.08, 0.5, 0.55], [0, 0.5, 0.95], mats.trim);
  box(root, [0.09, 0.12, 0.4], [0, 0.78, 0.95], mats.accent);

  return finishShip(root, thrusters);
}

function buildScrapperShip(): BuiltShip {
  const root = new THREE.Group();
  const mats = createShipMaterials({ ...PALETTE, hull: 0xd8c8a5, accent: 0xa84f35, cockpit: 0x9d6c2c, trim: 0x27313a });
  const thrusters = emptyThrusterSet();

  cone(root, 0.43, 1.55, [0, -0.02, -1.85], mats.accent, 7);
  box(root, [1.05, 0.58, 1.45], [0, 0.0, -0.65], mats.hull);
  box(root, [1.22, 0.72, 1.1], [0, 0.02, 0.5], mats.hull);
  box(root, [1.35, 0.82, 0.85], [0, 0.02, 1.25], mats.darkPanel);
  box(root, [0.35, 0.05, 2.2], [0, 0.39, -0.45], mats.accent);
  canopy(root, [0, 0.4, -0.45], [0.78, 0.55, 1.35], mats.cockpit);
  box(root, [0.82, 0.38, 0.72], [0, -0.55, 0.45], mats.darkPanel);
  box(root, [0.95, 0.16, 0.45], [0, -0.82, 0.45], mats.cargo);

  for (let i = 0; i < 8; i++) {
    cone(root, 0.06, 0.28, [-0.35 + i * 0.1, 0.62, 0.33 + i * 0.07], mats.trim, 4);
  }

  for (const side of [-1, 1] as const) {
    box(root, [0.75, 0.08, 0.52], [side * 1.02, -0.02, 0.78], mats.hull, [0, side * 0.18, 0]);
    box(root, [0.16, 0.62, 0.58], [side * 1.42, 0.23, 1.08], mats.accent);
    addEngine(root, thrusters, mats, side * 1.35, -0.02, 0.78, 0.22, 1.05);
    cyl(root, 0.08, 0.72, [side * 0.72, -0.08, -0.82], mats.engine, 8);
  }
  addEngine(root, thrusters, mats, 0, -0.04, 1.42, 0.36, 0.95);

  return finishShip(root, thrusters);
}

function buildTamarackShip(): BuiltShip {
  const root = new THREE.Group();
  const mats = createShipMaterials({ ...PALETTE, hull: 0x6d7055, accent: 0xc56a22, cockpit: 0x4c5a5d, trim: 0x1e211d });
  const thrusters = emptyThrusterSet();

  box(root, [1.25, 0.72, 0.72], [0, 0.0, -1.25], mats.hull);
  cone(root, 0.55, 0.95, [0, -0.03, -1.98], mats.trim, 6);
  box(root, [1.5, 0.9, 1.6], [0, 0.02, -0.15], mats.hull);
  box(root, [1.35, 0.95, 1.25], [0, 0.0, 1.05], mats.hull);
  box(root, [0.82, 0.34, 1.75], [0, 0.58, 0.15], mats.darkPanel);
  canopy(root, [0, 0.58, -0.88], [1.12, 0.78, 1.1], mats.cockpit);
  box(root, [0.72, 0.52, 1.25], [-0.58, -0.66, 0.35], mats.darkPanel);
  box(root, [0.62, 0.45, 1.05], [0.58, -0.62, 0.18], mats.cargo);
  box(root, [0.12, 0.78, 0.72], [0, 0.82, 1.0], mats.accent);

  for (const side of [-1, 1] as const) {
    box(root, [1.0, 0.12, 0.75], [side * 1.12, -0.05, 0.82], mats.hull, [0, side * -0.1, 0]);
    box(root, [0.68, 0.1, 0.35], [side * 1.85, -0.08, 1.04], mats.accent);
    box(root, [0.18, 0.55, 0.8], [side * 1.76, -0.46, 0.42], mats.engine);
    addEngine(root, thrusters, mats, side * 0.42, -0.02, 1.45, 0.32, 0.9);
    addEngine(root, thrusters, mats, side * 1.58, -0.22, 0.75, 0.18, 0.62);
    cyl(root, 0.16, 0.85, [side * 1.45, -0.18, -0.12], mats.cargo, 10);
  }

  return finishShip(root, thrusters);
}

function buildCourierShip(): BuiltShip {
  const root = new THREE.Group();
  const mats = createShipMaterials({ ...PALETTE, hull: 0x152431, accent: 0xc45f22, cockpit: 0x23343b, trim: 0xcfc0a0 });
  const thrusters = emptyThrusterSet();

  cone(root, 0.4, 1.65, [0, -0.02, -1.93], mats.trim, 7);
  box(root, [0.88, 0.5, 1.35], [0, 0.0, -0.8], mats.hull);
  box(root, [1.12, 0.62, 1.55], [0, 0.0, 0.25], mats.hull);
  box(root, [1.08, 0.66, 0.95], [0, -0.01, 1.2], mats.hull);
  box(root, [0.18, 0.05, 2.55], [0, 0.34, -0.45], mats.accent);
  canopy(root, [0, 0.35, -0.18], [0.82, 0.62, 1.25], mats.cockpit);
  box(root, [0.95, 0.36, 0.88], [0, 0.64, 0.6], mats.cargo);
  box(root, [1.08, 0.08, 1.0], [0, 0.86, 0.6], mats.trim);

  for (const side of [-1, 1] as const) {
    box(root, [0.85, 0.08, 0.54], [side * 1.08, -0.03, 0.56], mats.hull, [0, side * 0.12, 0]);
    box(root, [0.15, 0.72, 0.58], [side * 1.34, 0.42, 1.1], mats.hull, [0, 0, side * 0.12]);
    addEngine(root, thrusters, mats, side * 0.5, -0.12, 1.35, 0.24, 0.9);
    addEngine(root, thrusters, mats, side * 0.96, -0.18, 1.24, 0.16, 0.72);
    cyl(root, 0.18, 0.95, [side * 0.92, -0.16, 0.55], mats.engine, 12);
  }
  addEngine(root, thrusters, mats, 0, -0.05, 1.48, 0.28, 0.88);

  return finishShip(root, thrusters);
}

function buildShipVariant(variant: ShipVariantId): BuiltShip {
  switch (variant) {
    case 'sparrow': return buildSparrowShip();
    case 'scrapper': return buildScrapperShip();
    case 'tamarack': return buildTamarackShip();
    case 'courier': return buildCourierShip();
  }
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
  // Auto-overspeed damping. Off by default — space is empty, ships keep
  // their velocity until brake (LT) or gravity does something. Bump
  // SPEED_ASSIST_DAMPING above 0 in the tuning panel to re-enable a soft
  // top-speed cap if you want one. Range: SPEED_ASSIST_START → FULL.
  SPEED_ASSIST_START: 95,
  SPEED_ASSIST_FULL: 297,
  SPEED_ASSIST_DAMPING: 0.0,
  // Ambient gravity pull (m/s²) at which overspeed damping starts to fade
  // (LO) and is fully suppressed (HI). Brake is unaffected.
  SPEED_ASSIST_PULL_SUPPRESS_LO: 1.0,
  SPEED_ASSIST_PULL_SUPPRESS_HI: 8.0,

  // Boost: extra forward thrust + faster energy drain while the boost input
  // is held. Applied as multiplier on forward thrust (1 = no change).
  BOOST_THRUST_MULT: 2.5,
  BOOST_ENERGY_MULT: 4.0,
};

// Hull collider half-extents. Baked at construction - not live tunable.
const HULL_HX = 0.75;
const HULL_HY = 0.40;
const HULL_HZ = 1.25;
const HULL_VOLUME = (HULL_HX * 2) * (HULL_HY * 2) * (HULL_HZ * 2);

const LINEAR_DAMPING  = 0.0;
const ANGULAR_DAMPING = 0.0;

export class Ship {
  readonly body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
  readonly colliderHandle: number;
  attachments: Record<AttachmentName, THREE.Object3D>;

  private _force = new THREE.Vector3();
  private _localAxis = new THREE.Vector3();
  private _quat = new THREE.Quaternion();
  private _velocity = new THREE.Vector3();
  private _physics: PhysicsWorld;
  private _scene: THREE.Scene;
  private _thrusters: ThrusterSet = emptyThrusterSet();
  private _thrustVisuals: Record<ThrusterKey, number> = {
    main: 0,
    reverse: 0,
    strafeLeft: 0,
    strafeRight: 0,
    strafeUp: 0,
    strafeDown: 0,
  };
  private _variant: ShipVariantId;
  private _frozen = false;
  private _thrustEnabled = true;
  private _thrustScale = 1;
  private _ambientPull = 0;

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
      .setCollisionGroups(interactionGroups(COL_SHIP, COL_ASTEROID | COL_PICKUP | COL_BASE))
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
  }

  applyCommand(cmd: ShipCommand, dt: number): void {
    if (this._frozen) return;
    const r = this.body.rotation();
    this._quat.set(r.x, r.y, r.z, r.w);

    if (this._thrustEnabled) {
      const mass = SHIP_TUNING.MASS;
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
      this.updateThrustVisuals(cmd, boost);
    } else {
      this.clearThrustVisuals();
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

  setVariant(variant: ShipVariantId): void {
    if (variant === this._variant) return;
    this._variant = variant;
    SHIP_VISUALS.variant = variant;

    const oldMesh = this.mesh;
    const wasVisible = oldMesh.visible;
    const built = buildShipVariant(variant);
    this.mesh = built.root;
    this.mesh.visible = wasVisible;
    this.attachments = built.attachments;
    this._thrusters = built.thrusters;

    this._scene.remove(oldMesh);
    this._scene.add(this.mesh);
    this.syncMeshFromBody();
  }

  cycleVariant(direction = 1): ShipVariantId {
    const ids = Object.keys(SHIP_VARIANTS) as ShipVariantId[];
    const i = ids.indexOf(this._variant);
    const next = ids[(i + direction + ids.length) % ids.length];
    this.setVariant(next);
    return next;
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
  }

  private clearThrustVisuals(): void {
    this.setThrusterVisual('main', 0, 0.48, 0.75);
    this.setThrusterVisual('reverse', 0, 0.46, 0.85);
    this.setThrusterVisual('strafeLeft', 0, 0.4, 0.7);
    this.setThrusterVisual('strafeRight', 0, 0.4, 0.7);
    this.setThrusterVisual('strafeUp', 0, 0.36, 0.62);
    this.setThrusterVisual('strafeDown', 0, 0.36, 0.62);
  }

  private setThrusterVisual(key: ThrusterKey, amount: number, baseWidth: number, baseLength: number): void {
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

    const brakeAmount = Math.max(0, cmd.thrust.z);
    const overspeed = Math.max(0, Math.min(1, (speed - SHIP_TUNING.SPEED_ASSIST_START) / (SHIP_TUNING.SPEED_ASSIST_FULL - SHIP_TUNING.SPEED_ASSIST_START)));
    // Fade overspeed assist out inside a real gravity well so slingshots
    // accelerate the ship instead of getting damped back. Brake stays full.
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
      this.clearThrustVisuals();
    }
  }

  /** Latest ambient gravity pull magnitude (m/s²). Drives speed-assist
   *  suppression so slingshots aren't damped inside wells. */
  setAmbientPull(pull: number): void {
    this._ambientPull = pull;
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
