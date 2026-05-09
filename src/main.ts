import * as THREE from 'three';
import { createRenderRig } from './render/scene';
import { initPhysics, PhysicsWorld } from './physics/world';
import { Input } from './game/input';
import { Ship } from './game/ship';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;

await initPhysics();

const { renderer, scene, camera } = createRenderRig(canvas);
const physics = new PhysicsWorld();
const input = new Input(canvas);
const ship = new Ship(physics, scene);

// Hide ship visual when sitting at the cockpit so we aren't looking at the
// inside of the cube. The mesh still exists and renders for HUD/minimap views
// later, but the cockpit camera sees through it.
(ship.mesh as THREE.Mesh).visible = false;

// ---------- Fixed-timestep loop ----------

const FIXED_DT = 1 / 120;
const MAX_STEPS_PER_FRAME = 8;
let accumulator = 0;
let lastTimeMs = performance.now();
let frameCount = 0;
let fpsLastMs = lastTimeMs;
let fps = 0;

function tickPhysics(): void {
  const cmd = input.sample();
  ship.applyCommand(cmd, FIXED_DT);
  physics.step();
}

// Cockpit camera mount. The camera sits at the body origin and inherits the
// ship's orientation. (For a true cockpit feel later, offset slightly forward
// and add a windshield frame; for M1 the body-origin POV is fine.)
function syncCameraToShip(): void {
  const t = ship.body.translation();
  const r = ship.body.rotation();
  camera.position.set(t.x, t.y, t.z);
  camera.quaternion.set(r.x, r.y, r.z, r.w);
}

function render(): void {
  ship.syncMeshFromBody();
  syncCameraToShip();
  renderer.render(scene, camera);
}

function loop(nowMs: number): void {
  const frameDt = Math.min((nowMs - lastTimeMs) / 1000, 0.25);
  lastTimeMs = nowMs;
  accumulator += frameDt;

  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
    tickPhysics();
    accumulator -= FIXED_DT;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;

  render();

  frameCount++;
  if (nowMs - fpsLastMs >= 500) {
    fps = (frameCount * 1000) / (nowMs - fpsLastMs);
    frameCount = 0;
    fpsLastMs = nowMs;
    const speed = ship.speed.toFixed(1);
    const lockHint = input.isPointerLocked() ? '' : '  (click to capture mouse)';
    const padHint = input.readGamepad() ? 'gamepad ✓' : 'gamepad —';
    hud.textContent =
      `Slingshot — M1 free flight\n` +
      `fps ${fps.toFixed(0)}  dt ${(FIXED_DT * 1000).toFixed(2)}ms\n` +
      `speed ${speed} m/s  ${padHint}${lockHint}`;
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
