import * as THREE from 'three';
import { ASTEROID_TUNING, AsteroidField } from './game/asteroids';
import { ContactRegistry } from './game/collision';
import { Energy } from './game/energy';
import { GravityFeedback } from './game/feedback';
import { GRAVITY_TUNING, sampleGravityAt } from './game/gravity';
import { Input } from './game/input';
import { Lifecycle, LIFECYCLE_TUNING } from './game/lifecycle';
import { PICKUP_TUNING, PickupSystem } from './game/pickups';
import { Ship, SHIP_TUNING } from './game/ship';
import { predictTrajectory, type Trajectory } from './game/trajectory';
import { computeModsFromParts, defaultManifest } from './game/upgrades';
import { CheckpointSystem } from './game/racing/checkpoints';
import { RACE_ASTEROID_DEFAULTS, RACE_COURSES, medalFor, type RaceCourse } from './game/racing/courses';
import { GhostRecorder, GhostReplay } from './game/racing/ghost';
import { createLeaderboardProvider, type CourseRecord, type RaceLeaderboardEntry } from './game/racing/leaderboard';
import { formatDelta, formatRaceTime, RaceManager } from './game/racing/raceManager';
import { zoneFor, zoneLabel, type FieldZone } from './game/zones';
import { initPhysics, PhysicsWorld } from './physics/world';
import { GameAudio } from './audio/audio';
import { TuningPanel } from './debug/tuningPanel';
import { SpaceDust } from './render/dust';
import { Minimap } from './render/minimap';
import { createRenderRig } from './render/scene';
import { resolveShipVisual } from './render/shipVisual';
import { TrajectoryRibbon } from './render/trajectory';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const controls = document.getElementById('controls') as HTMLDivElement;
const padDebug = document.getElementById('pad-debug') as HTMLDivElement;
const fadeOverlay = document.getElementById('fade-overlay') as HTMLDivElement;
const statusBar = document.getElementById('status') as HTMLDivElement;
const toast = document.getElementById('toast') as HTMLDivElement;

await initPhysics();

const FIXED_DT = 1 / 120;
const MAX_STEPS_PER_FRAME = 8;
const BASE_POS = new THREE.Vector3(0, 0, 0);

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
PICKUP_TUNING.ENERGY_PICKUP_COUNT = 0;

const leaderboard = createLeaderboardProvider();
const racingSave = await leaderboard.load();
let selectedCourseIndex = Math.max(0, RACE_COURSES.findIndex((c) => c.id === racingSave.selectedCourseId));
if (selectedCourseIndex < 0) selectedCourseIndex = 0;
let selectedCourse = RACE_COURSES[selectedCourseIndex];
applyCourseAsteroids(selectedCourse);

const audio = new GameAudio(import.meta.env.BASE_URL);
void audio.init();
const unlockAudio = (): void => audio.unlock();
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);
window.addEventListener('gamepadconnected', unlockAudio);

const { renderer, composer, scene, camera, skybox } = createRenderRig(canvas);
const physics = new PhysicsWorld(FIXED_DT);
const input = new Input(canvas);
const registry = new ContactRegistry();
const ship = new Ship(physics, scene);
const dust = new SpaceDust(scene);
const asteroidField = new AsteroidField(scene, physics, registry, selectedCourse.seed);
const trajectoryRibbon = new TrajectoryRibbon(scene);
const minimap = new Minimap();
const feedback = new GravityFeedback();
const energy = new Energy();
const pickups = new PickupSystem(scene, physics, registry);
const checkpoints = new CheckpointSystem(scene, physics, registry);
const race = new RaceManager();
const ghostRecorder = new GhostRecorder();
const ghostReplay = new GhostReplay(scene);

checkpoints.setCourse(selectedCourse);
ship.teleport(selectedCourse.startPosition);
ship.setFrozen(true);
ship.setMods(computeModsFromParts(defaultManifest().parts));
void resolveAndSwapShipVisual();

const lifecycle = new Lifecycle(ship, selectedCourse.startPosition, {
  onDeath: () => {
    audio.destroy();
    ghostRecorder.reset();
    race.invalidate('SHIP LOST');
    showToast('RUN INVALIDATED  -  ship lost', 1800);
    renderCourseSelect('Ship lost. Restart to run the course again.');
  },
  onRespawn: () => {
    energy.refill();
    ship.refillHp();
    ship.setFrozen(true);
    peakSpeed = 0;
    hasPrevVelocity = false;
  },
});

const tuningPanel = new TuningPanel({
  ship,
  field: asteroidField,
  pickups,
  audio,
  spawnPos: selectedCourse.startPosition,
  onToast: (msg, dur) => showToast(msg, dur),
});
tuningPanel.toggle();

type CameraMode = 'chase' | 'cockpit';
let cameraMode: CameraMode = 'chase';
const CHASE_DISTANCE = 9;
const CHASE_HEIGHT = 2.5;
const LOOK_RATE = 1.6;
const LOOK_RECENTER = 4.0;
const LOOK_PITCH_LIMIT = Math.PI / 2 - 0.05;
const REMOTE_ERROR_MAX = 180;

let lookYaw = 0;
let lookPitch = 0;
let trajectory: Trajectory = predictTrajectory(ship.position, ship.linearVelocity, asteroidField.asteroids);
let gravitySample = sampleGravityAt(selectedCourse.startPosition, asteroidField.asteroids);
let currentZone: FieldZone = 'open';
let peakSpeed = 0;
let accelMag = 0;
let hasPrevVelocity = false;
let controlsVisible = true;
let padDebugVisible = false;
let finishMessage = '';
let leaderboardRefreshSeq = 0;

