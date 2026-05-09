import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// ---------- Renderer ----------

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  20000,
);
camera.position.set(0, 0, 0);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ---------- Starfield ----------
// Procedural points cloud on a large sphere shell. Pure visual reference.

function buildStarfield(count: number, radius: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Uniform points on sphere via Marsaglia method.
    let x1 = 0, x2 = 0, s = 2;
    while (s >= 1) {
      x1 = Math.random() * 2 - 1;
      x2 = Math.random() * 2 - 1;
      s = x1 * x1 + x2 * x2;
    }
    const factor = 2 * Math.sqrt(1 - s);
    const x = x1 * factor;
    const y = x2 * factor;
    const z = 1 - 2 * s;
    positions[i * 3 + 0] = x * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = z * radius;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xeae0c8,
    size: 1.5,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.9,
  });
  return new THREE.Points(geom, mat);
}

scene.add(buildStarfield(2000, 9000));

// ---------- Placeholder ship ----------
// Will be replaced in M1 by a Rapier rigid body with a cockpit-mounted camera.
// For M0 it's a static cube to validate render + loop.

const ship = new THREE.Mesh(
  new THREE.BoxGeometry(2, 1, 3),
  new THREE.MeshStandardMaterial({
    color: 0xb87333,
    roughness: 0.6,
    metalness: 0.3,
  }),
);
ship.position.set(0, 0, -10);
scene.add(ship);

const sun = new THREE.DirectionalLight(0xffe6b3, 1.4);
sun.position.set(50, 30, 20);
scene.add(sun);
scene.add(new THREE.AmbientLight(0x223344, 0.4));

// ---------- Physics (Rapier init only; no bodies in M0) ----------

await RAPIER.init();
const physicsWorld = new RAPIER.World({ x: 0, y: 0, z: 0 });
const eventQueue = new RAPIER.EventQueue(true);
// physicsWorld and eventQueue are placeholders for M1+. Touched here so they
// don't trigger noUnusedLocals; remove the void cast when bodies are added.
void physicsWorld;
void eventQueue;

// ---------- Fixed-timestep loop ----------
// Physics at fixed dt. Render interpolates between previous and current state.

const FIXED_DT = 1 / 120;
const MAX_STEPS_PER_FRAME = 8;

let accumulator = 0;
let lastTimeMs = performance.now();

// Frame counter for HUD.
const hud = document.getElementById('hud')!;
let frameCount = 0;
let fpsLastMs = lastTimeMs;
let fps = 0;

function tickPhysics(_dt: number): void {
  // M1: zero forces → apply gravity → apply thrust → step world → read state.
  // For M0 the world is empty, but the call site is in place.
  // physicsWorld.step(eventQueue);
}

function render(_alpha: number): void {
  // M0: gentle visual rotation on the placeholder so we can confirm the loop is
  // alive at a glance. This goes away in M1 when the ship becomes a rigid body.
  ship.rotation.y += 0.005;
  renderer.render(scene, camera);
}

function loop(nowMs: number): void {
  const frameDt = Math.min((nowMs - lastTimeMs) / 1000, 0.25);
  lastTimeMs = nowMs;
  accumulator += frameDt;

  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
    tickPhysics(FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;

  const alpha = accumulator / FIXED_DT;
  render(alpha);

  frameCount++;
  if (nowMs - fpsLastMs >= 500) {
    fps = (frameCount * 1000) / (nowMs - fpsLastMs);
    frameCount = 0;
    fpsLastMs = nowMs;
    hud.textContent = `Slingshot — M0 bootstrap\nfps ${fps.toFixed(0)}  dt ${(FIXED_DT * 1000).toFixed(2)}ms`;
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
