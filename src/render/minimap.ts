import * as THREE from 'three';
import type { Asteroid } from '../game/asteroids';
import type { Trajectory } from '../game/trajectory';

const MAX_ASTEROIDS = 160;
const MAX_POINTS = 220;
const MAP_RANGE = 3200;
const HOLO_RADIUS = 420;

export interface MinimapGhostMarkers {
  readonly top?: THREE.Vector3 | null;
  readonly personal?: THREE.Vector3 | null;
}

export class Minimap {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, 1, 5000);
  private root = new THREE.Group();
  private asteroidMeshes: THREE.Mesh[] = [];
  private ship: THREE.Mesh;
  private shipNeedle: THREE.Line;
  private pathLine: THREE.Line;
  private checkpointMarker: THREE.Mesh;
  private finishMarker: THREE.Mesh;
  private topGhostMarker: THREE.Mesh;
  private personalGhostMarker: THREE.Mesh;
  private pathPositions = new Float32Array(MAX_POINTS * 3);
  private pathColors = new Float32Array(MAX_POINTS * 3);
  private pathPositionAttr = new THREE.BufferAttribute(this.pathPositions, 3);
  private pathColorAttr = new THREE.BufferAttribute(this.pathColors, 3);

  constructor() {
    this.scene.background = new THREE.Color(0x050708);
    this.scene.add(this.root);
    this.camera.position.set(560, 520, 820);
    this.camera.lookAt(0, 0, 0);

    const globe = new THREE.Group();
    globe.add(this.gridCircle('xy', HOLO_RADIUS, 0x2a8c80, 0.32));
    globe.add(this.gridCircle('xz', HOLO_RADIUS, 0x2a8c80, 0.22));
    globe.add(this.gridCircle('yz', HOLO_RADIUS, 0x2a8c80, 0.22));
    for (const y of [-0.65, -0.33, 0.33, 0.65]) {
      const lat = this.gridCircle('xz', HOLO_RADIUS * Math.sqrt(1 - y * y), 0x2a8c80, 0.13);
      lat.position.y = HOLO_RADIUS * y;
      globe.add(lat);
    }
    for (let i = 0; i < 8; i++) {
      const lon = this.gridCircle('yz', HOLO_RADIUS, 0x2a8c80, 0.13);
      lon.rotation.y = (Math.PI / 8) * i;
      globe.add(lon);
    }
    this.root.add(globe);

    const asteroidGeom = new THREE.SphereGeometry(1, 10, 8);
    for (let i = 0; i < MAX_ASTEROIDS; i++) {
      const mesh = new THREE.Mesh(
        asteroidGeom,
        new THREE.MeshBasicMaterial({ color: 0xc27d37, transparent: true, opacity: 0.58 }),
      );
      mesh.visible = false;
      this.asteroidMeshes.push(mesh);
      this.root.add(mesh);
    }

    this.ship = new THREE.Mesh(
      new THREE.ConeGeometry(16, 46, 3),
      new THREE.MeshBasicMaterial({ color: 0xede3cc, transparent: true, opacity: 0.96 }),
    );
    this.ship.rotation.x = Math.PI / 2;
    this.root.add(this.ship);

    const needleGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -70),
    ]);
    this.shipNeedle = new THREE.Line(
      needleGeom,
      new THREE.LineBasicMaterial({ color: 0xede3cc, transparent: true, opacity: 0.62 }),
    );
    this.root.add(this.shipNeedle);

    const pathGeom = new THREE.BufferGeometry();
    pathGeom.setAttribute('position', this.pathPositionAttr);
    pathGeom.setAttribute('color', this.pathColorAttr);
    pathGeom.setDrawRange(0, 0);
    this.pathLine = new THREE.Line(
      pathGeom,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92 }),
    );
    this.root.add(this.pathLine);

    this.checkpointMarker = this.marker(0x5dff9a, 20, 0.92);
    this.finishMarker = this.marker(0xd4921f, 22, 0.88);
    this.topGhostMarker = this.marker(0x6dd6ff, 16, 0.78);
    this.personalGhostMarker = this.marker(0xff9b32, 16, 0.78);
  }

  update(
    asteroids: readonly Asteroid[],
    trajectory: Trajectory,
    shipPosition: { x: number; y: number; z: number },
    shipYaw: number,
    markers?: {
      nextCheckpoint?: THREE.Vector3 | null;
      finish?: THREE.Vector3 | null;
      ghosts?: MinimapGhostMarkers;
    },
  ): void {
    let visibleAsteroids = 0;
    for (const asteroid of asteroids) {
      if (visibleAsteroids >= this.asteroidMeshes.length) break;
      const projected = this.projectRelative(asteroid.position, shipPosition);
      if (!projected.visible) continue;
      const mesh = this.asteroidMeshes[visibleAsteroids];
      mesh.visible = true;
      mesh.position.copy(projected.position);
      const s = Math.max(3.5, Math.min(28, asteroid.radius * 0.18));
      mesh.scale.setScalar(s);
      visibleAsteroids++;
    }
    for (let i = visibleAsteroids; i < this.asteroidMeshes.length; i++) {
      this.asteroidMeshes[i].visible = false;
    }

    this.ship.rotation.z = shipYaw;
    this.shipNeedle.rotation.y = shipYaw;
    this.updateMarker(this.checkpointMarker, markers?.nextCheckpoint ?? null, shipPosition);
    this.updateMarker(this.finishMarker, markers?.finish ?? null, shipPosition);
    this.updateMarker(this.topGhostMarker, markers?.ghosts?.top ?? null, shipPosition);
    this.updateMarker(this.personalGhostMarker, markers?.ghosts?.personal ?? null, shipPosition);

    const count = Math.min(MAX_POINTS, trajectory.points.length);
    for (let i = 0; i < count; i++) {
      const point = trajectory.points[i];
      const projected = this.projectRelative(point.position, shipPosition, true);
      this.pathPositions[i * 3 + 0] = projected.position.x;
      this.pathPositions[i * 3 + 1] = projected.position.y;
      this.pathPositions[i * 3 + 2] = projected.position.z;
      const d = point.danger;
      this.pathColors[i * 3 + 0] = d < 0.5 ? d * 2 : 1;
      this.pathColors[i * 3 + 1] = d < 0.5 ? 1 : Math.max(0.05, 1 - (d - 0.5) * 1.8);
      this.pathColors[i * 3 + 2] = 0.16;
    }
    this.pathLine.geometry.setDrawRange(0, count);
    this.pathPositionAttr.needsUpdate = true;
    this.pathColorAttr.needsUpdate = true;
  }

  render(renderer: THREE.WebGLRenderer, scale = 1): void {
    const width = renderer.domElement.clientWidth;
    const height = renderer.domElement.clientHeight;
    const size = Math.max(160, Math.min(320, Math.floor(Math.min(width, height) * 0.32 * scale)));
    const x = width - size - 16;
    const y = height - size - 16;

    this.root.rotation.y += 0.0025;
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();

    renderer.clearDepth();
    renderer.setScissorTest(true);
    renderer.setViewport(x, y, size, size);
    renderer.setScissor(x, y, size, size);
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
  }

  private gridCircle(plane: 'xy' | 'xz' | 'yz', radius: number, color: number, opacity: number): THREE.LineLoop {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      if (plane === 'xy') points.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
      else if (plane === 'xz') points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
      else points.push(new THREE.Vector3(0, Math.cos(a) * radius, Math.sin(a) * radius));
    }
    return new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    );
  }

  private marker(color: number, radius: number, opacity: number): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(radius, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, wireframe: true }),
    );
    mesh.visible = false;
    this.root.add(mesh);
    return mesh;
  }

  private updateMarker(mesh: THREE.Mesh, world: THREE.Vector3 | null, shipPosition: { x: number; y: number; z: number }): void {
    if (!world) {
      mesh.visible = false;
      return;
    }
    // Clamp distant markers to the globe edge so the next-gate bearing stays on
    // screen instead of vanishing the moment the target is beyond map range.
    const projected = this.projectRelative(world, shipPosition, true);
    mesh.visible = projected.visible;
    if (projected.visible) mesh.position.copy(projected.position);
  }

  private projectRelative(
    world: { x: number; y: number; z: number },
    shipPosition: { x: number; y: number; z: number },
    clampToGlobe = false,
  ): { visible: boolean; position: THREE.Vector3 } {
    const x = world.x - shipPosition.x;
    const y = world.y - shipPosition.y;
    const z = world.z - shipPosition.z;
    const distance = Math.hypot(x, y, z);
    const visible = distance <= MAP_RANGE || clampToGlobe;
    const scale = HOLO_RADIUS / MAP_RANGE;
    const position = new THREE.Vector3(x * scale, y * scale, z * scale);
    if (clampToGlobe && position.length() > HOLO_RADIUS) position.setLength(HOLO_RADIUS);
    return { visible, position };
  }
}
