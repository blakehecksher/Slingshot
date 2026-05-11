import * as THREE from 'three';
import type { AsteroidTuningPatch } from '../asteroids';

export interface RaceGate {
  readonly id: string;
  readonly label: string;
  readonly position: THREE.Vector3;
  readonly radius: number;
  readonly normal: THREE.Vector3;
}

export interface MedalTimes {
  readonly gold: number;
  readonly silver: number;
  readonly bronze: number;
}

export interface RaceCourse {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly seed: number;
  readonly startPosition: THREE.Vector3;
  readonly gates: readonly RaceGate[];
  readonly medals: MedalTimes;
  readonly asteroidTuning: AsteroidTuningPatch;
}

export const RACE_ASTEROID_DEFAULTS: AsteroidTuningPatch = {
  PROCEDURAL_COUNT: 760,
  RADIUS_MIN: 10,
  RADIUS_RANGE: 260,
  RADIUS_POWER: 1.38,
  SPHERE_INNER: 420,
  SPHERE_OUTER: 7600,
  RADIAL_BIAS: 0.86,
  SIZE_INNER_MAX: 0.42,
  DRIFT_MIN: 0.04,
  DRIFT_RANGE: 0.42,
  ROT_MIN: 0.012,
  ROT_RANGE: 0.04,
  MASS_COEF: 11,
  MASS_RADIUS_POWER: 3,
  CORE_DENSITY_MIN: 0.7,
  CORE_DENSITY_RANGE: 1.55,
};

function v(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z);
}

function gate(id: string, label: string, position: THREE.Vector3, radius: number, normal = new THREE.Vector3(0, 0, 1)): RaceGate {
  return { id, label, position, radius, normal: normal.clone().normalize() };
}

export const RACE_COURSES: readonly RaceCourse[] = [
  {
    id: 'claim-shakedown',
    name: 'Claim Shakedown',
    summary: 'A short league qualifier through the open field and back to the base beacon.',
    seed: 10100,
    startPosition: v(0, 0, 180),
    medals: { gold: 46, silver: 58, bronze: 74 },
    asteroidTuning: {
      PROCEDURAL_COUNT: 520,
      SPHERE_OUTER: 4200,
      RADIUS_RANGE: 165,
      MASS_COEF: 9.5,
      CORE_DENSITY_RANGE: 1.2,
    },
    gates: [
      gate('launch-slot', 'Launch Slot', v(0, 40, -480), 96),
      gate('high-line', 'High Line', v(360, 170, -980), 92, v(-0.35, -0.1, 1)),
      gate('belter-turn', 'Belter Turn', v(-240, -80, -1420), 88, v(0.4, 0.1, 1)),
      gate('base-return', 'Base Return', v(0, 0, 110), 108),
    ],
  },
  {
    id: 'dead-iron-sweep',
    name: 'Dead Iron Sweep',
    summary: 'A mid-field race built around fast bends near heavier wells.',
    seed: 20420,
    startPosition: v(0, 0, 180),
    medals: { gold: 82, silver: 104, bronze: 132 },
    asteroidTuning: {
      PROCEDURAL_COUNT: 820,
      SPHERE_OUTER: 6500,
      RADIUS_RANGE: 225,
      MASS_COEF: 12.5,
      CORE_DENSITY_RANGE: 1.7,
      SIZE_INNER_MAX: 0.52,
    },
    gates: [
      gate('yard-exit', 'Yard Exit', v(-180, 60, -680), 96),
      gate('iron-hook', 'Iron Hook', v(760, -160, -1520), 92, v(-0.5, 0.1, 1)),
      gate('long-fall', 'Long Fall', v(260, 360, -2600), 98, v(0.1, -0.3, 1)),
      gate('cross-drift', 'Cross Drift', v(-840, 120, -2360), 96, v(0.7, -0.1, 1)),
      gate('return-burn', 'Return Burn', v(-420, -140, -780), 92, v(0.45, 0.1, -1)),
      gate('league-line', 'League Line', v(0, 0, 120), 110),
    ],
  },
  {
    id: 'black-core-run',
    name: 'Black Core Run',
    summary: 'A deep-field sprint where close gravity passes are faster than clean lines.',
    seed: 31990,
    startPosition: v(0, 0, 180),
    medals: { gold: 124, silver: 154, bronze: 196 },
    asteroidTuning: {
      PROCEDURAL_COUNT: 980,
      SPHERE_OUTER: 8200,
      RADIUS_RANGE: 285,
      RADIAL_BIAS: 0.78,
      SIZE_INNER_MAX: 0.58,
      MASS_COEF: 15,
      CORE_DENSITY_MIN: 0.85,
      CORE_DENSITY_RANGE: 2.0,
      DRIFT_RANGE: 0.34,
    },
    gates: [
      gate('deep-ticket', 'Deep Ticket', v(120, -80, -760), 96),
      gate('hard-left', 'Hard Left', v(1120, 260, -1780), 94, v(-0.55, -0.15, 1)),
      gate('sinkhole', 'Sinkhole', v(640, -420, -3340), 92, v(-0.2, 0.45, 1)),
      gate('knife-edge', 'Knife Edge', v(-980, -120, -3860), 88, v(0.7, 0.05, 1)),
      gate('dead-core', 'Dead Core', v(-1360, 540, -2420), 92, v(0.5, -0.3, -1)),
      gate('snapback', 'Snapback', v(-420, 180, -1180), 96, v(0.3, -0.05, -1)),
      gate('home-burn', 'Home Burn', v(0, 0, 125), 112),
    ],
  },
];

export function medalFor(timeSec: number, medals: MedalTimes): 'gold' | 'silver' | 'bronze' | 'finish' {
  if (timeSec <= medals.gold) return 'gold';
  if (timeSec <= medals.silver) return 'silver';
  if (timeSec <= medals.bronze) return 'bronze';
  return 'finish';
}