const shipQuat = new THREE.Quaternion();
const tmpQuat = new THREE.Quaternion();
const lookQuat = new THREE.Quaternion();
const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const shipEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const camOffset = new THREE.Vector3();
const shipPosVec = new THREE.Vector3();
const tmpDeathPos = new THREE.Vector3();
const tmpDeathVel = new THREE.Vector3();
const tmpThrustWorld = new THREE.Vector3();
const prevVelocity = new THREE.Vector3();
const ringTargetWorld = new THREE.Vector3();
const ringTargetDir = new THREE.Vector3();
const ringTargetProj = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const cameraUp = new THREE.Vector3();
const cameraForward = new THREE.Vector3();

const coursePanel = document.createElement('div');
coursePanel.id = 'course-select';
document.body.appendChild(coursePanel);
const ringTracker = createRingTracker();
injectRaceStyles();
renderControls();
prepareCourse(selectedCourse);
renderCourseSelect('Choose a league course, then press Enter or Start Race.');

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyH' && !e.repeat) {
    controlsVisible = !controlsVisible;
    controls.style.display = controlsVisible ? '' : 'none';
  }
  if (e.code === 'KeyG' && !e.repeat) {
    padDebugVisible = !padDebugVisible;
    padDebug.style.display = padDebugVisible ? '' : 'none';
  }
});

function applyCourseAsteroids(course: RaceCourse): void {
  Object.assign(ASTEROID_TUNING, RACE_ASTEROID_DEFAULTS, course.asteroidTuning);
}

async function resolveAndSwapShipVisual(): Promise<void> {
  try {
    const built = await resolveShipVisual({ variant: ship.variant, manifest: defaultManifest() });
    ship.setVisual(built);
  } catch (err) {
    console.warn('[ship] visual resolve failed', err);
  }
}

function prepareCourse(course: RaceCourse): void {
  selectedCourse = course;
  applyCourseAsteroids(course);
  asteroidField.regenerate(course.seed);
  checkpoints.setCourse(course);
  const refreshSeq = ++leaderboardRefreshSeq;
  void leaderboard.setSelectedCourse(course.id).then(() => {
    if (refreshSeq !== leaderboardRefreshSeq || selectedCourse.id !== course.id) return;
    ghostReplay.setRun(leaderboard.getRecord(course.id)?.bestGhost ?? null);
    if (race.state !== 'racing' && race.state !== 'countdown') {
      renderCourseSelect(finishMessage || 'Course loaded. Press Enter or Start Race.');
    }
  });
  lifecycle.setRespawnPos(course.startPosition);
  ship.teleport(course.startPosition);
  ship.setFrozen(true);
  ship.refillHp();
  energy.refill();
  peakSpeed = 0;
  accelMag = 0;
  hasPrevVelocity = false;
  currentZone = 'open';
  gravitySample = sampleGravityAt(course.startPosition, asteroidField.asteroids);
  ghostReplay.setRun(leaderboard.getRecord(course.id)?.bestGhost ?? null);
}

function selectCourse(index: number): void {
  if (race.state === 'racing' || race.state === 'countdown') return;
  selectedCourseIndex = (index + RACE_COURSES.length) % RACE_COURSES.length;
  prepareCourse(RACE_COURSES[selectedCourseIndex]);
  race.returnToSelect();
  finishMessage = '';
  renderCourseSelect('Course loaded. Press Enter or Start Race.');
}

function startRace(): void {
  prepareCourse(selectedCourse);
  race.start(selectedCourse);
  ghostRecorder.reset();
  ghostReplay.setRun(leaderboard.getRecord(selectedCourse.id)?.bestGhost ?? null);
  coursePanel.style.display = 'none';
  showToast('STAND BY', 900);
}

async function finishRace(): Promise<void> {
  const finish = race.finish;
  if (!finish) return;
  ship.setFrozen(true);
  const run = ghostRecorder.complete(finish.courseId, finish.timeSec, finish.splits, ship, race.nextCheckpoint);
  const result = await leaderboard.submitRun(run);
  const medal = medalFor(finish.timeSec, selectedCourse.medals).toUpperCase();
  const best = result.record.bestTimeSec;
  const delta = finish.timeSec - best;
  const remote = result.isGlobalBest
    ? ' - global best'
    : result.remoteError
      ? ` - local saved, remote failed: ${shortError(result.remoteError)}`
      : '';
  finishMessage = `${medal} finish ${formatRaceTime(finish.timeSec)}${result.isPersonalBest ? ' - personal best' : ` (${formatDelta(delta)} vs best)`}${remote}`;
  ghostReplay.setRun(result.record.bestGhost);
  showToast(finishMessage, 3000);
  renderCourseSelect(finishMessage, result.record);
}

function applyCameraToggle(): void {
  cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
  showToast(`CAMERA ${cameraMode.toUpperCase()}`, 800);
}

