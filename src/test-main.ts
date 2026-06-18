// Flight Test Lab — a stripped sandbox for dialing in flight + sling feel.
// No course flow, no menus, no countdown. Spawn, fly, crash, instant respawn.
// Shares the exact ship / gravity / asteroid / tuning systems as the real game,
// and the same saved tuning defaults, so feel here transfers 1:1.
import * as THREE from 'three';
import { ASTEROID_TUNING, AsteroidField } from './game/asteroids';
import { ContactRegistry } from './game/collision';
import { Energy } from './game/energy';
import { GravityFeedback } from './game/feedback';
import { GRAVITY_TUNING, sampleGravityAt } from './game/gravity';
import { Input } from './game/input';
import { LIFECYCLE_TUNING } from './game/lifecycle';
import { Ship, SHIP_TUNING } from './game/ship';
import { RACE_ASTEROID_DEFAULTS, RACE_COURSES } from './game/racing/courses';
import { initPhysics, PhysicsWorld } from './physics/world';
import { GameAudio } from './audio/audio';
import { TuningPanel } from './debug/tuningPanel';
import { DebugViz } from './debug/debugViz';
import { QuickTune, type QuickTuneEntry } from './debug/quickTune';
import { applyTuning, loadSavedTuning, snapshotTuning } from './debug/tuningStore';
import { SpaceDust } from './render/dust';
import { createRenderRig } from './render/scene';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const statusBar = document.getElementById('status') as HTMLDivElement;
const toast = document.getElementById('toast') as HTMLDivElement;
const fadeOverlay = document.getElementById('fade-overlay') as HTMLDivElement;

await initPhysics();

const FIXED_DT = 1 / 120;
const MAX_STEPS_PER_FRAME = 8;

// Same in-source baseline + saved overrides path as main.ts so the lab boots
// with whatever you last saved as defaults.
Object.assign(GRAVITY_TUNING, {
  G: 0.078,
  SOFTENING_FACTOR: 0.28,
  MIN_SOFTENING: 9,
  DANGER_RANGE: 280,
  CORE_BOOST_RANGE_FRAC: 1.75,
  CORE_BOOST_PEAK: 2.65,
});
Object.assign(SHIP_TUNING, {
  SPEED_ASSIST_START: 160,
  SPEED_ASSIST_FULL: 360,
  SPEED_ASSIST_DAMPING: 0.42,
  SPEED_ASSIST_PULL_SUPPRESS_LO: 0.7,
  SPEED_ASSIST_PULL_SUPPRESS_HI: 7.0,
});
const CODE_BASELINE = snapshotTuning();
const savedTuning = loadSavedTuning();
if (savedTuning) applyTuning(savedTuning);

// A real course only to seed the asteroid field's geometry/clearance rules.
const labCourse = RACE_COURSES[0];
Object.assign(ASTEROID_TUNING, RACE_ASTEROID_DEFAULTS, labCourse.asteroidTuning);
const spawnPos = new THREE.Vector3().copy(labCourse.startPosition);

const audio = new GameAudio(import.meta.env.BASE_URL);
void audio.init();
const unlockAudio = (): void => audio.unlock();
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);
window.addEventListener('gamepadconnected', unlockAudio);

const { composer, scene, camera, skybox } = createRenderRig(canvas);
const physics = new PhysicsWorld(FIXED_DT);
const input = new Input(canvas);
const registry = new ContactRegistry();
const ship = new Ship(physics, scene);
const dust = new SpaceDust(scene);
const asteroidField = new AsteroidField(scene, physics, registry, labCourse);
const feedback = new GravityFeedback();
const energy = new Energy();

ship.teleport(spawnPos);
ship.refillHp();
ship.setFrozen(false);

const debugViz = new DebugViz({
  scene,
  field: asteroidField,
  getShipPosition: () => ship.position,
});

const tuningPanel = new TuningPanel({
  ship,
  field: asteroidField,
  audio,
  spawnPos,
  baseline: CODE_BASELINE,
  debugViz,
  onToast: (msg, dur) => showToast(msg, dur),
});

