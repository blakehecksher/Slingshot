import * as THREE from 'three';
import type { AsteroidField } from '../game/asteroids';
import { sampleGravityAt } from '../game/gravity';

// Visual debug overlays for tuning. Everything here is opt-in and disposed when
// off, so it never costs anything in a normal run. The point is to make the
// numbers in the tuning panel visible in the world.

export interface DebugVizDeps {
  scene: THREE.Scene;
  field: AsteroidField;
  getShipPosition: () => { x: number; y: number; z: number };
}

const HITBOX_COLOR = 0x37e0a0; // teal: the true collider radius
const GRADIENT_NEAR = new THREE.Color(0x1c2a3a); // weak pull
const GRADIENT_FAR = new THREE.Color(0xff5a3c); // strong pull

export class DebugViz {
  private scene: THREE.Scene;
  private field: AsteroidField;
  private getShipPosition: () => { x: number; y: number; z: number };

  private hitboxGroup: THREE.Group | null = null;
  private gradientPoints: THREE.Points | null = null;
  private wireframeOn = false;
  private hitboxesOn = false;
  private gradientOn = false;

  // Reusable buffers for the gravity gradient grid.
  private gradGeom: THREE.BufferGeometry | null = null;
  private readonly gridSpan = 600; // metres sampled around the ship
  private readonly gridStep = 75; // sample spacing
  private sampleScratch = new THREE.Vector3();

  constructor(deps: DebugVizDeps) {
    this.scene = deps.scene;
    this.field = deps.field;
    this.getShipPosition = deps.getShipPosition;
  }

  // --- Hitboxes: wireframe sphere at each asteroid's real collider radius. ---
  setHitboxes(on: boolean): void {
    this.hitboxesOn = on;
    if (on) this.rebuildHitboxes();
    else this.disposeHitboxes();
  }

  get hitboxesEnabled(): boolean {
    return this.hitboxesOn;
  }

  /** Call after the asteroid field regenerates so spheres track the new rocks. */
  refreshHitboxes(): void {
    if (this.hitboxesOn) this.rebuildHitboxes();
  }

  private rebuildHitboxes(): void {
    this.disposeHitboxes();
    const group = new THREE.Group();
    const geom = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: HITBOX_COLOR, wireframe: true, transparent: true, opacity: 0.55 });
    for (const a of this.field.asteroids) {
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.copy(a.position);
      mesh.scale.setScalar(a.hitRadius);
      group.add(mesh);
    }
    group.renderOrder = 999;
    this.scene.add(group);
    this.hitboxGroup = group;
  }

  private disposeHitboxes(): void {
    if (!this.hitboxGroup) return;
    const group = this.hitboxGroup;
    let geomDisposed = false;
    let matDisposed = false;
    group.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.geometry && !geomDisposed) {
        m.geometry.dispose();
        geomDisposed = true;
      }
      const mat = m.material as THREE.Material | undefined;
      if (mat && !matDisposed) {
        mat.dispose();
        matDisposed = true;
      }
    });
    this.scene.remove(group);
    this.hitboxGroup = null;
  }

  // --- Wireframe mode: flip every standard material in the scene to wireframe. ---
  setWireframe(on: boolean): void {
    this.wireframeOn = on;
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const mat = mesh.material;
      if (!mat) return;
      const mats = Array.isArray(mat) ? mat : [mat];
      for (const m of mats) {
        if ('wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = on;
      }
    });
  }

  get wireframeEnabled(): boolean {
    return this.wireframeOn;
  }

  // --- Gravity gradient: sparse point grid near the ship, colored by pull. ---
  setGradient(on: boolean): void {
    this.gradientOn = on;
    if (on) this.ensureGradient();
    else this.disposeGradient();
  }

  get gradientEnabled(): boolean {
    return this.gradientOn;
  }

  private ensureGradient(): void {
    if (this.gradientPoints) return;
    const perAxis = Math.floor(this.gridSpan / this.gridStep) + 1;
    const count = perAxis * perAxis * perAxis;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 6, vertexColors: true, transparent: true, opacity: 0.7, sizeAttenuation: true });
    const points = new THREE.Points(geom, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    this.gradientPoints = points;
    this.gradGeom = geom;
  }

  private disposeGradient(): void {
    if (!this.gradientPoints) return;
    this.gradientPoints.geometry.dispose();
    (this.gradientPoints.material as THREE.Material).dispose();
    this.scene.remove(this.gradientPoints);
    this.gradientPoints = null;
    this.gradGeom = null;
  }

  /** Re-sample the gravity grid around the ship. Call once per frame while on. */
  update(): void {
    if (!this.gradientOn || !this.gradGeom) return;
    const origin = this.getShipPosition();
    const posAttr = this.gradGeom.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = this.gradGeom.getAttribute('color') as THREE.BufferAttribute;
    const half = this.gridSpan / 2;
    const perAxis = Math.floor(this.gridSpan / this.gridStep) + 1;
    const color = new THREE.Color();
    let i = 0;
    for (let xi = 0; xi < perAxis; xi++) {
      for (let yi = 0; yi < perAxis; yi++) {
        for (let zi = 0; zi < perAxis; zi++) {
          const px = origin.x - half + xi * this.gridStep;
          const py = origin.y - half + yi * this.gridStep;
          const pz = origin.z - half + zi * this.gridStep;
          this.sampleScratch.set(px, py, pz);
          const sample = sampleGravityAt(this.sampleScratch, this.field.asteroids);
          // Log-scale pull so the gradient reads across a wide dynamic range.
          const t = Math.min(1, Math.log10(1 + sample.strongestPull) / Math.log10(1 + 60));
          color.copy(GRADIENT_NEAR).lerp(GRADIENT_FAR, t);
          posAttr.setXYZ(i, px, py, pz);
          colAttr.setXYZ(i, color.r, color.g, color.b);
          i++;
        }
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  dispose(): void {
    this.disposeHitboxes();
    this.disposeGradient();
    if (this.wireframeOn) this.setWireframe(false);
  }
}
