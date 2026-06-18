import * as THREE from 'three';
import type { RaceCourse } from './courses';

export const COURSE_BOUNDARY_TUNING = {
  EXTRA_MARGIN: 1400,
  WARNING_SECONDS: 2.5,
};

export interface CourseBoundaryState {
  readonly outside: boolean;
  readonly remainingSec: number;
}

export class CourseBoundary {
  private center = new THREE.Vector3();
  private radius = 0;
  private outsideSec = 0;

  constructor(course: RaceCourse) {
    this.setCourse(course);
  }

  setCourse(course: RaceCourse): void {
    const points = [
      course.startPosition,
      ...course.gates.map((gate) => gate.position),
      ...(course.field.gravityAnchors ?? []).map((anchor) => {
        const [x, y, z] = anchor.position;
        return new THREE.Vector3(x, y, z);
      }),
    ];
    this.center.set(0, 0, 0);
    for (const point of points) this.center.add(point);
    this.center.multiplyScalar(1 / Math.max(1, points.length));
    this.radius = points.reduce((max, point) => Math.max(max, point.distanceTo(this.center)), 0)
      + COURSE_BOUNDARY_TUNING.EXTRA_MARGIN;
    this.outsideSec = 0;
  }

  update(position: THREE.Vector3, dt: number): CourseBoundaryState {
    const outside = position.distanceTo(this.center) > this.radius;
    this.outsideSec = outside ? this.outsideSec + dt : 0;
    return {
      outside,
      remainingSec: Math.max(0, COURSE_BOUNDARY_TUNING.WARNING_SECONDS - this.outsideSec),
    };
  }

  reset(): void {
    this.outsideSec = 0;
  }
}
