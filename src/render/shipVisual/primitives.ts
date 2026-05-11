import * as THREE from 'three';
import type { AttachmentName } from './manifestTypes';
import { ATTACHMENT_NAMES } from './manifestTypes';
import { type BuiltShip, type ThrusterSet, emptyThrusterSet } from './types';

const PALETTE = {
  hull:    0xe7d8b3,
  accent:  0xd06424,
  cockpit: 0x2c5d63,
  trim:    0x6b3a1c,
  engine:  0x1f1d1b,
  exhaust: 0xff7a3a,
} as const;

type ShipPalette = Record<keyof typeof PALETTE, number>;

export type ShipVariantId = 'sparrow' | 'scrapper' | 'tamarack' | 'courier';

export const SHIP_VARIANTS: Record<ShipVariantId, string> = {
  sparrow: 'Sparrow prototype',
  scrapper: 'Scrapper Mk-I',
  tamarack: 'Tamarack-07',
  courier: 'Veteran gravity-runner',
};

// Mutable global so the tuning panel + cycle hotkey can flip between variants.
export const SHIP_VISUALS = {
  variant: 'scrapper' as ShipVariantId,
};

export function createShipMaterials(palette: ShipPalette = PALETTE) {
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

export type MaterialSet = ReturnType<typeof createShipMaterials>;

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

export function box(root: THREE.Object3D, size: [number, number, number], pos: [number, number, number], mat: THREE.Material, rot?: [number, number, number]): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
  mesh.position.set(pos[0], pos[1], pos[2]);
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
  root.add(mesh);
}

export function cyl(root: THREE.Object3D, radius: number, length: number, pos: [number, number, number], mat: THREE.Material, radialSegments = 14): void {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, radialSegments), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(pos[0], pos[1], pos[2]);
  root.add(mesh);
}

export function cone(root: THREE.Object3D, radius: number, length: number, pos: [number, number, number], mat: THREE.Material, radialSegments = 8): void {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, length, radialSegments), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(pos[0], pos[1], pos[2]);
  root.add(mesh);
}

export function canopy(root: THREE.Object3D, pos: [number, number, number], scale: [number, number, number], mat: THREE.Material): void {
  const geom = new THREE.SphereGeometry(0.42, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.position.set(pos[0], pos[1], pos[2]);
  root.add(mesh);
}

export function addPlume(
  root: THREE.Object3D,
  jets: THREE.Mesh[],
  position: [number, number, number],
  direction: [number, number, number],
  radius: number,
  length: number,
  color: number,
): void {
  const geom = new THREE.ConeGeometry(radius, length, 14);
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

export function addEngine(root: THREE.Object3D, thrusters: ThrusterSet, mats: MaterialSet, x: number, y: number, z: number, radius = 0.22, length = 0.85): void {
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

const DEFAULT_MOUNTS: Record<AttachmentName, [number, number, number]> = {
  'nose': [0, 0.05, -2.4],
  'wing-l': [-1.7, 0.0, 0.55],
  'wing-r': [1.7, 0.0, 0.55],
  'engine-l': [-0.55, -0.12, 1.85],
  'engine-r': [0.55, -0.12, 1.85],
  'topspine': [0, 0.5, 0.0],
  'cargo-bay': [0, -0.35, 0.4],
  'weapon-l': [-0.95, 0.04, -0.25],
  'weapon-r': [0.95, 0.04, -0.25],
};

export function defaultMount(name: AttachmentName): [number, number, number] {
  return DEFAULT_MOUNTS[name];
}

export function attachPoints(
  root: THREE.Object3D,
  overrides?: Partial<Record<AttachmentName, [number, number, number]>>,
): Record<AttachmentName, THREE.Object3D> {
  const out = {} as Record<AttachmentName, THREE.Object3D>;
  for (const name of ATTACHMENT_NAMES) {
    const o = new THREE.Object3D();
    o.name = name;
    const p = overrides?.[name] ?? DEFAULT_MOUNTS[name];
    o.position.set(p[0], p[1], p[2]);
    root.add(o);
    out[name] = o;
  }
  return out;
}

export function addManeuverThrusters(root: THREE.Object3D, thrusters: ThrusterSet): void {
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

  addPlume(root, thrusters.pitchUp, [-0.34, -0.46, -1.18], [0, -1, 0], 0.07, 0.42, 0xffd06a);
  addPlume(root, thrusters.pitchUp, [0.34, -0.46, -1.18], [0, -1, 0], 0.07, 0.42, 0xffd06a);
  addPlume(root, thrusters.pitchDown, [-0.34, 0.48, -1.18], [0, 1, 0], 0.07, 0.42, 0xffd06a);
  addPlume(root, thrusters.pitchDown, [0.34, 0.48, -1.18], [0, 1, 0], 0.07, 0.42, 0xffd06a);

  addPlume(root, thrusters.yawLeft, [0.82, 0.04, -1.08], [1, 0, 0], 0.07, 0.44, 0xffd06a);
  addPlume(root, thrusters.yawLeft, [-0.82, 0.02, 1.08], [-1, 0, 0], 0.07, 0.44, 0xffd06a);
  addPlume(root, thrusters.yawRight, [-0.82, 0.04, -1.08], [-1, 0, 0], 0.07, 0.44, 0xffd06a);
  addPlume(root, thrusters.yawRight, [0.82, 0.02, 1.08], [1, 0, 0], 0.07, 0.44, 0xffd06a);

  addPlume(root, thrusters.rollLeft, [-0.95, 0.42, 0.46], [0, 1, 0], 0.06, 0.38, 0xffd06a);
  addPlume(root, thrusters.rollLeft, [0.95, -0.42, 0.46], [0, -1, 0], 0.06, 0.38, 0xffd06a);
  addPlume(root, thrusters.rollRight, [-0.95, -0.42, 0.46], [0, -1, 0], 0.06, 0.38, 0xffd06a);
  addPlume(root, thrusters.rollRight, [0.95, 0.42, 0.46], [0, 1, 0], 0.06, 0.38, 0xffd06a);
}

export function finishShip(root: THREE.Object3D, thrusters: ThrusterSet): BuiltShip {
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

export function buildShipVariant(variant: ShipVariantId): BuiltShip {
  switch (variant) {
    case 'sparrow': return buildSparrowShip();
    case 'scrapper': return buildScrapperShip();
    case 'tamarack': return buildTamarackShip();
    case 'courier': return buildCourierShip();
  }
}
