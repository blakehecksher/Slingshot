import type { AsteroidTuningPatch } from '../asteroids';
import { buildRaceCourses, type MedalTimes } from './courseAuthoring';
import { AUTHORED_RACE_COURSES } from './courseCatalog';

export type {
  AuthoredRaceCourse,
  AuthoredGateAnchor,
  AuthoredRaceGate,
  CourseBiome,
  CourseDesignBrief,
  CourseDifficulty,
  CourseFieldRecipe,
  CourseGravityAnchor,
  CourseLore,
  CourseTutorial,
  CourseTutorialTipTriggers,
  MedalTimes,
  RaceCourse,
  RaceGate,
  RaceGateKind,
  Vec3Tuple,
} from './courseAuthoring';

export const RACE_ASTEROID_DEFAULTS: AsteroidTuningPatch = {
  PROCEDURAL_COUNT: 760,
  VISUAL_COUNT: 0,
  VISUAL_RADIUS_MIN: 10,
  VISUAL_RADIUS_RANGE: 150,
  VISUAL_RADIUS_POWER: 1.65,
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

export const RACE_COURSES = buildRaceCourses(AUTHORED_RACE_COURSES);

export function medalFor(timeSec: number, medals: MedalTimes): 'gold' | 'silver' | 'bronze' | 'finish' {
  if (timeSec <= medals.gold) return 'gold';
  if (timeSec <= medals.silver) return 'silver';
  if (timeSec <= medals.bronze) return 'bronze';
  return 'finish';
}