function updateLook(cmd: { look: { yaw: number; pitch: number } }, dt: number): void {
  lookYaw += cmd.look.yaw * LOOK_RATE * dt;
  lookPitch += cmd.look.pitch * LOOK_RATE * dt;
  lookPitch = Math.max(-LOOK_PITCH_LIMIT, Math.min(LOOK_PITCH_LIMIT, lookPitch));
  const hasLook = Math.abs(cmd.look.yaw) + Math.abs(cmd.look.pitch) > 0.02;
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
  tmpQuat.copy(shipQuat).multiply(lookQuat);

  if (cameraMode === 'cockpit') {
    const cockpitOffset = new THREE.Vector3(0, 0.55, -0.55).applyQuaternion(shipQuat);
    camera.position.set(p.x + cockpitOffset.x, p.y + cockpitOffset.y, p.z + cockpitOffset.z);
    camera.quaternion.copy(tmpQuat);
  } else {
    camOffset.set(0, CHASE_HEIGHT, CHASE_DISTANCE);
    camOffset.applyQuaternion(lookQuat);
    camOffset.applyQuaternion(shipQuat);
    camera.position.set(p.x + camOffset.x, p.y + camOffset.y, p.z + camOffset.z);
    camera.quaternion.copy(shipQuat).multiply(lookQuat);
  }
}

function isShipCollider(handle: number): boolean {
  return handle === ship.colliderHandle;
}

function tickPhysics(): void {
  const cmd = input.sample();
  if (cmd.toggleCameraMode) applyCameraToggle();
  if (cmd.cycleShipVisual && race.state !== 'racing' && race.state !== 'countdown') {
    ship.cycleVariant(1);
    void resolveAndSwapShipVisual();
    showToast(`SHIP ${ship.variantName}`, 1200);
  }
  if (cmd.courseDelta !== 0 && race.state !== 'racing' && race.state !== 'countdown') {
    selectCourse(selectedCourseIndex + Math.sign(cmd.courseDelta));
  }
  if (cmd.courseIndex !== null) selectCourse(cmd.courseIndex);
  if (cmd.startRace && (race.state === 'select' || race.state === 'finished' || race.state === 'invalid')) startRace();
  if (cmd.restartRace) startRace();

  const raceEvent = race.update(FIXED_DT);
  if (raceEvent.started) {
    ship.setFrozen(false);
    showToast('GO', 700);
  }

  if (race.state !== 'racing') {
    checkpoints.update(FIXED_DT, race.nextCheckpoint);
    lifecycle.update(FIXED_DT);
    return;
  }

  updateLook(cmd, FIXED_DT);
  const preStepSpeed = ship.speed;
  const p = ship.position;
  shipPosVec.set(p.x, p.y, p.z);
  gravitySample = sampleGravityAt(shipPosVec, asteroidField.asteroids);
  ship.setAmbientPull(gravitySample.strongestPull);
  ship.setCargoFraction(0);
  ship.applyAcceleration(gravitySample.acceleration, FIXED_DT);

  const boost = Math.max(0, Math.min(1, cmd.boost));
  const forwardThrust = Math.max(0, -cmd.thrust.z);
  const drainMag = boost * forwardThrust * SHIP_TUNING.BOOST_ENERGY_MULT;
  const thrustScale = energy.tick(drainMag, FIXED_DT);
  ship.setThrustScale(thrustScale);
  ship.applyCommand(cmd, FIXED_DT);

  physics.step();
  asteroidField.update(FIXED_DT);
  checkpoints.update(FIXED_DT, race.nextCheckpoint);
  ghostRecorder.update(race.elapsedSec, ship, race.nextCheckpoint);
  ghostReplay.update(race.elapsedSec);

  const v = ship.linearVelocity;
  const speed = Math.hypot(v.x, v.y, v.z);
  if (speed > peakSpeed) peakSpeed = speed;
  if (hasPrevVelocity) {
    const ax = (v.x - prevVelocity.x) / FIXED_DT;
    const ay = (v.y - prevVelocity.y) / FIXED_DT;
    const az = (v.z - prevVelocity.z) / FIXED_DT;
    accelMag += (Math.hypot(ax, ay, az) - accelMag) * 0.18;
  }
  prevVelocity.set(v.x, v.y, v.z);
  hasPrevVelocity = true;

  const r = ship.body.rotation();
  tmpQuat.set(r.x, r.y, r.z, r.w);
  tmpThrustWorld.set(cmd.thrust.x, cmd.thrust.y, cmd.thrust.z).applyQuaternion(tmpQuat);
  feedback.update(gravitySample.acceleration, tmpThrustWorld, FIXED_DT, input.readGamepad());

  const distFromBase = Math.hypot(p.x - BASE_POS.x, p.y - BASE_POS.y, p.z - BASE_POS.z);
  currentZone = zoneFor(distFromBase);

  let deathThisTick = false;
  physics.eventQueue.drainCollisionEvents((h1, h2, started) => {
    if (!started) return;
    const k1 = registry.lookup(h1);
    const k2 = registry.lookup(h2);
    const checkpoint = k1?.type === 'checkpoint' ? k1 : k2?.type === 'checkpoint' ? k2 : null;
    if (checkpoint) {
      const accepted = race.checkpoint(checkpoint.index);
      if (accepted.accepted) {
        const gate = selectedCourse.gates[checkpoint.index];
        audio.pickupChime();
        if (accepted.finished) void finishRace();
        else showToast(`${checkpoint.index + 1}/${selectedCourse.gates.length}  ${gate.label}`, 1000);
      }
      return;
    }

    const other = isShipCollider(h1) ? k2 : isShipCollider(h2) ? k1 : null;
    if (other?.type === 'asteroid' && lifecycle.isAlive()) {
      if (preStepSpeed > LIFECYCLE_TUNING.DEATH_SPEED_THRESHOLD) {
        deathThisTick = true;
      } else {
        const lin = ship.body.linvel();
        const damp = LIFECYCLE_TUNING.GRAZE_VELOCITY_DAMP;
        ship.body.setLinvel({ x: lin.x * damp, y: lin.y * damp, z: lin.z * damp }, true);
      }
    }
  });

  if (deathThisTick) {
    tmpDeathPos.set(ship.position.x, ship.position.y, ship.position.z);
    tmpDeathVel.set(ship.linearVelocity.x, ship.linearVelocity.y, ship.linearVelocity.z);
    lifecycle.die(tmpDeathPos, tmpDeathVel);
  }

  lifecycle.update(FIXED_DT);
}

