import * as THREE from 'three';
import type { Asteroid } from './asteroids';
import { dangerForClearance, sampleGravityAt } from './gravity';

export interface TrajectoryPoint {
  readonly position: THREE.Vector3;
  readonly danger: number;
}

export interface Trajectory {
  readonly points: TrajectoryPoint[];
  readonly minClearance: number;
}

const PREDICTION_SECONDS = 8;
const PREDICTION_DT = 1 / 24;

export function predictTrajectory(
  position: { x: number; y: number; z: number },
  velocity: { x: number; y: number; z: number },
  asteroids: readonly Asteroid[],
): Trajectory {
  const p = new THREE.Vector3(position.x, position.y, position.z);
  const v = new THREE.Vector3(velocity.x, velocity.y, velocity.z);
  const points: TrajectoryPoint[] = [];
  let minClearance = Number.POSITIVE_INFINITY;

  const steps = Math.floor(PREDICTION_SECONDS / PREDICTION_DT);
  for (let i = 0; i <= steps; i++) {
    const sample = sampleGravityAt(p, asteroids);
    minClearance = Math.min(minClearance, sample.closestClearance);
    points.push({
      position: p.clone(),
      danger: dangerForClearance(sample.closestClearance),
    });

    v.addScaledVector(sample.acceleration, PREDICTION_DT);
    p.addScaledVector(v, PREDICTION_DT);
  }

  return { points, minClearance };
}
