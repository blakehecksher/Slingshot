import * as THREE from 'three';

export interface Asteroid {
  readonly mesh: THREE.Mesh;
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly radius: number;
  readonly mass: number;
  readonly rotationAxis: THREE.Vector3;
  readonly rotationRate: number;
}

const ASTEROID_MATERIALS = [
  new THREE.MeshStandardMaterial({ color: 0x5c5248, roughness: 0.95, metalness: 0.04 }),
  new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 0.92, metalness: 0.03 }),
  new THREE.MeshStandardMaterial({ color: 0x4a4b50, roughness: 0.96, metalness: 0.02 }),
];

function seededNoise(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function buildAsteroidGeometry(radius: number, seed: number): THREE.BufferGeometry {
  const geom = new THREE.IcosahedronGeometry(radius, 3);
  const pos = geom.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const normal = v.clone().normalize();
    const n1 = seededNoise(seed + normal.x * 17.1 + normal.y * 31.7 + normal.z * 43.3);
    const n2 = seededNoise(seed * 3.7 + normal.x * 71.9 - normal.y * 19.1 + normal.z * 11.8);
    const bulge = 0.72 + n1 * 0.42 + n2 * 0.14;
    v.copy(normal).multiplyScalar(radius * bulge);
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}

function massForRadius(radius: number): number {
  // Game mass, not real mass. Radius squared keeps big rocks dominant without
  // making close passes around them numerically explosive.
  return radius * radius * 900;
}

function makeAsteroid(
  scene: THREE.Scene,
  radius: number,
  position: THREE.Vector3,
  seed: number,
  velocity = new THREE.Vector3(),
): Asteroid {
  const mat = ASTEROID_MATERIALS[Math.floor(seed) % ASTEROID_MATERIALS.length];
  const mesh = new THREE.Mesh(buildAsteroidGeometry(radius, seed), mat);
  mesh.position.copy(position);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  scene.add(mesh);

  return {
    mesh,
    position: position.clone(),
    velocity: velocity.clone(),
    radius,
    mass: massForRadius(radius),
    rotationAxis: new THREE.Vector3(
      seededNoise(seed + 1) * 2 - 1,
      seededNoise(seed + 2) * 2 - 1,
      seededNoise(seed + 3) * 2 - 1,
    ).normalize(),
    rotationRate: 0.015 + seededNoise(seed + 4) * 0.045,
  };
}

export class AsteroidField {
  readonly asteroids: Asteroid[] = [];

  constructor(scene: THREE.Scene) {
    this.addHandPlaced(scene);
    this.addProcedural(scene);
  }

  update(dt: number): void {
    for (const a of this.asteroids) {
      a.position.addScaledVector(a.velocity, dt);
      a.mesh.position.copy(a.position);
      a.mesh.rotateOnAxis(a.rotationAxis, a.rotationRate * dt);
    }
  }

  private addHandPlaced(scene: THREE.Scene): void {
    const placements: Array<[number, number, number, number]> = [
      [105, -240, 30, -620],
      [70, 280, -65, -980],
      [145, -90, 140, -1380],
      [48, 160, 110, -420],
      [92, -460, -120, -1140],
    ];

    placements.forEach(([radius, x, y, z], index) => {
      this.asteroids.push(makeAsteroid(scene, radius, new THREE.Vector3(x, y, z), 100 + index));
    });
  }

  private addProcedural(scene: THREE.Scene): void {
    const count = 95;
    for (let i = 0; i < count; i++) {
      const seed = 200 + i * 13.37;
      const sizeRoll = seededNoise(seed);
      const radius = 8 + Math.pow(sizeRoll, 2.4) * 95;
      const angle = seededNoise(seed + 1) * Math.PI * 2;
      const band = 260 + seededNoise(seed + 2) * 2350;
      const x = Math.cos(angle) * band + (seededNoise(seed + 3) * 2 - 1) * 220;
      const z = -350 - seededNoise(seed + 4) * 3200;
      const y = (seededNoise(seed + 5) * 2 - 1) * 520;
      const driftScale = 0.15 + seededNoise(seed + 6) * 0.75;
      const velocity = new THREE.Vector3(
        seededNoise(seed + 7) * 2 - 1,
        seededNoise(seed + 8) * 2 - 1,
        seededNoise(seed + 9) * 2 - 1,
      ).multiplyScalar(driftScale);

      this.asteroids.push(makeAsteroid(scene, radius, new THREE.Vector3(x, y, z), seed, velocity));
    }
  }
}
