import * as THREE from 'three';
import {
  type MaterialSet,
  addEngine,
  addPlume,
  box,
  canopy,
  cone,
  createShipMaterials,
  cyl,
} from './primitives';
import type { PartSlot } from './manifestTypes';
import type { ThrusterSet } from './types';

export interface PartStatDelta {
  // Each delta is added to the EffectiveTuning baseline. Hull/cockpit deltas
  // are usually negative (cost) or zero. Engines positive thrust. Cargo
  // pods positive cargo cap. Weapons positive damage. Etc.
  thrust?: number;
  reverseThrust?: number;
  agility?: number;       // multiplier on rotation rates
  cargoCap?: number;
  energyMax?: number;
  hullHp?: number;
  weaponDamage?: number;
  weaponRof?: number;     // shots/sec
  weaponMuzzle?: number;  // m/s
  miningCoef?: number;
  brake?: number;
  mass?: number;          // additive kg (decreases acceleration unless thrust scales)
}

export interface BuiltinPartContext {
  root: THREE.Object3D;
  thrusters: ThrusterSet;
  mats: MaterialSet;
}

export interface BuiltinPartDef {
  id: string;
  slot: PartSlot;
  displayName: string;
  cost: number;             // bank kg required
  description: string;
  stats: PartStatDelta;
  build(ctx: BuiltinPartContext): void;
}

// All slot mount offsets are baked into each builder so builds compose without
// the assembler needing to know about geometry. Each part respects the ship's
// canonical attach-point coordinates (see primitives.ts DEFAULT_MOUNTS).

