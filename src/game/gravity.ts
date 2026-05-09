import * as THREE from 'three';
import type { Asteroid } from './asteroids';

export interface GravitySample {
  readonly acceleration: THREE.Vector3;
  readonly closestClearance: number;
  readonly strongestPull: number;
}

const GRAVITY_G = 0.02;
const SOFTENING_FACTOR = 0.7;
const MIN_SOFTENING = 28;

const _delta = new THREE.Vector3();

export function sampleGravityAt(position: THREE.Vector3, asteroids: readonly Asteroid[]): GravitySample {
  const acceleration = new THREE.Vector3();
  let closestClearance = Number.POSITIVE_INFINITY;
  let strongestPull = 0;

  for (const asteroid of asteroids) {
    _delta.subVectors(asteroid.position, position);
    const distanceSq = Math.max(_delta.lengthSq(), 0.0001);
    const distance = Math.sqrt(distanceSq);
    const softening = Math.max(MIN_SOFTENING, asteroid.radius * SOFTENING_FACTOR);
    const softenedSq = distanceSq + softening * softening;
    const pull = (GRAVITY_G * asteroid.mass) / softenedSq;

    acceleration.addScaledVector(_delta, pull / distance);
    strongestPull = Math.max(strongestPull, pull);
    closestClearance = Math.min(closestClearance, distance - asteroid.radius);
  }

  return { acceleration, closestClearance, strongestPull };
}

export function dangerForClearance(clearance: number): number {
  if (!Number.isFinite(clearance)) return 0;
  if (clearance <= 0) return 1;
  if (clearance >= 220) return 0;
  return 1 - clearance / 220;
}