// Curated controller-tunable params, editing the same live objects + baseline.
function regenField(): void {
  asteroidField.regenerate();
  debugViz.refreshHitboxes();
}
const quickEntry = (
  label: string,
  group: Record<string, number>,
  prop: string,
  base: Record<string, number>,
  step: number,
  min: number,
  max: number,
  needsRegen = false,
): QuickTuneEntry => ({
  label,
  get: () => group[prop],
  set: (v) => { group[prop] = v; },
  reset: () => { group[prop] = base[prop]; },
  step, min, max, needsRegen,
});
const quickTune = new QuickTune({
  entries: [
    quickEntry('Gravity G', GRAVITY_TUNING, 'G', CODE_BASELINE.GRAVITY_TUNING, 0.002, 0, 0.6),
    quickEntry('Core boost peak', GRAVITY_TUNING, 'CORE_BOOST_PEAK', CODE_BASELINE.GRAVITY_TUNING, 0.05, 0, 16),
    quickEntry('Core boost range', GRAVITY_TUNING, 'CORE_BOOST_RANGE_FRAC', CODE_BASELINE.GRAVITY_TUNING, 0.05, 0, 6),
    quickEntry('Pull suppress lo', SHIP_TUNING, 'SPEED_ASSIST_PULL_SUPPRESS_LO', CODE_BASELINE.SHIP_TUNING, 0.1, 0, 40),
    quickEntry('Pull suppress hi', SHIP_TUNING, 'SPEED_ASSIST_PULL_SUPPRESS_HI', CODE_BASELINE.SHIP_TUNING, 0.2, 0.5, 120),
    quickEntry('Forward thrust', SHIP_TUNING, 'FORWARD_THRUST', CODE_BASELINE.SHIP_TUNING, 2, 5, 2000),
    quickEntry('Death speed', LIFECYCLE_TUNING, 'DEATH_SPEED_THRESHOLD', CODE_BASELINE.LIFECYCLE_TUNING, 0.5, 1, 120),
    quickEntry('Asteroid count', ASTEROID_TUNING, 'PROCEDURAL_COUNT', CODE_BASELINE.ASTEROID_TUNING, 10, 0, 2000, true),
    quickEntry('Asteroid size min', ASTEROID_TUNING, 'RADIUS_MIN', CODE_BASELINE.ASTEROID_TUNING, 2, 1, 400, true),
    quickEntry('Asteroid size range', ASTEROID_TUNING, 'RADIUS_RANGE', CODE_BASELINE.ASTEROID_TUNING, 5, 1, 1500, true),
    quickEntry('Mass / grav pull', ASTEROID_TUNING, 'MASS_COEF', CODE_BASELINE.ASTEROID_TUNING, 2, 0.5, 400, true),
  ],
  onToast: (msg, dur) => showToast(msg, dur),
  onRegen: regenField,
});

// --- Camera (chase, matching the main game) ---------------------------------
const CHASE_DISTANCE = 9;
const CHASE_HEIGHT = 2.5;
const LOOK_RATE = 1.6;
const LOOK_RECENTER = 4.0;
const LOOK_PITCH_LIMIT = Math.PI / 2 - 0.05;
let lookYaw = 0;
let lookPitch = 0;

const shipQuat = new THREE.Quaternion();
const lookQuat = new THREE.Quaternion();
const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const camOffset = new THREE.Vector3();
const shipPosVec = new THREE.Vector3();
const tmpThrustWorld = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();

// --- Respawn (instant — no fade, no countdown) ------------------------------
let invulnUntilMs = 0;
let peakSpeed = 0;
let gravitySample = sampleGravityAt(spawnPos, asteroidField.asteroids);
let audioThrustDemand = 0;
let audioBoost = 0;
let boostWasActive = false;

function respawn(reason: string): void {
  ship.teleport(spawnPos);
  ship.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  ship.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  ship.refillHp();
  energy.refill();
  audio.silence();
  peakSpeed = 0;
  lookYaw = 0;
  lookPitch = 0;
  invulnUntilMs = performance.now() + 350;
  if (reason) showToast(reason, 500);
}

function isInvuln(): boolean {
  return performance.now() < invulnUntilMs;
}

function isShipCollider(handle: number): boolean {
  return handle === ship.colliderHandle;
}

function updateLook(look: { yaw: number; pitch: number }, dt: number): void {
  lookYaw += look.yaw * LOOK_RATE * dt;
  lookPitch += look.pitch * LOOK_RATE * dt;
  lookPitch = Math.max(-LOOK_PITCH_LIMIT, Math.min(LOOK_PITCH_LIMIT, lookPitch));
  const hasLook = Math.abs(look.yaw) + Math.abs(look.pitch) > 0.02;
  if (!hasLook) {
    const k = 1 - Math.exp(-LOOK_RECENTER * dt);
    lookYaw += (0 - lookYaw) * k;
    lookPitch += (0 - lookPitch) * k;
  }
}

