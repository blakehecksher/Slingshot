import * as THREE from 'three';
import type { Trajectory } from '../game/trajectory';

const MAX_POINTS = 220;

export class TrajectoryRibbon {
  private line: THREE.Line;
  private positions = new Float32Array(MAX_POINTS * 3);
  private colors = new Float32Array(MAX_POINTS * 3);
  private positionAttr = new THREE.BufferAttribute(this.positions, 3);
  private colorAttr = new THREE.BufferAttribute(this.colors, 3);

  constructor(scene: THREE.Scene) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', this.positionAttr);
    geom.setAttribute('color', this.colorAttr);
    geom.setDrawRange(0, 0);

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    this.line = new THREE.Line(geom, mat);
    this.line.frustumCulled = false;
    scene.add(this.line);
  }

  update(trajectory: Trajectory): void {
    const count = Math.min(MAX_POINTS, trajectory.points.length);
    for (let i = 0; i < count; i++) {
      const point = trajectory.points[i];
      this.positions[i * 3 + 0] = point.position.x;
      this.positions[i * 3 + 1] = point.position.y;
      this.positions[i * 3 + 2] = point.position.z;

      const d = point.danger;
      this.colors[i * 3 + 0] = d < 0.5 ? d * 2 : 1;
      this.colors[i * 3 + 1] = d < 0.5 ? 1 : 1 - (d - 0.5) * 1.8;
      this.colors[i * 3 + 2] = 0.12;
    }

    this.line.geometry.setDrawRange(0, count);
    this.positionAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }
}
