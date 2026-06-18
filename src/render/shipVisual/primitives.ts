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

export type ShipVariantId = 'scrapper';

export const SHIP_VARIANTS: Record<ShipVariantId, string> = {
  scrapper: 'Scrapper Mk-I',
};

/** Inject a view-dependent fresnel rim into a MeshStandardMaterial. Edge-lights
 *  the hull against the dark nebula so the silhouette reads cleanly — the
 *  cheapest way to make a procedural ship look deliberately designed. */
export function applyFresnelRim(material: THREE.MeshStandardMaterial, color: number, power = 2.6, strength = 0.7): void {
  const rim = new THREE.Color(color);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: rim };
    shader.uniforms.uRimPower = { value: power };
    shader.uniforms.uRimStrength = { value: strength };
    shader.fragmentShader = `uniform vec3 uRimColor;\nuniform float uRimPower;\nuniform float uRimStrength;\n${shader.fragmentShader}`
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float rimDot = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
         totalEmissiveRadiance += uRimColor * pow(rimDot, uRimPower) * uRimStrength;`,
      );
  };
  material.customProgramCacheKey = () => `fresnel-${color}-${power}-${strength}`;
}

export function createShipMaterials(palette: ShipPalette = PALETTE) {
  const hull = new THREE.MeshStandardMaterial({ color: palette.hull, roughness: 0.48, metalness: 0.5, envMapIntensity: 1.1 });
  applyFresnelRim(hull, 0x6fb4ff, 2.8, 0.55);
  return {
    hull,
    accent: new THREE.MeshStandardMaterial({
      color: palette.accent,
      roughness: 0.36,
      metalness: 0.55,
      emissive: 0x5a1c08,
      emissiveIntensity: 0.35,
      envMapIntensity: 1.2,
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

function navLight(root: THREE.Object3D, color: number, pos: [number, number, number], size = 0.07): void {
  const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 1), mat);
  bulb.position.set(pos[0], pos[1], pos[2]);
  root.add(bulb);
}

export function finishShip(root: THREE.Object3D, thrusters: ThrusterSet): BuiltShip {
  addManeuverThrusters(root, thrusters);

  // Navigation lights: classic port-red / starboard-green on the wingtips plus
  // a white beacon on the nose. Bright + toneMapped:false so bloom catches them
  // and the ship reads as a lit vehicle rather than a grey model.
  navLight(root, 0xff3b30, [-1.5, 0.28, 1.1]);
  navLight(root, 0x39ff7a, [1.5, 0.28, 1.1]);
  navLight(root, 0xffffff, [0, 0.08, -2.35], 0.05);

  const cockpitGlow = new THREE.PointLight(0x5defff, 1.2, 8, 2.2);
  cockpitGlow.position.set(0, 0.45, -0.45);
  root.add(cockpitGlow);

  const engineGlow = new THREE.PointLight(0xff7a3a, 1.6, 9, 2.0);
  engineGlow.position.set(0, -0.08, 1.55);
  root.add(engineGlow);

  return { root, attachments: attachPoints(root), thrusters };
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

export function buildShipVariant(variant: ShipVariantId): BuiltShip {
  void variant;
  return buildScrapperShip();
}
