import * as THREE from 'three';
import { Input } from './game/input';
import { AsteroidField } from './game/asteroids';
import { GravityFeedback } from './game/feedback';
import { sampleGravityAt } from './game/gravity';
import { Ship } from './game/ship';
import { predictTrajectory, type Trajectory } from './game/trajectory';
import { initPhysics, PhysicsWorld } from './physics/world';
import { SpaceDust } from './render/dust';
import { Minimap } from './render/minimap';
import { createRenderRig } from './render/scene';
import { TrajectoryRibbon } from './render/trajectory';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const controls = document.getElementById('controls') as HTMLDivElement;
const padDebug = document.getElementById('pad-debug') as HTMLDivElement;

await initPhysics();

const FIXED_DT = 1 / 120;
const MAX_STEPS_PER_FRAME = 8;

const { renderer, scene, camera } = createRenderRig(canvas);
const physics = new PhysicsWorld(FIXED_DT);
const input = new Input(canvas);
const ship = new Ship(physics, scene);
const dust = new SpaceDust(scene);
const asteroidField = new AsteroidField(scene);
const trajectoryRibbon = new TrajectoryRibbon(scene);
const minimap = new Minimap();
const feedback = new GravityFeedback();

let trajectory: Trajectory = predictTrajectory(ship.position, ship.linearVelocity, asteroidField.asteroids);
let gravitySample = sampleGravityAt(new THREE.Vector3(ship.position.x, ship.position.y, ship.position.z), asteroidField.asteroids);

type CameraMode = 'chase' | 'cockpit';
let cameraMode: CameraMode = 'chase';

const CHASE_DISTANCE = 9;
const CHASE_HEIGHT = 2.5;
const LOOK_RATE = 1.6;
const LOOK_RECENTER = 4.0;
const LOOK_PITCH_LIMIT = Math.PI / 2 - 0.05;

let lookYaw = 0;
let lookPitch = 0;

const shipQuat = new THREE.Quaternion();
const lookQuat = new THREE.Quaternion();
const camOffset = new THREE.Vector3();
const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const shipEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const shipPosVec = new THREE.Vector3();

function applyCameraToggle(): void {
  cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
  ship.mesh.visible = cameraMode === 'chase';
}

ship.mesh.visible = true;

function updateLook(cmd: { look: { yaw: number; pitch: number } }, dt: number): void {
  if (cmd.look.yaw !== 0 || cmd.look.pitch !== 0) {
    lookYaw += cmd.look.yaw * LOOK_RATE * dt;
    lookPitch += cmd.look.pitch * LOOK_RATE * dt;
  } else {
    const k = Math.exp(-LOOK_RECENTER * dt);
    lookYaw *= k;
    lookPitch *= k;
  }

  if (lookPitch > LOOK_PITCH_LIMIT) lookPitch = LOOK_PITCH_LIMIT;
  if (lookPitch < -LOOK_PITCH_LIMIT) lookPitch = -LOOK_PITCH_LIMIT;
}

function syncCamera(): void {
  const t = ship.body.translation();
  const r = ship.body.rotation();
  shipQuat.set(r.x, r.y, r.z, r.w);

  lookEuler.set(lookPitch, lookYaw, 0, 'YXZ');
  lookQuat.setFromEuler(lookEuler);

  if (cameraMode === 'cockpit') {
    camera.position.set(t.x, t.y, t.z);
    camera.quaternion.copy(shipQuat).multiply(lookQuat);
    return;
  }

  camOffset.set(0, CHASE_HEIGHT, CHASE_DISTANCE);
  camOffset.applyQuaternion(lookQuat);
  camOffset.applyQuaternion(shipQuat);
  camera.position.set(t.x + camOffset.x, t.y + camOffset.y, t.z + camOffset.z);
  camera.quaternion.copy(shipQuat).multiply(lookQuat);
}

controls.innerHTML = `
  <h3>Controls</h3>
  <div class="row"><b>Xbox controller</b></div>
  <div class="row">L stick - roll / pitch</div>
  <div class="row">R stick - look around</div>
  <div class="row">RT - thrust forward</div>
  <div class="row">LT - brake / reverse</div>
  <div class="row">Y - toggle chase / cockpit cam</div>
  <div class="row" style="height:6px"></div>
  <div class="row"><b>Keyboard + mouse</b></div>
  <div class="row">W / S - thrust forward / brake</div>
  <div class="row">A / D - roll left / right</div>
  <div class="row">Space / Ctrl - thrust up / down</div>
  <div class="row">Q / E - yaw left / right</div>
  <div class="row">Mouse (click to capture) - yaw / pitch</div>
  <div class="row">Arrows - pitch + yaw (alt)</div>
  <div class="row">C - toggle chase / cockpit cam</div>
  <div class="row">G - toggle gamepad debug</div>
  <div class="row">H - hide / show this panel</div>
`;