function syncCamera(): void {
  const p = ship.position;
  const r = ship.body.rotation();
  shipQuat.set(r.x, r.y, r.z, r.w);
  lookEuler.set(lookPitch, lookYaw, 0);
  lookQuat.setFromEuler(lookEuler);
  camOffset.set(0, CHASE_HEIGHT, CHASE_DISTANCE);
  camOffset.applyQuaternion(lookQuat);
  camOffset.applyQuaternion(shipQuat);
  camera.position.set(p.x + camOffset.x, p.y + camOffset.y, p.z + camOffset.z);
  camera.quaternion.copy(shipQuat).multiply(lookQuat);
}

function tickPhysics(): void {
  const cmd = input.sample();

  // R / Select forces a manual respawn for quick repositioning.
  if (cmd.restartRace) respawn('RESET');

  updateLook(cmd.look, FIXED_DT);

  const preStepSpeed = ship.speed;
  const p = ship.position;
  shipPosVec.set(p.x, p.y, p.z);
  gravitySample = sampleGravityAt(shipPosVec, asteroidField.asteroids);
  ship.setAmbientPull(gravitySample.strongestPull);
  ship.applyAcceleration(gravitySample.acceleration, FIXED_DT);

  const boost = Math.max(0, Math.min(1, cmd.boost));
  const thrustDemand = Math.max(Math.abs(cmd.thrust.x), Math.abs(cmd.thrust.y), Math.abs(cmd.thrust.z));
  audioThrustDemand = thrustDemand;
  audioBoost = boost;
  if (boost > 0.2 && thrustDemand > 0.08 && !boostWasActive) audio.boostKick();
  boostWasActive = boost > 0.2 && thrustDemand > 0.08;
  const drainMag = boost * thrustDemand * SHIP_TUNING.BOOST_ENERGY_MULT;
  ship.setThrustScale(energy.tick(drainMag, FIXED_DT));
  ship.applyCommand(cmd, FIXED_DT);

  physics.step();
  asteroidField.update(FIXED_DT);

  const r = ship.body.rotation();
  tmpQuat.set(r.x, r.y, r.z, r.w);
  tmpThrustWorld.set(cmd.thrust.x, cmd.thrust.y, cmd.thrust.z).applyQuaternion(tmpQuat);
  feedback.update(gravitySample.acceleration, tmpThrustWorld, FIXED_DT, input.readGamepad());

  const speed = ship.speed;
  if (speed > peakSpeed) peakSpeed = speed;

  let lethal = false;
  physics.eventQueue.drainCollisionEvents((h1, h2, started) => {
    if (!started) return;
    const k1 = registry.lookup(h1);
    const k2 = registry.lookup(h2);
    const other = isShipCollider(h1) ? k2 : isShipCollider(h2) ? k1 : null;
    if (other?.type === 'asteroid' && !isInvuln()) {
      audio.dustImpact(Math.max(0.35, Math.min(1.4, preStepSpeed / 160)));
      if (preStepSpeed > LIFECYCLE_TUNING.DEATH_SPEED_THRESHOLD) {
        lethal = true;
      } else {
        const lin = ship.body.linvel();
        const damp = LIFECYCLE_TUNING.GRAZE_VELOCITY_DAMP;
        ship.body.setLinvel({ x: lin.x * damp, y: lin.y * damp, z: lin.z * damp }, true);
      }
    }
  });
  if (lethal) {
    audio.wreckTone();
    respawn('CRASH — respawn');
  }
}

function render(): void {
  ship.syncMeshFromBody();
  dust.update(ship.position);
  syncCamera();
  feedback.apply(camera);
  skybox.position.copy(camera.position);
  debugViz.update();
  composer.render();
}

// Orbitron lacks tabular figures, so box each glyph to stop digit jitter.
function monoDigits(text: string): string {
  let out = '';
  for (const ch of text) {
    const cls = (ch >= '0' && ch <= '9') || ch === '-' ? 'dg' : 'sep';
    out += `<span class="${cls}">${ch}</span>`;
  }
  return out;
}

