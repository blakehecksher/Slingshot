import * as THREE from 'three';
import { AsteroidField } from './game/asteroids';
import { createBase } from './game/base';
import { ContactRegistry, type ContactKind } from './game/collision';
import { Economy, ECONOMY_TUNING } from './game/economy';
import { Energy, ENERGY_TUNING } from './game/energy';
import { SHIP_TUNING } from './game/ship';
import { GravityFeedback } from './game/feedback';
import { sampleGravityAt } from './game/gravity';
import { Input } from './game/input';
import { Lifecycle, LIFECYCLE_TUNING } from './game/lifecycle';
import { PickupSystem } from './game/pickups';
import { Ship } from './game/ship';
import { predictTrajectory, type Trajectory } from './game/trajectory';
import { initPhysics, PhysicsWorld } from './physics/world';
import { SpaceDust } from './render/dust';
import { Minimap } from './render/minimap';
import { createRenderRig } from './render/scene';
import { TrajectoryRibbon } from './render/trajectory';
import { TuningPanel } from './debug/tuningPanel';
import { GameAudio } from './audio/audio';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const controls = document.getElementById('controls') as HTMLDivElement;
const padDebug = document.getElementById('pad-debug') as HTMLDivElement;
const fadeOverlay = document.getElementById('fade-overlay') as HTMLDivElement;
const statusBar = document.getElementById('status') as HTMLDivElement;
const toast = document.getElementById('toast') as HTMLDivElement;

await initPhysics();

const audio = new GameAudio(import.meta.env.BASE_URL);
void audio.init();
const unlockAudio = (): void => {
  audio.unlock();
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);
window.addEventListener('gamepadconnected', unlockAudio);

const FIXED_DT = 1 / 120;
const MAX_STEPS_PER_FRAME = 8;

const { renderer, scene, camera } = createRenderRig(canvas);
const physics = new PhysicsWorld(FIXED_DT);
const input = new Input(canvas);
const registry = new ContactRegistry();

const ship = new Ship(physics, scene);
const dust = new SpaceDust(scene);
const asteroidField = new AsteroidField(scene, physics, registry);
const trajectoryRibbon = new TrajectoryRibbon(scene);
const minimap = new Minimap();
const feedback = new GravityFeedback();

const economy = new Economy();
const energy = new Energy();
const pickups = new PickupSystem(scene, physics, registry);

const BASE_POS = new THREE.Vector3(0, 0, 0);
createBase(scene, physics, registry, BASE_POS);

// Place the player slightly forward of the base so they aren't immediately
// "deposited" by the trigger and so the base reads as something to fly back to.
const SPAWN_POS = new THREE.Vector3(0, 0, 180);
ship.teleport(SPAWN_POS);

pickups.seedEnergyField();

const tuningPanel = new TuningPanel({
  ship,
  field: asteroidField,
  pickups,
  audio,
  spawnPos: SPAWN_POS,
  onToast: (msg, dur) => showToast(msg, dur),
});

const lifecycle = new Lifecycle(ship, SPAWN_POS, {
  onDeath: (deathPos, deathVel) => {
    // Scatter cargo at death position.
    const { chunkValueKg, count } = economy.consumeScatter();
    if (count > 0) {
      const inherit = ECONOMY_TUNING.SCATTER_DRIFT_INHERIT;
      const rand = ECONOMY_TUNING.SCATTER_RAND_VEL;
      // Push scatter offsets out perpendicular to the impact direction. The
      // ship was moving toward the asteroid, so reversing along that axis
      // and adding a wider random spread tends to keep chunks outside the
      // rock — they sit in collectable space instead of inside geometry.
      const back = deathVel.clone().normalize().multiplyScalar(-1);
      for (let i = 0; i < count; i++) {
        const offset = back.clone().multiplyScalar(35 + Math.random() * 20).add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 26,
            (Math.random() - 0.5) * 26,
            (Math.random() - 0.5) * 26,
          ),
        );
        const vel = new THREE.Vector3(
          deathVel.x * inherit + (Math.random() - 0.5) * rand,
          deathVel.y * inherit + (Math.random() - 0.5) * rand,
          deathVel.z * inherit + (Math.random() - 0.5) * rand,
        );
        pickups.spawnCargo(deathPos.clone().add(offset), vel, chunkValueKg);
      }
    }
    showToast(`SHIP LOST  cargo scattered: ${count} chunks`, 1800);
  },
  onRespawn: () => {
    energy.refill();
  },
});

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
const tmpDeathPos = new THREE.Vector3();
const tmpDeathVel = new THREE.Vector3();