let controlsVisible = true;
let padDebugVisible = true;
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyH' && !e.repeat) {
    controlsVisible = !controlsVisible;
    controls.style.display = controlsVisible ? 'block' : 'none';
  }
  if (e.code === 'KeyG' && !e.repeat) {
    padDebugVisible = !padDebugVisible;
    padDebug.style.display = padDebugVisible ? 'block' : 'none';
  }
});

function fmt(n: number): string {
  const s = n.toFixed(2);
  return n >= 0 ? ` ${s}` : s;
}

function renderPadDebug(): void {
  const pads = navigator.getGamepads?.() ?? [];
  let any = false;
  const lines: string[] = [];
  lines.push(`<b>Gamepad debug</b>  <span style="opacity:0.6">(G to toggle)</span>`);

  for (const p of pads) {
    if (!p) continue;
    any = true;
    lines.push(
      `<div style="margin-top:4px"><b>#${p.index}</b> ${p.id}</div>` +
      `<div>mapping: ${p.mapping || '(non-standard)'}  connected: ${p.connected}</div>`,
    );

    const axes = p.axes.map((v, i) => `a${i}:${fmt(v)}`).join('  ');
    lines.push(`<div>${axes}</div>`);

    const btns = p.buttons.map((b, i) => {
      const style = b.pressed ? 'color:#eae0c8;font-weight:bold' : 'opacity:0.35';
      return `<span style="${style}">b${i}:${b.value.toFixed(2)}</span>`;
    }).join(' ');
    lines.push(`<div style="margin-top:2px">${btns}</div>`);
  }

  if (!any) {
    lines.push(
      `<div style="margin-top:4px;color:#c97a3a">No gamepad detected.</div>` +
      `<div style="opacity:0.85">Plug it in, then press a button or move a stick. Chrome only exposes a pad after first input.</div>` +
      `<div style="opacity:0.85">Click the canvas to focus the page first.</div>`,
    );
  }

  padDebug.innerHTML = lines.join('');
}

let accumulator = 0;
let lastTimeMs = performance.now();
let frameCount = 0;
let fpsLastMs = lastTimeMs;
let fps = 0;

function tickPhysics(): void {
  const cmd = input.sample();
  if (cmd.toggleCameraMode) applyCameraToggle();
  updateLook(cmd, FIXED_DT);

  const p = ship.position;
  shipPosVec.set(p.x, p.y, p.z);
  gravitySample = sampleGravityAt(shipPosVec, asteroidField.asteroids);
  ship.applyAcceleration(gravitySample.acceleration, FIXED_DT);
  ship.applyCommand(cmd, FIXED_DT);

  physics.step();
  asteroidField.update(FIXED_DT);
  feedback.update(gravitySample.strongestPull, FIXED_DT, input.readGamepad());
}

function render(): void {
  ship.syncMeshFromBody();
  dust.update(ship.position);
  trajectory = predictTrajectory(ship.position, ship.linearVelocity, asteroidField.asteroids);
  trajectoryRibbon.update(trajectory);
  syncCamera();
  feedback.apply(camera);
  renderer.render(scene, camera);

  const r = ship.body.rotation();
  shipQuat.set(r.x, r.y, r.z, r.w);
  shipEuler.setFromQuaternion(shipQuat, 'YXZ');
  minimap.update(asteroidField.asteroids, trajectory, ship.position, shipEuler.y);
  minimap.render(renderer);

  if (padDebugVisible) renderPadDebug();
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
    const pull = gravitySample.strongestPull.toFixed(2);
    const clearance = gravitySample.closestClearance.toFixed(0);
    const feedbackLevel = Math.round(feedback.level * 100);
    const padHint = input.readGamepad() ? 'gamepad yes' : 'gamepad -';
    const lockHint = input.isPointerLocked() ? '' : '  (click to capture mouse)';

    hud.textContent =
      `Slingshot - Phase 1 gravity field\n` +
      `fps ${fps.toFixed(0)}  dt ${(FIXED_DT * 1000).toFixed(2)}ms  cam ${cameraMode}\n` +
      `speed ${speed} m/s  pull ${pull} m/s^2  clearance ${clearance}m  shake ${feedbackLevel}%\n` +
      `${asteroidField.asteroids.length} asteroids  ${padHint}${lockHint}`;
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