// The main game's instrument cluster, minus the race-only gates/splits/records.
// Timer is parked at 0.00 — it's here for the readouts, not timing.
function updateStatus(): void {
  const ePct = Math.round(energy.fraction * 100);
  const pull = gravitySample.strongestPull;
  const clear = gravitySample.closestClearance;
  const wellLvl = pull >= 30 || (Number.isFinite(clear) && clear < 70) ? 3
    : pull >= 15 ? 2
    : pull >= 5 ? 1
    : 0;
  const wellSub = Number.isFinite(clear) ? `${clear.toFixed(0)}M CLEAR` : 'OPEN SPACE';
  const SPEED_REF = 360;
  const speedPct = Math.max(0, Math.min(1, ship.speed / SPEED_REF)) * 100;
  const hpPct = Math.max(0, Math.min(1, ship.hpFraction)) * 100;

  statusBar.innerHTML = `
    <div class="rig-side left">
      <div class="gauge">
        <span class="gauge-label">Velocity</span>
        <div class="gauge-row"><span class="gauge-val">${monoDigits(ship.speed.toFixed(0))}<i>m/s</i></span><span class="sub">pk ${peakSpeed.toFixed(0)}</span></div>
        <div class="meter amber"><div class="meter-fill" style="width:${speedPct.toFixed(0)}%"></div></div>
      </div>
      <div class="gauge${energy.fraction < 0.2 ? ' low' : ''}">
        <span class="gauge-label">Cell · Boost ${Math.round(audioBoost * 100)}%</span>
        <div class="meter"><div class="meter-fill" style="width:${ePct}%"></div></div>
      </div>
    </div>
    <div class="rig-chrono">
      <span class="chrono-time">${monoDigits('0:00.000')}</span>
      <div class="chrono-foot"><span class="state">FLIGHT LAB</span></div>
      <div class="chrono-records">${asteroidField.asteroids.length} ASTEROIDS · ${input.readGamepad() ? 'PAD' : 'KB/M'}</div>
    </div>
    <div class="rig-side right">
      <div class="gauge well lvl${wellLvl}">
        <span class="gauge-label">Well Pull</span>
        <div class="gauge-row"><span class="gauge-val">${monoDigits(pull.toFixed(1))}<i>m/s²</i></span></div>
        <span class="sub">${wellSub}</span>
      </div>
      <div class="gauge${ship.hpFraction < 0.3 ? ' low' : ''}">
        <span class="gauge-label">Hull · ${Math.round(ship.hp)}/${Math.round(ship.hpMax)}</span>
        <div class="meter amber"><div class="meter-fill" style="width:${hpPct.toFixed(0)}%"></div></div>
      </div>
    </div>
  `;
}

// --- Loop -------------------------------------------------------------------
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
  updateStatus();
  audio.update(gravitySample.strongestPull, gravitySample.closestClearance, frameDt, 0);
  audio.updateFlight(audioThrustDemand, audioBoost, frameDt);
  quickTune.update(input.readGamepad(), nowMs);
  tickToast(frameDt);
  tuningPanel.update({
    fps,
    speed: ship.speed,
    energy: energy.fraction,
    pull: gravitySample.strongestPull,
    clearance: gravitySample.closestClearance,
    state: 'lab',
  });

  frameCount++;
  if (nowMs - fpsLastMs >= 500) {
    fps = (frameCount * 1000) / (nowMs - fpsLastMs);
    frameCount = 0;
    fpsLastMs = nowMs;
    const clear = gravitySample.closestClearance;
    hud.textContent =
      `Flight Test Lab\n` +
      `fps ${fps.toFixed(0)}  speed ${ship.speed.toFixed(1)} m/s  peak ${peakSpeed.toFixed(1)}\n` +
      `pull ${gravitySample.strongestPull.toFixed(2)} m/s^2  clearance ${Number.isFinite(clear) ? clear.toFixed(0) + 'm' : 'open'}\n` +
      `${asteroidField.asteroids.length} asteroids  ${input.readGamepad() ? 'gamepad yes' : 'gamepad -'}\n` +
      `P tuning · R/Select respawn`;
  }

  requestAnimationFrame(loop);
}

// --- Toast ------------------------------------------------------------------
let toastTimer = 0;
function showToast(msg: string, durationMs: number): void {
  toast.textContent = msg;
  toast.style.opacity = '1';
  toastTimer = durationMs / 1000;
}
function tickToast(dt: number): void {
  if (toastTimer <= 0) return;
  toastTimer -= dt;
  if (toastTimer <= 0) toast.style.opacity = '0';
}

void fadeOverlay;
showToast('Flight Test Lab — fly, crash, instant respawn', 2200);
requestAnimationFrame(loop);
