import * as THREE from 'three';
import type { RaceCourse, RaceGate } from './courses';

interface GateHandle {
  readonly kind: RaceGate['kind'];
  readonly position: THREE.Vector3;
  readonly normal: THREE.Vector3;
  readonly radius: number;
  readonly asteroidRadius: number;
  readonly group: THREE.Group;
  readonly visuals: THREE.Mesh[];
  readonly light: THREE.PointLight;
  readonly portal: THREE.Mesh | null;
}

const ACTIVE_MAT = new THREE.MeshBasicMaterial({
  color: 0x5dff9a,
  transparent: true,
  opacity: 0.92,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});

const WAITING_MAT = new THREE.MeshBasicMaterial({
  color: 0xffc65a,
  transparent: true,
  opacity: 0.22,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});

const PASSED_MAT = new THREE.MeshBasicMaterial({
  color: 0xc8c3b7,
  transparent: true,
  opacity: 0.12,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});

const NEXT_MAT = new THREE.MeshBasicMaterial({
  color: 0xffc65a,
  transparent: true,
  opacity: 0.48,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});

const tmpQuat = new THREE.Quaternion();
const defaultNormal = new THREE.Vector3(0, 0, 1);
const tmpPrev = new THREE.Vector3();
const tmpCurr = new THREE.Vector3();
const tmpCross = new THREE.Vector3();
const tmpSeg = new THREE.Vector3();
const tmpClosest = new THREE.Vector3();

export class CheckpointSystem {
  private scene: THREE.Scene;
  private handles: GateHandle[] = [];
  private spin = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  setCourse(course: RaceCourse): void {
    this.clear();
    course.gates.forEach((gate) => this.addGate(gate));
    this.updateActive(0);
  }

  clear(): void {
    for (const handle of this.handles) {
      this.scene.remove(handle.group);
    }
    this.handles = [];
  }

  /** Did the ship's travel this step pass through gate `index`'s ring?
   *  Geometric swept test against the gate plane — tunnel-proof at any speed,
   *  and (unlike a sphere sensor) only counts passing through the actual hole. */
  passedGate(index: number, prevPos: { x: number; y: number; z: number }, currPos: { x: number; y: number; z: number }): boolean {
    const h = this.handles[index];
    if (!h) return false;
    tmpPrev.set(prevPos.x, prevPos.y, prevPos.z);
    tmpCurr.set(currPos.x, currPos.y, currPos.z);

    if (h.kind === 'asteroid') {
      const prevDist = tmpPrev.distanceTo(h.position);
      const currDist = tmpCurr.distanceTo(h.position);
      if (prevDist <= h.radius) return false;
      if (currDist <= h.radius) return true;

      tmpSeg.copy(tmpCurr).sub(tmpPrev);
      const lenSq = tmpSeg.lengthSq();
      if (lenSq <= 0.0001) return false;
      const t = THREE.MathUtils.clamp(tmpClosest.copy(h.position).sub(tmpPrev).dot(tmpSeg) / lenSq, 0, 1);
      tmpClosest.copy(tmpPrev).addScaledVector(tmpSeg, t);
      return tmpClosest.distanceTo(h.position) <= h.radius;
    }

    const d0 = tmpCross.copy(tmpPrev).sub(h.position).dot(h.normal);
    const d1 = tmpCross.copy(tmpCurr).sub(h.position).dot(h.normal);
    if (d0 === d1) return false;     // travelled parallel to the gate plane
    if (d0 * d1 > 0) return false;   // stayed on one side — no crossing
    const t = d0 / (d0 - d1);        // fraction of the segment at the plane
    tmpSeg.copy(tmpCurr).sub(tmpPrev).multiplyScalar(t);
    tmpCross.copy(tmpPrev).add(tmpSeg);
    return tmpCross.distanceTo(h.position) <= h.radius;
  }

