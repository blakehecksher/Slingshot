import * as THREE from 'three';
import type { RaceCourse } from '../game/racing/courses';

const MIN_SAMPLES = 80;
const SAMPLES_PER_LEG = 36;

export class CourseGuideLine {
  private line: THREE.Line;

  constructor(scene: THREE.Scene) {
    const material = new THREE.LineBasicMaterial({
      color: 0x56e0c7,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      depthTest: true,
    });

    this.line = new THREE.Line(new THREE.BufferGeometry(), material);
    this.line.frustumCulled = false;
    this.line.renderOrder = 1;
    scene.add(this.line);
  }

  setCourse(course: RaceCourse): void {
    const points = [course.startPosition, ...course.gates.map((gate) => gate.position)];
    if (points.length < 2) {
      this.line.geometry.setDrawRange(0, 0);
      return;
    }

    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.35);
    const sampleCount = Math.max(MIN_SAMPLES, (points.length - 1) * SAMPLES_PER_LEG);
    const sampled = curve.getPoints(sampleCount);
    const geometry = new THREE.BufferGeometry().setFromPoints(sampled);

    this.line.geometry.dispose();
    this.line.geometry = geometry;
    this.line.geometry.computeBoundingSphere();
  }

  setVisible(visible: boolean): void {
    this.line.visible = visible;
  }
}
