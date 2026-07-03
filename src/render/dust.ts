import * as THREE from 'three';

// Space dust. A toroidally-wrapped cloud of points around the ship that
// gives the player a felt reference for translational motion. Without this
// the starfield is at infinity and translation looks identical to standing
// still — the central feel bug Elite/No Man's Sky/Star Citizen all solve
// with this same trick.

export class SpaceDust {
  private points: THREE.Points;
  private positions: Float32Array;
  private posAttr: THREE.BufferAttribute;
  private count: number;
  private halfExtent: number;

  constructor(scene: THREE.Scene, count = 3000, halfExtent = 80) {
    this.count = count;
    this.halfExtent = halfExtent;
    this.positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.positions[i * 3 + 0] = (Math.random() * 2 - 1) * halfExtent;
      this.positions[i * 3 + 1] = (Math.random() * 2 - 1) * halfExtent;
      this.positions[i * 3 + 2] = (Math.random() * 2 - 1) * halfExtent;
    }
    const geom = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    geom.setAttribute('position', this.posAttr);
    const mat = new THREE.PointsMaterial({
      color: 0xfff0d8,
      size: 0.05,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    this.points = new THREE.Points(geom, mat);
    // Frustum culling assumes the geometry's bounding sphere is meaningful.
    // Our positions are recycled around the ship every frame; the points
    // effectively follow the camera, so culling them by the original sphere
    // (centered on origin) is wrong.
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  // Wrap any particle that has fallen more than halfExtent away from the
  // ship along an axis. The wrap recycles it to the opposite side, so the
  // cloud is always centered on the ship without us having to translate
  // every position each frame.
  update(shipPos: { x: number; y: number; z: number }): void {
    const h = this.halfExtent;
    const span = h * 2;
    const sx = shipPos.x;
    const sy = shipPos.y;
    const sz = shipPos.z;
    const p = this.positions;
    for (let i = 0; i < this.count; i++) {
      const idx = i * 3;
      const dx = p[idx + 0] - sx;
      const dy = p[idx + 1] - sy;
      const dz = p[idx + 2] - sz;
      if (dx >  h) p[idx + 0] -= span;
      else if (dx < -h) p[idx + 0] += span;
      if (dy >  h) p[idx + 1] -= span;
      else if (dy < -h) p[idx + 1] += span;
      if (dz >  h) p[idx + 2] -= span;
      else if (dz < -h) p[idx + 2] += span;
    }
    this.posAttr.needsUpdate = true;
  }
}
