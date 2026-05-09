import * as THREE from 'three';
import type { Asteroid } from '../game/asteroids';
import type { Trajectory } from '../game/trajectory';

const MAX_ASTEROIDS = 140;
const MAX_POINTS = 220;
const MAP_RADIUS = 1450;

export class Minimap {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-MAP_RADIUS, MAP_RADIUS, MAP_RADIUS, -MAP_RADIUS, 1, 5000);
  private asteroidMeshes: THREE.Mesh[] = [];
  private ship: THREE.Mesh;
  private pathLine: THREE.Line;
  private pathPositions = new Float32Array(MAX_POINTS * 3);
  private pathColors = new Float32Array(MAX_POINTS * 3);
  private pathPositionAttr = new THREE.BufferAttribute(this.pathPositions, 3);
  private pathColorAttr = new THREE.BufferAttribute(this.pathColors, 3);

  constructor() {
    this.scene.background = new THREE.Color(0x080a10);
    this.camera.position.set(0, 2600, 0);
    this.camera.lookAt(0, 0, 0);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(MAP_RADIUS * 0.998, MAP_RADIUS, 96),
      new THREE.MeshBasicMaterial({ color: 0x8a6240, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);

    const asteroidGeom = new THREE.CircleGeometry(1, 24);
    for (let i = 0; i < MAX_ASTEROIDS; i++) {
      const mesh = new THREE.Mesh(
        asteroidGeom,
        new THREE.MeshBasicMaterial({ color: 0x7d7469, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.asteroidMeshes.push(mesh);
      this.scene.add(mesh);
    }

    const shipGeom = new THREE.BufferGeometry();
    shipGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0, 0, -44,
      -28, 0, 32,
      28, 0, 32,
    ]), 3));
    this.ship = new THREE.Mesh(
      shipGeom,
      new THREE.MeshBasicMaterial({ color: 0xeae0c8, side: THREE.DoubleSide }),
    );
    this.scene.add(this.ship);

    const pathGeom = new THREE.BufferGeometry();
    pathGeom.setAttribute('position', this.pathPositionAttr);
    pathGeom.setAttribute('color', this.pathColorAttr);
    pathGeom.setDrawRange(0, 0);
    this.pathLine = new THREE.Line(
      pathGeom,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }),
    );
    this.scene.add(this.pathLine);
  }

  update(
    asteroids: readonly Asteroid[],
    trajectory: Trajectory,
    shipPosition: { x: number; y: number; z: number },
    shipYaw: number,
  ): void {
    for (let i = 0; i < this.asteroidMeshes.length; i++) {
      const mesh = this.asteroidMeshes[i];
      const asteroid = asteroids[i];
      if (!asteroid) {
        mesh.visible = false;
        continue;
      }
      const x = asteroid.position.x - shipPosition.x;
      const z = asteroid.position.z - shipPosition.z;
      const inRange = Math.abs(x) < MAP_RADIUS && Math.abs(z) < MAP_RADIUS;
      mesh.visible = inRange;
      if (inRange) {
        mesh.position.set(x, 0, z);
        const s = Math.max(10, asteroid.radius);
        mesh.scale.set(s, s, 1);
      }
    }

    this.ship.rotation.y = shipYaw;

    const count = Math.min(MAX_POINTS, trajectory.points.length);
    for (let i = 0; i < count; i++) {
      const point = trajectory.points[i];
      this.pathPositions[i * 3 + 0] = point.position.x - shipPosition.x;
      this.pathPositions[i * 3 + 1] = 4;
      this.pathPositions[i * 3 + 2] = point.position.z - shipPosition.z;
      const d = point.danger;
      this.pathColors[i * 3 + 0] = d < 0.5 ? d * 2 : 1;
      this.pathColors[i * 3 + 1] = d < 0.5 ? 1 : 1 - (d - 0.5) * 1.8;
      this.pathColors[i * 3 + 2] = 0.12;
    }
    this.pathLine.geometry.setDrawRange(0, count);
    this.pathPositionAttr.needsUpdate = true;
    this.pathColorAttr.needsUpdate = true;
  }

  render(renderer: THREE.WebGLRenderer): void {
    const width = renderer.domElement.clientWidth;
    const height = renderer.domElement.clientHeight;
    const mapWidth = Math.min(280, Math.floor(width * 0.28));
    const mapHeight = Math.min(210, Math.floor(height * 0.28));
    const x = width - mapWidth - 12;
    const y = height - mapHeight - 12;

    renderer.clearDepth();
    renderer.setScissorTest(true);
    renderer.setViewport(x, y, mapWidth, mapHeight);
    renderer.setScissor(x, y, mapWidth, mapHeight);
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
  }
}