function render(): void {
  ship.syncMeshFromBody();
  dust.update(ship.position);
  trajectory = predictTrajectory(ship.position, ship.linearVelocity, asteroidField.asteroids);
  trajectoryRibbon.update(trajectory);
  syncCamera();
  updateRingTracker();
  feedback.apply(camera);
  skybox.position.copy(camera.position);
  composer.render();

  const r = ship.body.rotation();
  shipQuat.set(r.x, r.y, r.z, r.w);
  shipEuler.setFromQuaternion(shipQuat, 'YXZ');
  minimap.update(asteroidField.asteroids, trajectory, ship.position, shipEuler.y, {
    nextCheckpoint: checkpoints.targetPosition(race.nextCheckpoint),
    finish: selectedCourse.gates[selectedCourse.gates.length - 1]?.position ?? null,
    ghost: ghostReplay.position,
  });
  minimap.render(renderer);
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
  audio.update(gravitySample.strongestPull, gravitySample.closestClearance, frameDt, 0);
  tickToast(frameDt);
  updateStatus();
  tuningPanel.update({
    fps,
    speed: ship.speed,
    cargo: 0,
    bank: 0,
    energy: energy.fraction,
    mineRate: 0,
    pull: gravitySample.strongestPull,
    clearance: gravitySample.closestClearance,
    state: race.state,
  });

  frameCount++;
  if (nowMs - fpsLastMs >= 500) {
    fps = (frameCount * 1000) / (nowMs - fpsLastMs);
    frameCount = 0;
    fpsLastMs = nowMs;

    const target = checkpoints.targetPosition(race.nextCheckpoint);
    const sp = ship.position;
    const targetDist = target ? Math.hypot(target.x - sp.x, target.y - sp.y, target.z - sp.z) : 0;
    const padHint = input.readGamepad() ? 'gamepad yes' : 'gamepad -';
    const lockHint = input.isPointerLocked() ? '' : '  (click to capture mouse)';
    hud.textContent =
      `Slingshot League - time trials\n` +
      `fps ${fps.toFixed(0)}  dt ${(FIXED_DT * 1000).toFixed(2)}ms  cam ${cameraMode}  ${zoneLabel(currentZone)}\n` +
      `course ${selectedCourse.name}  state ${race.state}  gate ${Math.min(race.nextCheckpoint + 1, selectedCourse.gates.length)} / ${selectedCourse.gates.length}\n` +
      `time ${formatRaceTime(race.elapsedSec)}  target ${targetDist.toFixed(0)}m  speed ${ship.speed.toFixed(1)} m/s  peak ${peakSpeed.toFixed(1)}\n` +
      `pull ${gravitySample.strongestPull.toFixed(2)} m/s^2  clearance ${gravitySample.closestClearance.toFixed(0)}m  accel ${accelMag.toFixed(1)} m/s^2\n` +
      `${asteroidField.asteroids.length} asteroids  ghost ${leaderboard.getRecord(selectedCourse.id) ? 'yes' : '-'}  ${padHint}${lockHint}`;
  }

  requestAnimationFrame(loop);
}

function updateStatus(): void {
  const record = leaderboard.getRecord(selectedCourse.id);
  const bestSource = record?.source === 'supabase' ? 'GLOBAL' : 'LOCAL';
  const best = record ? `${bestSource} ${formatRaceTime(record.bestTimeSec)}` : '--:--.---';
  const ePct = Math.round(energy.fraction * 100);
  const energyBar = bar(energy.fraction, 14);
  const hpBar = bar(ship.hpFraction, 10);
  const splitIndex = race.nextCheckpoint - 1;
  const splitDelta = record && splitIndex >= 0 && record.bestSplits[splitIndex] !== undefined
    ? formatDelta(race.splits[splitIndex] - record.bestSplits[splitIndex])
    : '';
  const stateLine =
    race.state === 'countdown' ? `COUNTDOWN ${Math.ceil(race.countdownSec)}` :
    race.state === 'finished' ? finishMessage :
    race.state === 'invalid' ? `INVALID - ${race.invalidReason}` :
    race.state === 'select' ? 'SELECT COURSE' :
    'RACING';

  statusBar.innerHTML = `
    <div class="line"><b>TIME</b> ${formatRaceTime(race.elapsedSec)} <span class="mining">BEST ${best}</span></div>
    <div class="line"><b>GATE</b> ${Math.min(race.nextCheckpoint + 1, selectedCourse.gates.length)} / ${selectedCourse.gates.length} ${splitDelta ? `<span class="reserve">${splitDelta}</span>` : ''}</div>
    <div class="line"><b>ENERGY</b> ${energyBar} ${ePct}%</div>
    <div class="line"><b>HULL</b> ${hpBar} ${Math.round(ship.hp)} / ${Math.round(ship.hpMax)}</div>
    <div class="line"><b>STATE</b> ${stateLine} <span class="mining">R/Start restart</span></div>
  `;
}

