import * as THREE from 'three';
import type { Asteroid } from './asteroids';

export interface GravitySample {
  readonly acceleration: THREE.Vector3;
  readonly closestClearance: number;
  readonly strongestPull: number;
}

export const GRAVITY_TUNING = {
  G: 0.05,
  SOFTENING_FACTOR: 0.35,
  MIN_SOFTENING: 12,
  DANGER_RANGE: 220,
  // Dead Iron core ramp. When surface clearance drops below
  // radius * CORE_BOOST_RANGE_FRAC, the well ramps quadratically up to
  // (1 + CORE_BOOST_PEAK)x at the surface. Story §4: concentrated cores hit
  // disproportionately hard at close range.
  CORE_BOOST_RANGE_FRAC: 1.5,
  CORE_BOOST_PEAK: 1.8,
};

const _delta = new THREE.Vector3();

export function sampleGravityAt(position: THREE.Vector3, asteroids: readonly Asteroid[]): GravitySample {
  const acceleration = new THREE.Vector3();
  let closestClearance = Number.POSITIVE_INFINITY;
  let strongestPull = 0;

  for (const asteroid of asteroids) {
    _delta.subVectors(asteroid.position, position);
    const distanceSq = Math.max(_delta.lengthSq(), 0.0001);
    const distance = Math.sqrt(distanceSq);
    const softening = Math.max(GRAVITY_TUNING.MIN_SOFTENING, asteroid.radius * GRAVITY_TUNING.SOFTENING_FACTOR);
    const softenedSq = distanceSq + softening * softening;
    let pull = (GRAVITY_TUNING.G * asteroid.mass) / softenedSq;

    const clearance = distance - asteroid.radius;
    const coreRange = asteroid.radius * GRAVITY_TUNING.CORE_BOOST_RANGE_FRAC;
    if (coreRange > 0 && clearance < coreRange) {
      const t = Math.max(0, 1 - clearance / coreRange);
      pull *= 1 + t * t * GRAVITY_TUNING.CORE_BOOST_PEAK;
    }

    acceleration.addScaledVector(_delta, pull / distance);
    strongestPull = Math.max(strongestPull, pull);
    closestClearance = Math.min(closestClearance, clearance);
  }

  return { acceleration, closestClearance, strongestPull };
}

export function dangerForClearance(clearance: number): number {
  if (!Number.isFinite(clearance)) return 0;
  if (clearance <= 0) return 1;
  if (clearance >= GRAVITY_TUNING.DANGER_RANGE) return 0;
  return 1 - clearance / GRAVITY_TUNING.DANGER_RANGE;
}
