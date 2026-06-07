import * as THREE from 'three';
import type { AsteroidTuningPatch } from '../asteroids';

export type Vec3Tuple = readonly [number, number, number];

export type CourseBiome = 'open-claim-space' | 'dead-iron-belt' | 'black-core-field';
export type CourseDifficulty = 1 | 2 | 3 | 4 | 5;
export type RaceGateKind = 'ring' | 'asteroid';

export interface RaceGate {
  readonly id: string;
  readonly label: string;
  readonly kind: RaceGateKind;
  readonly position: THREE.Vector3;
  readonly radius: number;
  readonly asteroidRadius?: number;
  readonly normal: THREE.Vector3;
}

export interface MedalTimes {
  readonly gold: number;
  readonly silver: number;
  readonly bronze: number;
}

export interface CourseDesignBrief {
  readonly biome: CourseBiome;
  readonly difficulty: CourseDifficulty;
  readonly skillFocus: string;
  readonly rhythm: readonly string[];
  readonly generationPattern: string;
}

export interface CourseTutorialTipTriggers {
  readonly start?: string;
  readonly gates?: Readonly<Record<number, string>>;
  readonly proximity?: readonly {
    readonly anchorId: string;
    readonly range: number;
    readonly text: string;
  }[];
}

export interface CourseTutorial {
  readonly trainingOrder: number;
  readonly lessonTitle: string;
  readonly lessonSummary: string;
  readonly tipTriggers: CourseTutorialTipTriggers;
}

export interface CourseLore {
  readonly fieldNote: string;
  readonly launchCallout: string;
  readonly resultNote: string;
  readonly codexEntry: string;
}

export interface CourseGravityAnchor {
  readonly id: string;
  readonly position: Vec3Tuple;
  readonly radius: number;
  readonly massScale: number;
  readonly visualIntensity: number;
  readonly drift?: Vec3Tuple;
}

export interface AuthoredGateAnchor {
  readonly anchorId: string;
  readonly offset?: Vec3Tuple;
}

export interface CourseFieldRecipe {
  readonly asteroidTuning: AsteroidTuningPatch;
  readonly gateClearance: number;
  readonly routeCorridor: number;
  readonly gravityAnchorCount: number;
  readonly hazardBias: 'low' | 'medium' | 'high';
  readonly gravityAnchors?: readonly CourseGravityAnchor[];
}

export interface AuthoredRaceGate {
  readonly id: string;
  readonly label: string;
  readonly position?: Vec3Tuple;
  readonly anchor?: AuthoredGateAnchor;
  readonly radius: number;
  readonly normal?: Vec3Tuple;
  readonly beat: string;
}

export interface AuthoredRaceCourse {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly seed: number;
  readonly startPosition: Vec3Tuple;
  readonly medals: MedalTimes;
  readonly design: CourseDesignBrief;
  readonly field: CourseFieldRecipe;
  readonly lore?: CourseLore;
  readonly tutorial?: CourseTutorial;
  readonly gates: readonly AuthoredRaceGate[];
}

export interface RaceCourse {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly seed: number;
  readonly startPosition: THREE.Vector3;
  readonly gates: readonly RaceGate[];
  readonly medals: MedalTimes;
  readonly design: CourseDesignBrief;
  readonly field: CourseFieldRecipe;
  readonly asteroidTuning: AsteroidTuningPatch;
  readonly lore?: CourseLore;
  readonly tutorial?: CourseTutorial;
}

function v([x, y, z]: Vec3Tuple): THREE.Vector3 {
  return new THREE.Vector3(x, y, z);
}

function gateAnchor(def: AuthoredRaceGate, anchors: readonly CourseGravityAnchor[]): CourseGravityAnchor | undefined {
  if (!def.anchor) return undefined;
  const anchor = anchors.find((candidate) => candidate.id === def.anchor?.anchorId);
  if (!anchor) throw new Error(`Gate "${def.id}" references missing asteroid anchor "${def.anchor.anchorId}"`);
  return anchor;
}

function resolvedGatePosition(def: AuthoredRaceGate, anchors: readonly CourseGravityAnchor[]): THREE.Vector3 {
  if (def.anchor) {
    const anchor = gateAnchor(def, anchors);
    if (!anchor) throw new Error(`Gate "${def.id}" references missing asteroid anchor "${def.anchor.anchorId}"`);
    const offset = def.anchor.offset ? v(def.anchor.offset) : new THREE.Vector3();
    return v(anchor.position).add(offset);
  }
  if (def.position) return v(def.position);
  throw new Error(`Gate "${def.id}" must define either position or anchor`);
}

function gateNormal(def: AuthoredRaceGate, waypoints: readonly THREE.Vector3[], waypointIndex: number): THREE.Vector3 {
  const prev = waypoints[Math.max(0, waypointIndex - 1)];
  const next = waypoints[Math.min(waypoints.length - 1, waypointIndex + 1)];
  const normal = next.clone().sub(prev);
  if (normal.lengthSq() > 0.0001) return normal.normalize();
  return v(def.normal ?? [0, 0, 1]).normalize();
}

function gate(def: AuthoredRaceGate, position: THREE.Vector3, anchor: CourseGravityAnchor | undefined, normal: THREE.Vector3): RaceGate {
  const runtimeGate: RaceGate = {
    id: def.id,
    label: def.label,
    kind: anchor ? 'asteroid' : 'ring',
    position,
    radius: def.radius,
    normal,
  };
  if (anchor) return { ...runtimeGate, asteroidRadius: anchor.radius };
  return runtimeGate;
}

export function buildRaceCourse(def: AuthoredRaceCourse): RaceCourse {
  const anchors = def.field.gravityAnchors ?? [];
  const gatePositions = def.gates.map((gateDef) => resolvedGatePosition(gateDef, anchors));
  const gateAnchors = def.gates.map((gateDef) => gateAnchor(gateDef, anchors));
  const waypoints = [v(def.startPosition), ...gatePositions];
  const course: RaceCourse = {
    id: def.id,
    name: def.name,
    summary: def.summary,
    seed: def.seed,
    startPosition: waypoints[0],
    medals: def.medals,
    design: def.design,
    field: def.field,
    asteroidTuning: def.field.asteroidTuning,
    gates: def.gates.map((gateDef, index) => gate(
      gateDef,
      gatePositions[index].clone(),
      gateAnchors[index],
      gateNormal(gateDef, waypoints, index + 1),
    )),
  };
  const withLore = def.lore ? { ...course, lore: def.lore } : course;
  if (def.tutorial) return { ...withLore, tutorial: def.tutorial };
  return withLore;
}

export function buildRaceCourses(defs: readonly AuthoredRaceCourse[]): readonly RaceCourse[] {
  return defs.map(buildRaceCourse);
}