let trajectory: Trajectory = predictTrajectory(ship.position, ship.linearVelocity, asteroidField.asteroids);
let gravitySample = sampleGravityAt(shipPosVec.copy(SPAWN_POS), asteroidField.asteroids);

// Track whether ship is inside base trigger so we deposit only on entry.
let inBase = false;

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
  <div class="row">LB / RB - yaw right / left</div>
  <div class="row">D-pad - strafe (up/down/left/right)</div>
  <div class="row">B - boost (drains energy)</div>
  <div class="row">Y - toggle chase / cockpit cam</div>
  <div class="row" style="height:6px"></div>
  <div class="row"><b>Keyboard + mouse</b></div>
  <div class="row">W / S - thrust forward / brake</div>
  <div class="row">A / D - roll left / right</div>
  <div class="row">Space / Ctrl - thrust up / down</div>
  <div class="row">Q / E - yaw left / right</div>
  <div class="row">Shift - boost</div>
  <div class="row">Mouse (click to capture) - yaw / pitch</div>
  <div class="row">Arrows - pitch + yaw (alt)</div>
  <div class="row">C - toggle chase / cockpit cam</div>
  <div class="row">G - toggle gamepad debug</div>
  <div class="row">P - toggle tuning panel</div>
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

let toastTimer = 0;
function showToast(text: string, durationMs: number): void {
  toast.textContent = text;
  toast.style.opacity = '1';
  toastTimer = durationMs;
}
function tickToast(dt: number): void {
  if (toastTimer <= 0) {
    toast.style.opacity = '0';
    return;
  }
  toastTimer -= dt * 1000;
  if (toastTimer < 300) {
    toast.style.opacity = String(Math.max(0, toastTimer / 300));
  }
}

function isShipCollider(handle: number): boolean {
  return handle === ship.colliderHandle;
}

function describeOther(handle1: number, handle2: number): { otherHandle: number; kind: ContactKind | undefined } | null {
  if (isShipCollider(handle1)) return { otherHandle: handle2, kind: registry.lookup(handle2) };
  if (isShipCollider(handle2)) return { otherHandle: handle1, kind: registry.lookup(handle1) };
  return null;
}

function tickPhysics(): void {
  const cmd = input.sample();
  if (cmd.toggleCameraMode) applyCameraToggle();
  updateLook(cmd, FIXED_DT);

  // Pre-step ship speed — used for collision threshold so we measure energy
  // BEFORE physics applies any contact response that might lower it.
  const preStepSpeed = ship.speed;

  const p = ship.position;
  shipPosVec.set(p.x, p.y, p.z);
  gravitySample = sampleGravityAt(shipPosVec, asteroidField.asteroids);

  if (lifecycle.isAlive()) {
    ship.applyAcceleration(gravitySample.acceleration, FIXED_DT);

    // Energy drains only while boost is held (B button / Shift).
    const boost = Math.max(0, Math.min(1, cmd.boost));
    const drainMag = boost * SHIP_TUNING.BOOST_ENERGY_MULT;
    const thrustScale = energy.tick(drainMag, FIXED_DT);
    ship.setThrustScale(thrustScale);
    ship.applyCommand(cmd, FIXED_DT);

    // Mining: sum proximity contributions.
    economy.tickMining(p, asteroidField.asteroids, FIXED_DT);
  }

  physics.step();
  asteroidField.update(FIXED_DT);
  pickups.update(FIXED_DT);
  feedback.update(gravitySample.strongestPull, FIXED_DT, input.readGamepad());

  // Drain collision events. Fires for both solid and sensor pairs.
  let deathThisTick = false;
  let baseTouchedThisTick = false;
  physics.eventQueue.drainCollisionEvents((h1, h2, started) => {
    const info = describeOther(h1, h2);
    if (!info || !info.kind) return;
    const kind = info.kind;

    if (kind.type === 'asteroid') {
      if (!started) return;
      if (!lifecycle.isAlive()) return;
      if (lifecycle.current === 'invuln') return;
      if (preStepSpeed > LIFECYCLE_TUNING.DEATH_SPEED_THRESHOLD) {
        deathThisTick = true;
      } else {
        // Graze: damp velocity so we don't keep grinding into the rock.
        const v = ship.body.linvel();
        const damp = LIFECYCLE_TUNING.GRAZE_VELOCITY_DAMP;
        ship.body.setLinvel({ x: v.x * damp, y: v.y * damp, z: v.z * damp }, true);
      }
      return;
    }

    if (kind.type === 'pickup-energy') {
      if (!started) return;
      const got = pickups.collect(kind.id);
      if (got) {
        energy.add(ENERGY_TUNING.PICKUP_AMOUNT);
        showToast(`+ENERGY`, 700);
      }
      return;
    }

    if (kind.type === 'pickup-cargo') {
      if (!started) return;
      const got = pickups.collect(kind.id);
      if (got) {
        const added = economy.addCargo(got.value);
        showToast(`+${Math.round(added)} kg cargo recovered`, 900);
      }
      return;
    }

    if (kind.type === 'base') {
      if (started) baseTouchedThisTick = true;
      else inBase = false;
      return;
    }
  });

  if (deathThisTick) {
    tmpDeathPos.set(ship.position.x, ship.position.y, ship.position.z);
    tmpDeathVel.set(ship.linearVelocity.x, ship.linearVelocity.y, ship.linearVelocity.z);
    lifecycle.die(tmpDeathPos, tmpDeathVel);
  } else if (baseTouchedThisTick && lifecycle.isAlive() && !inBase) {
    inBase = true;
    const deposited = economy.depositAll();
    energy.refill();
    if (deposited > 0) {
      showToast(`DEPOSITED ${Math.round(deposited)} kg  -  BANK ${Math.round(economy.bank)} kg`, 2200);
    } else {
      showToast(`ENERGY REFILLED`, 1100);
    }
  }

  lifecycle.update(FIXED_DT);
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

  // Drive the fade overlay from lifecycle state.
  fadeOverlay.style.opacity = String(lifecycle.fadeAlpha);

  if (padDebugVisible) renderPadDebug();
}

