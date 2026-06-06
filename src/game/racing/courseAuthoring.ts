import * as THREE from 'three';
import type { AsteroidTuningPatch } from '../asteroids';

export type Vec3Tuple = readonly [number, number, number];

export type CourseBiome = 'open-claim-space' | 'dead-iron-belt' | 'black-core-field';
export type CourseDifficulty = 1 | 2 | 3 | 4 | 5;

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

export interface CourseGravityAnchor {
  readonly id: string;
  readonly position: Vec3Tuple;
  readonly radius: number;
  readonly massScale: number;
  readonly visualIntensity: number;
  readonly drift?: Vec3Tuple;
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
  readonly position: Vec3Tuple;
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
  readonly tutorial?: CourseTutorial;
}

function v([x, y, z]: Vec3Tuple): THREE.Vector3 {
  return new THREE.Vector3(x, y, z);
}

function gate(def: AuthoredRaceGate): RaceGate {
  return {
    id: def.id,
    label: def.label,
    position: v(def.position),
    radius: def.radius,
    normal: v(def.normal ?? [0, 0, 1]).normalize(),
  };
}

export function buildRaceCourse(def: AuthoredRaceCourse): RaceCourse {
  const course: RaceCourse = {
    id: def.id,
    name: def.name,
    summary: def.summary,
    seed: def.seed,
    startPosition: v(def.startPosition),
    medals: def.medals,
    design: def.design,
    field: def.field,
    asteroidTuning: def.field.asteroidTuning,
    gates: def.gates.map(gate),
  };
  if (def.tutorial) return { ...course, tutorial: def.tutorial };
  return course;
}

export function buildRaceCourses(defs: readonly AuthoredRaceCourse[]): readonly RaceCourse[] {
  return defs.map(buildRaceCourse);
}
