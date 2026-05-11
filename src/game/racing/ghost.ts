import * as THREE from 'three';
import type { Ship } from '../ship';
import { buildShipVariant } from '../../render/shipVisual';
import type { GhostRun, GhostSample } from './leaderboard';

const SAMPLE_INTERVAL = 1 / 15;

export class GhostRecorder {
  private samples: GhostSample[] = [];
  private nextSampleAt = 0;

  reset(): void {
    this.samples = [];
    this.nextSampleAt = 0;
  }

  update(timeSec: number, ship: Ship, checkpointIndex: number): void {
    if (timeSec + 0.0001 < this.nextSampleAt) return;
    this.samples.push(sampleShip(timeSec, ship, checkpointIndex));
    this.nextSampleAt = timeSec + SAMPLE_INTERVAL;
  }

  complete(courseId: string, timeSec: number, splits: number[], ship: Ship, checkpointIndex: number): GhostRun {
    this.samples.push(sampleShip(timeSec, ship, checkpointIndex));
    return {
      courseId,
      timeSec,
      splits: [...splits],
      samples: this.samples,
    };
  }
}

export class GhostReplay {
  private root: THREE.Object3D;
  private run: GhostRun | null = null;
  private lastPosition = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const built = buildShipVariant('sparrow');
    this.root = built.root;
    this.root.visible = false;
    this.root.scale.setScalar(1.04);
    this.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = new THREE.MeshBasicMaterial({
        color: 0x6dd6ff,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      mesh.material = material;
    });
    scene.add(this.root);
  }

  setRun(run: GhostRun | null): void {
    this.run = run;
    this.root.visible = false;
  }

  reset(): void {
    this.root.visible = false;
  }

  update(timeSec: number): void {
    if (!this.run || this.run.samples.length < 2) {
      this.root.visible = false;
      return;
    }
    const samples = this.run.samples;
    if (timeSec < samples[0].t || timeSec > samples[samples.length - 1].t) {
      this.root.visible = false;
      return;
    }

    let lo = 0;
    let hi = samples.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].t <= timeSec) lo = mid;
      else hi = mid;
    }

    const a = samples[lo];
    const b = samples[hi];
    const span = Math.max(0.0001, b.t - a.t);
    const t = Math.max(0, Math.min(1, (timeSec - a.t) / span));
    const pa = new THREE.Vector3(a.p[0], a.p[1], a.p[2]);
    const pb = new THREE.Vector3(b.p[0], b.p[1], b.p[2]);
    const qa = new THREE.Quaternion(a.q[0], a.q[1], a.q[2], a.q[3]);
    const qb = new THREE.Quaternion(b.q[0], b.q[1], b.q[2], b.q[3]);
    this.root.position.copy(pa.lerp(pb, t));
    this.root.quaternion.copy(qa.slerp(qb, t));
    this.lastPosition.copy(this.root.position);
    this.root.visible = true;
  }

  get position(): THREE.Vector3 | null {
    return this.root.visible ? this.lastPosition : null;
  }
}

function sampleShip(timeSec: number, ship: Ship, checkpointIndex: number): GhostSample {
  const p = ship.position;
  const q = ship.body.rotation();
  return {
    t: timeSec,
    p: [p.x, p.y, p.z],
    q: [q.x, q.y, q.z, q.w],
    speed: ship.speed,
    checkpointIndex,
  };
}