  update(dt: number, nextCheckpoint: number): void {
    this.spin += dt;
    this.updateActive(nextCheckpoint);
    for (let i = 0; i < this.handles.length; i++) {
      const h = this.handles[i];
      for (const visual of h.visuals) {
        visual.rotation.z += dt * (i === nextCheckpoint ? 0.85 : 0.22);
        if (h.kind === 'asteroid') visual.rotation.y += dt * 0.12;
      }
      const pulse = 0.7 + Math.sin(this.spin * 4 + i) * 0.18;
      h.light.intensity = i === nextCheckpoint ? 26 * pulse : i === nextCheckpoint + 1 ? 9 * pulse : 2;
      if (h.portal) {
        const mat = h.portal.material as THREE.MeshBasicMaterial;
        const breathe = 0.5 + Math.sin(this.spin * 2.2) * 0.5;
        mat.opacity = i === nextCheckpoint ? 0.05 + breathe * 0.07
          : i === nextCheckpoint + 1 ? 0.02
          : 0;
      }
    }
  }

  targetPosition(index: number): THREE.Vector3 | null {
    const handle = this.handles[index];
    if (!handle) return null;
    return handle.group.position;
  }

  private addGate(gate: RaceGate): void {
    const group = new THREE.Group();
    group.position.copy(gate.position);
    if (gate.kind === 'ring') {
      tmpQuat.setFromUnitVectors(defaultNormal, gate.normal);
      group.quaternion.copy(tmpQuat);
    }

    const visuals: THREE.Mesh[] = [];
    let portal: THREE.Mesh | null = null;
    if (gate.kind === 'ring') {
      // A faint holographic membrane filling the ring. Near-invisible when the
      // gate is dormant; the active gate's is pulsed bright in update() so the
      // target lane reads as a portal to fly through, not just a hoop.
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(gate.radius * 0.94, 48),
        new THREE.MeshBasicMaterial({
          color: 0x5dff9a,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      );
      group.add(disc);
      portal = disc;
    }
    if (gate.kind === 'asteroid') {
      const ringRadius = Math.max((gate.asteroidRadius ?? 0) + 8, gate.radius);
      const ringA = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, 2.4, 8, 96), WAITING_MAT);
      group.add(ringA);
      visuals.push(ringA);

      const ringB = new THREE.Mesh(new THREE.TorusGeometry(ringRadius * 0.985, 1.7, 8, 96), WAITING_MAT);
      ringB.rotation.x = Math.PI / 2;
      group.add(ringB);
      visuals.push(ringB);

      const ringC = new THREE.Mesh(new THREE.TorusGeometry(ringRadius * 0.97, 1.3, 8, 96), WAITING_MAT);
      ringC.rotation.y = Math.PI / 2;
      group.add(ringC);
      visuals.push(ringC);
    } else {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(gate.radius, 2.2, 8, 72), WAITING_MAT);
      group.add(ring);
      visuals.push(ring);

      const core = new THREE.Mesh(
        new THREE.TorusGeometry(gate.radius * 0.68, 0.75, 6, 48),
        WAITING_MAT,
      );
      core.rotation.z = Math.PI / 6;
      group.add(core);
      visuals.push(core);
    }

    const light = new THREE.PointLight(0x5dff9a, 12, gate.radius * 3.2, 1.8);
    group.add(light);

    this.scene.add(group);

    this.handles.push({
      kind: gate.kind,
      position: gate.position.clone(),
      normal: gate.normal.clone().normalize(),
      radius: gate.radius,
      asteroidRadius: gate.asteroidRadius ?? 0,
      group,
      visuals,
      light,
      portal,
    });
  }

  private updateActive(nextCheckpoint: number): void {
    for (let i = 0; i < this.handles.length; i++) {
      const handle = this.handles[i];
      const mat = i < nextCheckpoint
        ? PASSED_MAT
        : i === nextCheckpoint
          ? ACTIVE_MAT
          : i === nextCheckpoint + 1
            ? NEXT_MAT
            : WAITING_MAT;
      for (const visual of handle.visuals) {
        visual.material = mat;
      }
      handle.light.color.set(
        i < nextCheckpoint
          ? 0xc8c3b7
          : i === nextCheckpoint
            ? 0x5dff9a
            : i === nextCheckpoint + 1
              ? 0xffc65a
              : 0xffc65a,
      );
      handle.group.visible = i >= nextCheckpoint - 1;
    }
  }
}