let accumulator = 0;
let lastTimeMs = performance.now();
let frameCount = 0;
let fpsLastMs = lastTimeMs;
let fps = 0;

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
  audio.update(gravitySample.strongestPull, gravitySample.closestClearance, frameDt);
  tickToast(frameDt);
  updateStatus();
  tuningPanel.update({
    fps,
    speed: ship.speed,
    cargo: economy.cargo,
    bank: economy.bank,
    energy: energy.fraction,
    mineRate: economy.mineRate,
    pull: gravitySample.strongestPull,
    clearance: gravitySample.closestClearance,
    state: lifecycle.current,
  });

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
      `Slingshot - Phase 2 run loop\n` +
      `fps ${fps.toFixed(0)}  dt ${(FIXED_DT * 1000).toFixed(2)}ms  cam ${cameraMode}\n` +
      `speed ${speed} m/s  pull ${pull} m/s²  clearance ${clearance}m  shake ${feedbackLevel}%\n` +
      `${asteroidField.asteroids.length} asteroids  ${padHint}${lockHint}`;
  }

  requestAnimationFrame(loop);
}

function updateStatus(): void {
  const cargo = Math.round(economy.cargo);
  const cargoCap = Math.round(economy.cargoCap);
  const bank = Math.round(economy.bank);
  const ePct = Math.round(energy.fraction * 100);
  const reserve = energy.inReserve;
  const mineRate = economy.mineRate.toFixed(1);
  const cargoBar = bar(economy.cargo / economy.cargoCap, 14);
  const energyBar = bar(energy.fraction, 14);

  const lifecycleHint =
    lifecycle.current === 'dying' ? `<span style="color:#d06424">— SHIP DESTROYED</span>` :
    lifecycle.current === 'respawning' ? `<span style="color:#d06424">— RESPAWNING</span>` :
    lifecycle.current === 'invuln' ? `<span style="color:#6dd6c8">— INVULN</span>` :
    '';

  statusBar.innerHTML = `
    <div class="line"><b>CARGO</b> ${cargoBar} ${cargo} / ${cargoCap} kg ${mineRate !== '0.0' ? `<span class="mining">+${mineRate} kg/s</span>` : ''}</div>
    <div class="line"><b>BANK</b>  ${bank} kg</div>
    <div class="line"><b>ENERGY</b> ${energyBar} ${ePct}% ${reserve ? '<span class="reserve">RESERVE</span>' : ''}</div>
    <div class="line">${lifecycleHint}</div>
  `;
}

function bar(frac: number, width: number): string {
  const f = Math.max(0, Math.min(1, frac));
  const filled = Math.round(f * width);
  const empty = width - filled;
  return `<span class="bar"><span class="bar-filled">${'█'.repeat(filled)}</span>${'░'.repeat(empty)}</span>`;
}

showToast(`LAUNCH FROM BASE  -  mine asteroids, return to deposit`, 3200);
requestAnimationFrame(loop);
