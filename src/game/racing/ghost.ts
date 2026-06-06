import * as THREE from 'three';
import type { Ship } from '../ship';
import { buildShipVariant } from '../../render/shipVisual';
import type { GhostRun, GhostSample } from './leaderboard';

const SAMPLE_INTERVAL = 1 / 15;
const DEFAULT_GHOST_COLOR = 0x6dd6ff;

interface GhostReplayOptions {
  readonly color?: number;
}

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
  private glow: THREE.Sprite;
  private run: GhostRun | null = null;
  private lastPosition = new THREE.Vector3();
  private color: number;
  private opacity = 0.34;

  constructor(scene: THREE.Scene, options: GhostReplayOptions = {}) {
    this.color = options.color ?? DEFAULT_GHOST_COLOR;
    const built = buildShipVariant('sparrow');
    this.root = built.root;
    this.root.visible = false;
    this.root.scale.setScalar(1.04);
    this.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = new THREE.MeshBasicMaterial({
        color: this.color,
        transparent: true,
        opacity: this.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      mesh.material = material;
    });
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createGlowTexture(this.color),
      color: this.color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    this.glow.visible = false;
    scene.add(this.glow);
    scene.add(this.root);
  }

  setRun(run: GhostRun | null): void {
    this.run = run;
    this.root.visible = false;
    this.glow.visible = false;
  }

  reset(): void {
    this.root.visible = false;
    this.glow.visible = false;
  }

  setOpacity(opacity: number): void {
    this.opacity = Math.max(0.08, Math.min(0.85, opacity * 0.48));
    this.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material;
      if (material instanceof THREE.MeshBasicMaterial) material.opacity = this.opacity;
    });
  }

  update(timeSec: number, viewerPosition?: THREE.Vector3): void {
    if (!this.run || this.run.samples.length < 2) {
      this.root.visible = false;
      this.glow.visible = false;
      return;
    }
    const samples = this.run.samples;
    if (timeSec < samples[0].t) {
      this.root.visible = false;
      this.glow.visible = false;
      return;
    }
    // Past the ghost's finish: park it at the line so a trailing player can still
    // see where their rival ended instead of it popping out of existence.
    if (timeSec > samples[samples.length - 1].t) {
      const last = samples[samples.length - 1];
      this.root.position.set(last.p[0], last.p[1], last.p[2]);
      this.root.quaternion.set(last.q[0], last.q[1], last.q[2], last.q[3]);
      this.lastPosition.copy(this.root.position);
      this.root.visible = true;
      this.updateGlow(viewerPosition);
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
    this.updateGlow(viewerPosition);
  }

  get position(): THREE.Vector3 | null {
    return this.root.visible ? this.lastPosition : null;
  }

  private updateGlow(viewerPosition?: THREE.Vector3): void {
    this.glow.position.copy(this.root.position);
    this.glow.visible = true;
    const distance = viewerPosition ? viewerPosition.distanceTo(this.root.position) : 0;
    const far = Math.max(0, Math.min(1, (distance - 90) / 260));
    const scale = 8 + far * 30;
    this.glow.scale.setScalar(scale);
    const material = this.glow.material as THREE.SpriteMaterial;
    material.opacity = 0.08 + far * 0.28;
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

function createGlowTexture(color: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  const gradient = ctx.createRadialGradient(64, 64, 3, 64, 64, 62);
  gradient.addColorStop(0, hex);
  gradient.addColorStop(0.22, `${hex}cc`);
  gradient.addColorStop(0.58, `${hex}45`);
  gradient.addColorStop(1, `${hex}00`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