function renderPadDebug(): void {
  const pad = input.readGamepad();
  if (!pad) {
    padDebug.textContent = 'No standard gamepad detected';
    return;
  }
  padDebug.innerHTML = `<b>${pad.id}</b><br>axes ${pad.axes.map((a) => a.toFixed(2)).join('  ')}<br>buttons ${pad.buttons.map((b, i) => `${i}:${b.pressed ? '1' : '0'}`).join(' ')}`;
}

function renderControls(): void {
  controls.innerHTML = `
    <h3>SLINGSHOT LEAGUE</h3>
    <div class="row"><b>Gamepad</b> L stick pitch/roll, R stick yaw/up-down</div>
    <div class="row"><b>Gamepad</b> LB/RB strafe left/right</div>
    <div class="row"><b>Gamepad</b> RT/LT thrust/brake, B boost</div>
    <div class="row"><b>Gamepad</b> D-pad choose/strafe, A start, Start restart</div>
    <div class="row"><b>Enter</b> start selected course</div>
    <div class="row"><b>1 / 2 / 3</b> choose course</div>
    <div class="row"><b>R</b> restart run</div>
    <div class="row"><b>W/S</b> thrust / brake</div>
    <div class="row"><b>A/D</b> roll, <b>Q/E</b> yaw</div>
    <div class="row"><b>Space/Ctrl</b> strafe up/down</div>
    <div class="row"><b>Shift</b> boost</div>
    <div class="row"><b>C</b> camera, <b>V</b> ship visual</div>
    <div class="row"><b>P</b> tuning, <b>G</b> pad debug, <b>H</b> hide</div>
  `;
}

function renderCourseSelect(message: string, recordOverride?: CourseRecord): void {
  const record = recordOverride ?? leaderboard.getRecord(selectedCourse.id);
  const entries = leaderboard.getCourseEntries(selectedCourse.id);
  const remoteError = leaderboard.getLastRemoteError();
  const remoteStatus = leaderboard.isRemoteEnabled()
    ? remoteError
      ? `Supabase issue: ${shortError(remoteError)}`
      : entries.some((entry) => entry.source === 'supabase')
        ? 'Supabase connected'
        : 'Supabase connected - no global runs yet'
    : 'Local only - configure Supabase env vars for shared ghosts';
  const rows = RACE_COURSES.map((course, index) => {
    const r = leaderboard.getRecord(course.id);
    const selected = course.id === selectedCourse.id ? ' selected' : '';
    const source = r?.source === 'supabase' ? 'Global' : 'Local';
    return `<button class="course-button${selected}" data-course="${index}">
      <span class="course-number">${String(index + 1).padStart(2, '0')}</span>
      <span class="course-main">
        <strong>${escapeHtml(course.name)}</strong>
        <small>${escapeHtml(course.summary)}</small>
        <span class="course-meta">
          <em>${source} ${r ? formatRaceTime(r.bestTimeSec) : '--:--.---'}${r?.playerName ? ` / ${escapeHtml(r.playerName)}` : ''}</em>
          <em>${course.gates.length} gates</em>
          <em>Gold ${formatRaceTime(course.medals.gold)}</em>
        </span>
      </span>
    </button>`;
  }).join('');
  const splits = record
    ? record.bestSplits.map((s, i) => `<span><b>S${i + 1}</b>${formatRaceTime(s)}</span>`).join('')
    : '<span>No completed run yet.</span>';
  const standings = renderLeaderboardEntries(entries);
  const ghostLabel = record
    ? `${record.source === 'supabase' ? 'Global' : 'Local'} ghost: ${formatRaceTime(record.bestTimeSec)}${record.playerName ? ` by ${escapeHtml(record.playerName)}` : ''}`
    : 'No ghost available yet.';
  coursePanel.innerHTML = `
    <div class="course-card" role="dialog" aria-label="Race course select">
      <div class="course-header">
        <div>
          <div class="league-title">Dead Iron Racing League</div>
          <h1>${escapeHtml(selectedCourse.name)}</h1>
          <p>${escapeHtml(message)}</p>
        </div>
        <div class="pilot-row">
          <label for="pilot-name">Pilot</label>
          <input id="pilot-name" maxlength="40" value="${escapeHtml(leaderboard.getPlayerName())}" autocomplete="nickname" spellcheck="false">
          <span>${escapeHtml(remoteStatus)}</span>
        </div>
      </div>
      <div class="course-layout">
        <section class="course-list" aria-label="Courses">
          <div class="section-title">
            <h2>Courses</h2>
            <span>${RACE_COURSES.length} live circuits</span>
          </div>
          <div class="course-grid">${rows}</div>
        </section>
        <section class="race-panel" aria-label="Leaderboard and ghost target">
          <div class="section-title">
            <h2>Leaderboard</h2>
            <span>${entries.length ? 'Best shared runs' : 'Awaiting first run'}</span>
          </div>
          ${standings}
          <div class="target-panel">
            <div class="section-title">
              <h2>Ghost Target</h2>
              <span>${record ? 'Replay armed' : 'No replay'}</span>
            </div>
            <div class="ghost-target">${ghostLabel}</div>
            <div class="splits">${splits}</div>
          </div>
          <div class="medal-strip" aria-label="Medal times">
            <span><b>Gold</b>${formatRaceTime(selectedCourse.medals.gold)}</span>
            <span><b>Silver</b>${formatRaceTime(selectedCourse.medals.silver)}</span>
            <span><b>Bronze</b>${formatRaceTime(selectedCourse.medals.bronze)}</span>
          </div>
        </section>
      </div>
      <div class="course-footer">
        <div class="command-strip">
          <span>Enter / A</span>
          <span>D-pad / 1-3</span>
          <span>R / Start</span>
        </div>
        <div class="course-actions">
          <button id="restart-race" class="secondary-action">Reset Ship</button>
          <button id="start-race" class="primary-action">Start Race</button>
        </div>
      </div>
    </div>
  `;
  coursePanel.style.display = '';
  coursePanel.querySelectorAll<HTMLButtonElement>('[data-course]').forEach((button) => {
    button.addEventListener('click', () => selectCourse(Number(button.dataset.course ?? '0')));
  });
  const pilotInput = coursePanel.querySelector<HTMLInputElement>('#pilot-name');
  const savePilotName = (): void => {
    if (!pilotInput) return;
    void leaderboard.setPlayerName(pilotInput.value).then(() => {
      pilotInput.value = leaderboard.getPlayerName();
      renderCourseSelect('Pilot name saved. New finished runs will use this name.', recordOverride);
    });
  };
  pilotInput?.addEventListener('change', savePilotName);
  pilotInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    pilotInput.blur();
  });
  coursePanel.querySelector<HTMLButtonElement>('#start-race')?.addEventListener('click', () => startRace());
  coursePanel.querySelector<HTMLButtonElement>('#restart-race')?.addEventListener('click', () => prepareCourse(selectedCourse));
}