const PARTS: BuiltinPartDef[] = [
  // ---- Hulls ----
  {
    id: 'hull-stripped-a',
    slot: 'hull',
    displayName: 'Stripped runner hull',
    cost: 0,
    description: 'Bare welded hull. Light, fragile.',
    stats: { mass: 0.0, hullHp: 60, agility: 1.06 },
    build({ root, mats }) {
      cone(root, 0.43, 1.55, [0, -0.02, -1.85], mats.accent, 7);
      box(root, [1.05, 0.58, 1.45], [0, 0.0, -0.65], mats.hull);
      box(root, [1.22, 0.72, 1.1], [0, 0.02, 0.5], mats.hull);
      box(root, [0.35, 0.05, 2.2], [0, 0.39, -0.45], mats.accent);
    },
  },
  {
    id: 'hull-armored-a',
    slot: 'hull',
    displayName: 'Plated bulk hull',
    cost: 320,
    description: 'Armored deep-field hull. Heavier, sluggish, durable.',
    stats: { mass: 0.4, hullHp: 160, agility: 0.86 },
    build({ root, mats }) {
      cone(root, 0.52, 1.45, [0, -0.02, -1.78], mats.darkPanel, 7);
      box(root, [1.18, 0.7, 1.55], [0, 0.0, -0.55], mats.hull);
      box(root, [1.36, 0.86, 1.2], [0, 0.04, 0.55], mats.hull);
      box(root, [1.42, 0.94, 0.95], [0, 0.04, 1.32], mats.darkPanel);
      box(root, [0.42, 0.1, 2.4], [0, 0.42, -0.4], mats.accent);
      box(root, [1.12, 0.18, 1.35], [0, -0.42, 0.3], mats.darkPanel);
    },
  },
  // ---- Cockpits ----
  {
    id: 'cockpit-canopy-a',
    slot: 'cockpit',
    displayName: 'Bubble canopy',
    cost: 0,
    description: 'Standard glass canopy. Good visibility.',
    stats: { agility: 1.02, energyMax: 0 },
    build({ root, mats }) {
      canopy(root, [0, 0.4, -0.45], [0.78, 0.55, 1.35], mats.cockpit);
    },
  },
  {
    id: 'cockpit-armored-a',
    slot: 'cockpit',
    displayName: 'Armored cockpit',
    cost: 220,
    description: 'Reinforced canopy. Less visibility, more HP.',
    stats: { hullHp: 60, agility: 0.96 },
    build({ root, mats }) {
      canopy(root, [0, 0.4, -0.45], [0.74, 0.46, 1.32], mats.darkPanel);
      box(root, [0.6, 0.1, 0.55], [0, 0.62, -0.45], mats.accent);
      box(root, [0.18, 0.18, 0.4], [0, 0.4, -0.92], mats.cockpit);
    },
  },
  // ---- Engines ----
  {
    id: 'engine-pod-a-l',
    slot: 'engine-l',
    displayName: 'Standard engine pod (L)',
    cost: 0,
    description: 'Basic port engine.',
    stats: { thrust: 18, reverseThrust: 6, energyMax: 0 },
    build({ root, thrusters, mats }) {
      addEngine(root, thrusters, mats, -1.35, -0.02, 0.78, 0.22, 1.05);
    },
  },
  {
    id: 'engine-pod-a-r',
    slot: 'engine-r',
    displayName: 'Standard engine pod (R)',
    cost: 0,
    description: 'Basic starboard engine.',
    stats: { thrust: 18, reverseThrust: 6, energyMax: 0 },
    build({ root, thrusters, mats }) {
      addEngine(root, thrusters, mats, 1.35, -0.02, 0.78, 0.22, 1.05);
    },
  },
  {
    id: 'engine-pod-b-l',
    slot: 'engine-l',
    displayName: 'Heavy engine pod (L)',
    cost: 380,
    description: 'Bigger nozzles. More thrust, more drain.',
    stats: { thrust: 38, reverseThrust: 10, agility: 0.95, mass: 0.05 },
    build({ root, thrusters, mats }) {
      box(root, [0.32, 0.42, 0.85], [-1.35, -0.04, 0.6], mats.darkPanel);
      addEngine(root, thrusters, mats, -1.35, -0.02, 0.95, 0.32, 1.18);
      addEngine(root, thrusters, mats, -1.35, -0.32, 0.92, 0.18, 0.75);
    },
  },
  {
    id: 'engine-pod-b-r',
    slot: 'engine-r',
    displayName: 'Heavy engine pod (R)',
    cost: 380,
    description: 'Bigger nozzles. More thrust, more drain.',
    stats: { thrust: 38, reverseThrust: 10, agility: 0.95, mass: 0.05 },
    build({ root, thrusters, mats }) {
      box(root, [0.32, 0.42, 0.85], [1.35, -0.04, 0.6], mats.darkPanel);
      addEngine(root, thrusters, mats, 1.35, -0.02, 0.95, 0.32, 1.18);
      addEngine(root, thrusters, mats, 1.35, -0.32, 0.92, 0.18, 0.75);
    },
  },
  // ---- Wings ----
  {
    id: 'wing-stub-a-l',
    slot: 'wing-l',
    displayName: 'Stub wing (L)',
    cost: 0,
    description: 'Short port wing.',
    stats: { agility: 1.0 },
    build({ root, mats }) {
      box(root, [0.75, 0.08, 0.52], [-1.02, -0.02, 0.78], mats.hull, [0, -0.18, 0]);
    },
  },
  {
    id: 'wing-stub-a-r',
    slot: 'wing-r',
    displayName: 'Stub wing (R)',
    cost: 0,
    description: 'Short starboard wing.',
    stats: { agility: 1.0 },
    build({ root, mats }) {
      box(root, [0.75, 0.08, 0.52], [1.02, -0.02, 0.78], mats.hull, [0, 0.18, 0]);
    },
  },
  {
    id: 'wing-long-a-l',
    slot: 'wing-l',
    displayName: 'Long wing (L)',
    cost: 180,
    description: 'Extends control authority. More agility.',
    stats: { agility: 1.12, mass: 0.04 },
    build({ root, mats }) {
      box(root, [1.05, 0.1, 0.7], [-1.32, -0.02, 0.78], mats.hull, [0, -0.18, 0]);
      box(root, [0.4, 0.08, 0.32], [-2.05, -0.02, 0.85], mats.accent);
    },
  },
  {
    id: 'wing-long-a-r',
    slot: 'wing-r',
    displayName: 'Long wing (R)',
    cost: 180,
    description: 'Extends control authority. More agility.',
    stats: { agility: 1.12, mass: 0.04 },
    build({ root, mats }) {
      box(root, [1.05, 0.1, 0.7], [1.32, -0.02, 0.78], mats.hull, [0, 0.18, 0]);
      box(root, [0.4, 0.08, 0.32], [2.05, -0.02, 0.85], mats.accent);
    },
  },
  // ---- Topspine ----
  {
    id: 'spine-array-a',
    slot: 'topspine',
    displayName: 'Sensor array spine',
    cost: 80,
    description: 'Improves close-pass mining yield.',
    stats: { miningCoef: 0.006 },
    build({ root, mats }) {
      box(root, [0.08, 0.5, 0.55], [0, 0.5, 0.95], mats.trim);
      box(root, [0.09, 0.12, 0.4], [0, 0.78, 0.95], mats.accent);
      cone(root, 0.05, 0.4, [0, 1.05, 0.9], mats.trim, 6);
    },
  },
  {
    id: 'spine-fins-a',
    slot: 'topspine',
    displayName: 'Radiator fins',
    cost: 140,
    description: 'Pushes energy capacity. Bigger reserve.',
    stats: { energyMax: 35 },
    build({ root, mats }) {
      for (let i = 0; i < 6; i++) {
        cone(root, 0.06, 0.32, [-0.25 + i * 0.1, 0.62, 0.33 + i * 0.07], mats.trim, 4);
      }
      box(root, [0.18, 0.36, 0.6], [0, 0.62, 0.85], mats.darkPanel);
    },
  },
  // ---- Cargo bay ----
  {
    id: 'cargo-pod-a',
    slot: 'cargo-bay',
    displayName: 'Standard cargo pod',
    cost: 0,
    description: 'Baseline containment pod.',
    stats: { cargoCap: 0 },
    build({ root, mats }) {
      box(root, [0.82, 0.38, 0.72], [0, -0.55, 0.45], mats.darkPanel);
      box(root, [0.95, 0.16, 0.45], [0, -0.82, 0.45], mats.cargo);
    },
  },
  {
    id: 'cargo-pod-b',
    slot: 'cargo-bay',
    displayName: 'Doubled containment',
    cost: 280,
    description: 'Two stacked pods. +cargo cap.',
    stats: { cargoCap: 3000, mass: 0.08 },
    build({ root, mats }) {
      box(root, [0.92, 0.42, 0.88], [0, -0.5, 0.42], mats.darkPanel);
      box(root, [1.05, 0.18, 0.55], [0, -0.78, 0.42], mats.cargo);
      box(root, [1.05, 0.18, 0.55], [0, -0.94, 0.42], mats.cargo);
    },
  },
  {
    id: 'cargo-pod-c',
    slot: 'cargo-bay',
    displayName: 'Bulk freighter rig',
    cost: 720,
    description: 'Heavy industrial rig. Much more cap, much heavier.',
    stats: { cargoCap: 8000, mass: 0.18, agility: 0.92 },
    build({ root, mats }) {
      box(root, [1.18, 0.55, 1.25], [0, -0.55, 0.42], mats.darkPanel);
      box(root, [1.32, 0.28, 0.78], [0, -0.92, 0.42], mats.cargo);
      box(root, [1.18, 0.18, 0.45], [-0.45, -1.05, 0.42], mats.accent);
      box(root, [1.18, 0.18, 0.45], [0.45, -1.05, 0.42], mats.accent);
    },
  },
  // ---- Weapons ----
  {
    id: 'weapon-none-l',
    slot: 'weapon-l',
    displayName: 'No port weapon',
    cost: 0,
    description: 'Empty hardpoint.',
    stats: {},
    build() { /* no-op */ },
  },
  {
    id: 'weapon-none-r',
    slot: 'weapon-r',
    displayName: 'No starboard weapon',
    cost: 0,
    description: 'Empty hardpoint.',
    stats: {},
    build() { /* no-op */ },
  },
  {
    id: 'weapon-light-l',
    slot: 'weapon-l',
    displayName: 'Light pulse cutter (L)',
    cost: 220,
    description: 'Low-damage rapid pulses. Good against fast targets.',
    stats: { weaponDamage: 8, weaponRof: 4, weaponMuzzle: 720 },
    build({ root, mats, thrusters }) {
      box(root, [0.18, 0.16, 0.42], [-0.95, 0.04, -0.25], mats.darkPanel);
      cyl(root, 0.06, 0.62, [-0.95, 0.04, -0.55], mats.engine, 8);
      addPlume(root, thrusters.main, [-0.95, 0.04, -0.85], [0, 0, -1], 0.04, 0.18, 0xff7a3a);
    },
  },
  {
    id: 'weapon-light-r',
    slot: 'weapon-r',
    displayName: 'Light pulse cutter (R)',
    cost: 220,
    description: 'Low-damage rapid pulses. Good against fast targets.',
    stats: { weaponDamage: 8, weaponRof: 4, weaponMuzzle: 720 },
    build({ root, mats, thrusters }) {
      box(root, [0.18, 0.16, 0.42], [0.95, 0.04, -0.25], mats.darkPanel);
      cyl(root, 0.06, 0.62, [0.95, 0.04, -0.55], mats.engine, 8);
      addPlume(root, thrusters.main, [0.95, 0.04, -0.85], [0, 0, -1], 0.04, 0.18, 0xff7a3a);
    },
  },
  {
    id: 'weapon-heavy-l',
    slot: 'weapon-l',
    displayName: 'Heavy slug gun (L)',
    cost: 520,
    description: 'Slow, hard-hitting slugs. Curves a lot in wells.',
    stats: { weaponDamage: 32, weaponRof: 1.2, weaponMuzzle: 480, mass: 0.05 },
    build({ root, mats }) {
      box(root, [0.26, 0.22, 0.55], [-0.95, 0.04, -0.2], mats.darkPanel);
      cyl(root, 0.1, 0.85, [-0.95, 0.04, -0.65], mats.engine, 10);
      cyl(root, 0.13, 0.18, [-0.95, 0.04, -1.04], mats.accent, 10);
    },
  },
  {
    id: 'weapon-heavy-r',
    slot: 'weapon-r',
    displayName: 'Heavy slug gun (R)',
    cost: 520,
    description: 'Slow, hard-hitting slugs. Curves a lot in wells.',
    stats: { weaponDamage: 32, weaponRof: 1.2, weaponMuzzle: 480, mass: 0.05 },
    build({ root, mats }) {
      box(root, [0.26, 0.22, 0.55], [0.95, 0.04, -0.2], mats.darkPanel);
      cyl(root, 0.1, 0.85, [0.95, 0.04, -0.65], mats.engine, 10);
      cyl(root, 0.13, 0.18, [0.95, 0.04, -1.04], mats.accent, 10);
    },
  },
];

const PARTS_BY_ID = new Map(PARTS.map((p) => [p.id, p]));

export function listParts(): readonly BuiltinPartDef[] {
  return PARTS;
}

export function listPartsForSlot(slot: PartSlot): BuiltinPartDef[] {
  return PARTS.filter((p) => p.slot === slot);
}

export function getPart(id: string): BuiltinPartDef | undefined {
  return PARTS_BY_ID.get(id);
}

export function defaultManifestParts(): { slot: PartSlot; partId: string }[] {
  return [
    { slot: 'hull', partId: 'hull-stripped-a' },
    { slot: 'cockpit', partId: 'cockpit-canopy-a' },
    { slot: 'engine-l', partId: 'engine-pod-a-l' },
    { slot: 'engine-r', partId: 'engine-pod-a-r' },
    { slot: 'wing-l', partId: 'wing-stub-a-l' },
    { slot: 'wing-r', partId: 'wing-stub-a-r' },
    { slot: 'topspine', partId: 'spine-array-a' },
    { slot: 'cargo-bay', partId: 'cargo-pod-a' },
    { slot: 'weapon-l', partId: 'weapon-light-l' },
    { slot: 'weapon-r', partId: 'weapon-light-r' },
  ];
}

export { createShipMaterials };