function renderLeaderboardEntries(entries: readonly RaceLeaderboardEntry[]): string {
  if (entries.length === 0) return '<div class="empty-standings">No shared runs for this course yet.</div>';
  return `<ol class="leaderboard">${entries.map((entry) => `
    <li>
      <span>#${entry.rank}</span>
      <b>${formatRaceTime(entry.timeSec)}</b>
      <em>${escapeHtml(entry.playerName ?? 'Anonymous Pilot')}</em>
    </li>
  `).join('')}</ol>`;
}

function injectRaceStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    #course-select {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: grid;
      place-items: center;
      padding: 26px;
      box-sizing: border-box;
      background:
        linear-gradient(90deg, rgba(3, 6, 10, 0.82), rgba(3, 6, 10, 0.34) 48%, rgba(3, 6, 10, 0.78)),
        radial-gradient(circle at 45% 38%, rgba(77, 169, 183, 0.18), rgba(0, 0, 0, 0.72) 58%);
      color: #f1eee7;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #course-select .course-card {
      width: min(1100px, 100%);
      max-height: calc(100vh - 52px);
      overflow: auto;
      border: 1px solid rgba(121, 225, 214, 0.42);
      background:
        linear-gradient(180deg, rgba(10, 17, 24, 0.94), rgba(7, 9, 14, 0.9)),
        rgba(8, 10, 16, 0.92);
      box-shadow: 0 24px 90px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.05);
      padding: 22px;
      box-sizing: border-box;
    }
    #course-select .course-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(280px, 380px);
      gap: 22px;
      align-items: end;
      padding-bottom: 18px;
      border-bottom: 1px solid rgba(121, 225, 214, 0.16);
    }
    #course-select .league-title {
      color: #79e1d6;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      font-size: 11px;
      font-weight: 800;
    }
    #course-select h1 {
      margin: 8px 0 6px;
      font-size: clamp(30px, 4.6vw, 58px);
      line-height: 0.95;
      letter-spacing: 0;
      font-weight: 900;
      color: #fff8e8;
    }
    #course-select p {
      max-width: 620px;
      margin: 0;
      color: #c8c3b7;
      line-height: 1.45;
      font-size: 14px;
    }
    #course-select .course-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.82fr);
      gap: 18px;
      margin-top: 18px;
    }
    #course-select .course-list,
    #course-select .race-panel {
      min-width: 0;
    }
    #course-select .section-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 14px;
      min-height: 24px;
      margin-bottom: 9px;
    }
    #course-select h2 {
      margin: 0;
      color: #f28f45;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-weight: 800;
    }
    #course-select .section-title span {
      color: rgba(241, 238, 231, 0.58);
      font-size: 12px;
      white-space: nowrap;
    }
    #course-select .course-grid {
      display: grid;
      gap: 10px;
    }
    #course-select button {
      font: inherit;
      color: #f1eee7;
      border: 1px solid rgba(148, 113, 76, 0.45);
      background: rgba(12, 15, 20, 0.78);
      text-align: left;
      cursor: pointer;
    }
    #course-select button:hover,
    #course-select button:focus-visible {
      border-color: rgba(121, 225, 214, 0.72);
      outline: none;
    }
    #course-select .course-button {
      min-height: 96px;
      padding: 14px;
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr);
      gap: 14px;
      align-items: start;
      border-left: 4px solid rgba(242, 143, 69, 0.52);
    }
    #course-select .course-button.selected {
      border-color: rgba(121, 225, 214, 0.88);
      border-left-color: #79e1d6;
      background: linear-gradient(90deg, rgba(29, 67, 73, 0.82), rgba(15, 24, 31, 0.88));
    }
    #course-select .course-number {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border: 1px solid rgba(121, 225, 214, 0.38);
      color: #79e1d6;
      font-weight: 900;
      font-size: 16px;
      background: rgba(0, 0, 0, 0.24);
    }
    #course-select .course-main {
      display: grid;
      gap: 7px;
      min-width: 0;
    }
    #course-select .course-main strong {
      color: #fff8e8;
      font-size: 20px;
      line-height: 1.1;
      font-weight: 850;
    }
    #course-select .course-main small {
      color: #c8c3b7;
      line-height: 1.35;
      font-size: 13px;
    }
    #course-select .course-meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    #course-select .course-meta em,
    #course-select .command-strip span,
    #course-select .medal-strip span,
    #course-select .splits span {
      border: 1px solid rgba(121, 225, 214, 0.2);
      background: rgba(6, 10, 14, 0.5);
      color: #79e1d6;
      font-style: normal;
      font-size: 11px;
      line-height: 1;
      padding: 6px 8px;
    }
    #course-select .pilot-row {
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr);
      align-items: end;
      gap: 8px;
      color: #c8c3b7;
      font-size: 12px;
    }
    #course-select .pilot-row label {
      color: #79e1d6;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 800;
    }
    #course-select .pilot-row input {
      min-width: 0;
      border: 1px solid rgba(121, 225, 214, 0.42);
      background: rgba(2, 4, 8, 0.62);
      color: #fff8e8;
      padding: 10px 11px;
      font: inherit;
      font-size: 14px;
    }
    #course-select .pilot-row span {
      grid-column: 2;
      color: rgba(241, 238, 231, 0.62);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #course-select .leaderboard {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 7px;
      font-size: 13px;
    }
    #course-select .leaderboard li {
      display: grid;
      grid-template-columns: 42px 88px minmax(0, 1fr);
      gap: 8px;
      align-items: center;
      min-height: 34px;
      padding: 0 10px;
      color: #c8c3b7;
      border: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(255, 255, 255, 0.035);
    }
    #course-select .leaderboard b { color: #fff8e8; font-weight: 800; }
    #course-select .leaderboard em {
      color: #79e1d6;
      font-style: normal;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #course-select .empty-standings,
    #course-select .ghost-target {
      color: #c8c3b7;
      font-size: 13px;
      line-height: 1.45;
      min-height: 20px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(255, 255, 255, 0.035);
      padding: 12px;
    }
    #course-select .target-panel {
      margin-top: 18px;
    }
    #course-select .splits {
      margin: 10px 0 0;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      color: #c8c3b7;
      font-size: 12px;
    }
    #course-select .splits b,
    #course-select .medal-strip b {
      color: #f28f45;
      margin-right: 6px;
      font-weight: 800;
    }
    #course-select .medal-strip {
      margin-top: 18px;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    #course-select .medal-strip span {
      color: #fff8e8;
      text-align: center;
    }
    #course-select .course-footer {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      margin-top: 18px;
      padding-top: 18px;
      border-top: 1px solid rgba(121, 225, 214, 0.16);
    }
    #course-select .command-strip {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    #course-select .command-strip span {
      color: rgba(241, 238, 231, 0.72);
      border-color: rgba(255, 255, 255, 0.1);
    }
    #course-select .course-actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    }
    #course-select .course-actions button {
      min-width: 132px;
      padding: 12px 16px;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 900;
      font-size: 12px;
    }
    #course-select .primary-action {
      border-color: rgba(121, 225, 214, 0.9);
      background: linear-gradient(180deg, rgba(58, 119, 121, 0.95), rgba(24, 60, 66, 0.95));
    }
    #course-select .secondary-action {
      color: #d4cec0;
    }
    @media (max-width: 900px) {
      #course-select {
        padding: 14px;
        place-items: start center;
      }
      #course-select .course-card {
        max-height: calc(100vh - 28px);
        padding: 16px;
      }
      #course-select .course-header,
      #course-select .course-layout,
      #course-select .course-footer {
        grid-template-columns: 1fr;
      }
      #course-select .course-footer {
        align-items: stretch;
      }
      #course-select .course-actions,
      #course-select .course-actions button {
        width: 100%;
      }
      #course-select .course-actions button {
        min-width: 0;
      }
    }
    @media (max-width: 560px) {
      #course-select h1 {
        font-size: 34px;
      }
      #course-select .course-button {
        grid-template-columns: 38px minmax(0, 1fr);
        min-height: 0;
        padding: 12px;
      }
      #course-select .course-number {
        width: 34px;
        height: 34px;
        font-size: 13px;
      }
      #course-select .pilot-row,
      #course-select .medal-strip,
      #course-select .course-actions {
        grid-template-columns: 1fr;
        flex-direction: column;
      }
      #course-select .pilot-row span {
        grid-column: 1;
      }
    }
  `;
  document.head.appendChild(style);
}

function createRingTracker(): HTMLDivElement {
  injectRingTrackerStyles();
  const root = document.createElement('div');
  root.id = 'ring-tracker';
  root.innerHTML = `
    <div class="ring-edge top"></div>
    <div class="ring-edge right"></div>
    <div class="ring-edge bottom"></div>
    <div class="ring-edge left"></div>
  `;
  document.body.appendChild(root);
  return root;
}

function updateRingTracker(): void {
  const target = checkpoints.targetPosition(race.nextCheckpoint);
  if ((race.state !== 'racing' && race.state !== 'countdown') || !target) {
    setRingTrackerEdges(0, 0, 0, 0);
    return;
  }

  ringTargetWorld.copy(target);
  ringTargetProj.copy(ringTargetWorld).project(camera);
  const inSight = ringTargetProj.z >= -1
    && ringTargetProj.z <= 1
    && Math.abs(ringTargetProj.x) <= 0.94
    && Math.abs(ringTargetProj.y) <= 0.94;
  if (inSight) {
    setRingTrackerEdges(0, 0, 0, 0);
    return;
  }

  ringTargetDir.copy(ringTargetWorld).sub(camera.position);
  if (ringTargetDir.lengthSq() < 0.0001) {
    setRingTrackerEdges(0, 0, 0, 0);
    return;
  }

  ringTargetDir.normalize();
  cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
  cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  cameraForward.set(0, 0, -1).applyQuaternion(camera.quaternion);

  const side = ringTargetDir.dot(cameraRight);
  const vertical = ringTargetDir.dot(cameraUp);
  const forward = ringTargetDir.dot(cameraForward);
  const edgeOverrun = Math.max(Math.abs(ringTargetProj.x), Math.abs(ringTargetProj.y)) - 0.94;
  const offscreen = Math.max(0, Math.min(1, edgeOverrun / 0.7));
  const behind = forward < 0 ? 1 : 0;
  const intensity = 0.22 + Math.max(offscreen, behind) * 0.58;
  const absSide = Math.abs(side);
  const absVertical = Math.abs(vertical);

  if (absSide + absVertical < 0.08) {
    const wrapGlow = intensity * 0.36;
    setRingTrackerEdges(wrapGlow, wrapGlow, wrapGlow, wrapGlow);
    return;
  }

  const horizontalGlow = intensity * (0.22 + absSide * 0.78);
  const verticalGlow = intensity * (0.22 + absVertical * 0.78);
  setRingTrackerEdges(
    vertical > 0 ? verticalGlow : 0,
    side > 0 ? horizontalGlow : 0,
    vertical < 0 ? verticalGlow : 0,
    side < 0 ? horizontalGlow : 0,
  );
}

function setRingTrackerEdges(top: number, right: number, bottom: number, left: number): void {
  ringTracker.style.setProperty('--ring-top', top.toFixed(3));
  ringTracker.style.setProperty('--ring-right', right.toFixed(3));
  ringTracker.style.setProperty('--ring-bottom', bottom.toFixed(3));
  ringTracker.style.setProperty('--ring-left', left.toFixed(3));
}

function injectRingTrackerStyles(): void {
  if (document.getElementById('ring-tracker-styles')) return;
  const style = document.createElement('style');
  style.id = 'ring-tracker-styles';
  style.textContent = `
    #ring-tracker {
      --ring-top: 0;
      --ring-right: 0;
      --ring-bottom: 0;
      --ring-left: 0;
      position: fixed;
      inset: 0;
      z-index: 45;
      pointer-events: none;
    }
    #ring-tracker .ring-edge {
      position: absolute;
      mix-blend-mode: screen;
      transition: opacity 0.08s linear;
    }
    #ring-tracker .top {
      top: 0;
      left: 0;
      right: 0;
      height: 18vh;
      opacity: var(--ring-top);
      background: radial-gradient(ellipse at top center, rgba(74, 163, 255, 0.62), rgba(74, 163, 255, 0.18) 38%, rgba(74, 163, 255, 0) 74%);
    }
    #ring-tracker .right {
      top: 0;
      right: 0;
      bottom: 0;
      width: 18vw;
      opacity: var(--ring-right);
      background: radial-gradient(ellipse at right center, rgba(74, 163, 255, 0.62), rgba(74, 163, 255, 0.18) 38%, rgba(74, 163, 255, 0) 74%);
    }
    #ring-tracker .bottom {
      left: 0;
      right: 0;
      bottom: 0;
      height: 18vh;
      opacity: var(--ring-bottom);
      background: radial-gradient(ellipse at bottom center, rgba(74, 163, 255, 0.62), rgba(74, 163, 255, 0.18) 38%, rgba(74, 163, 255, 0) 74%);
    }
    #ring-tracker .left {
      top: 0;
      left: 0;
      bottom: 0;
      width: 18vw;
      opacity: var(--ring-left);
      background: radial-gradient(ellipse at left center, rgba(74, 163, 255, 0.62), rgba(74, 163, 255, 0.18) 38%, rgba(74, 163, 255, 0) 74%);
    }
  `;
  document.head.appendChild(style);
}

function shortError(message: string): string {
  const compact = message.replace(/\s+/g, ' ').trim();
  return compact.length > REMOTE_ERROR_MAX ? `${compact.slice(0, REMOTE_ERROR_MAX)}...` : compact;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function bar(frac: number, width: number): string {
  const f = Math.max(0, Math.min(1, frac));
  const filled = Math.round(f * width);
  const empty = width - filled;
  return `<span class="bar"><span class="bar-filled">${'█'.repeat(filled)}</span>${'░'.repeat(empty)}</span>`;
}

let toastTimer = 0;
function showToast(text: string, durationMs: number): void {
  toast.textContent = text;
  toast.style.opacity = '1';
  toastTimer = durationMs / 1000;
}

function tickToast(dt: number): void {
  if (toastTimer <= 0) return;
  toastTimer -= dt;
  if (toastTimer <= 0) toast.style.opacity = '0';
}

showToast('DEAD IRON RACING LEAGUE', 2400);
requestAnimationFrame(loop);
