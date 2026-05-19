import * as THREE from 'three';
import { ASTEROID_TUNING, AsteroidField } from './game/asteroids';
import { ContactRegistry } from './game/collision';
import { Energy } from './game/energy';
import { FEEDBACK_TUNING, GravityFeedback } from './game/feedback';
import { GRAVITY_TUNING, sampleGravityAt } from './game/gravity';
import { Input, type ShipCommand } from './game/input';
import { Lifecycle, LIFECYCLE_TUNING } from './game/lifecycle';
import { PICKUP_TUNING, PickupSystem } from './game/pickups';
import { Ship, SHIP_TUNING } from './game/ship';
import { predictTrajectory, type Trajectory } from './game/trajectory';
import { computeModsFromParts, defaultManifest } from './game/upgrades';
import { CheckpointSystem } from './game/racing/checkpoints';
import { RACE_ASTEROID_DEFAULTS, RACE_COURSES, type RaceCourse } from './game/racing/courses';
import {
  createFriendHeatClient,
  formatHeatRemaining,
  type FriendHeatSnapshot,
} from './game/racing/friendHeat';
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
import { THEME_CSS } from './render/theme';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const controls = document.getElementById('controls') as HTMLDivElement;
const padDebug = document.getElementById('pad-debug') as HTMLDivElement;
const fadeOverlay = document.getElementById('fade-overlay') as HTMLDivElement;
const statusBar = document.getElementById('status') as HTMLDivElement;
const toast = document.getElementById('toast') as HTMLDivElement;
const slingshotLogoUrl = `${import.meta.env.BASE_URL}slingshot-logo.svg`;

await initPhysics();

const FIXED_DT = 1 / 120;
const MAX_STEPS_PER_FRAME = 8;
const BASE_POS = new THREE.Vector3(0, 0, 0);
const UI_SETTINGS_KEY = 'slingshot.uiSettings.v1';
const BASE_SHAKE_AMP = FEEDBACK_TUNING.SHAKE_AMP;
const BASE_HAPTIC_MIN = FEEDBACK_TUNING.HAPTIC_MIN;

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
const friendHeat = createFriendHeatClient(leaderboard.getPlayerName());
let friendHeatSnapshot: FriendHeatSnapshot | null = friendHeat?.current ?? null;
const HEAT_DURATION_OPTIONS = [180, 300, 600, 900] as const;
let friendHeatDurationIndex = 1;
let friendJoinCodeInput = '';
let friendBusy = false;
let friendStatusMessage = '';
let raceIsHeatAttempt = false;
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
const topGhostReplay = new GhostReplay(scene, { color: 0x6dd6ff });
const personalGhostReplay = new GhostReplay(scene, { color: 0xff9b32 });

checkpoints.setCourse(selectedCourse);
ship.teleport(selectedCourse.startPosition);
ship.setFrozen(true);
ship.setMods(computeModsFromParts(defaultManifest().parts));
void resolveAndSwapShipVisual();

const lifecycle = new Lifecycle(ship, selectedCourse.startPosition, {
  onDeath: () => {
    crashAutoRestartPending = true;
    audio.destroy();
    audio.setMusicState('silent');
    audio.silence();
    ghostRecorder.reset();
    topGhostReplay.reset();
    personalGhostReplay.reset();
    race.returnToSelect();
    appScene = 'race';
    coursePanel.style.display = 'none';
    showToast('SHIP LOST', 700);
  },
  onRespawn: () => {
    energy.refill();
    ship.refillHp();
    ship.setFrozen(true);
    audio.silence();
    peakSpeed = 0;
    hasPrevVelocity = false;
    if (crashAutoRestartPending) {
      crashAutoRestartPending = false;
      startRace();
    }
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
// Keep the world-space prediction ribbon set aside for debugging. The minimap
// still uses trajectory prediction during normal play.
let panelsVisible = false;
let padDebugVisible = false;
let finishMessage = '';
let leaderboardRefreshSeq = 0;
let goOverlayTimer = 0;
let boostWasActive = false;
let audioThrustDemand = 0;
let audioBoost = 0;

type AppScene = 'title' | 'course' | 'race' | 'pause' | 'invalid' | 'results' | 'settings' | 'friend-entry' | 'friend-lobby' | 'friend-results';

interface UiSettings {
  stickSensitivity: number;
  turnRate: number;
  thrustFeel: number;
  strafeStrength: number;
  boostFeel: number;
  invertPitch: boolean;
  invertYaw: boolean;
  hudScale: number;
  minimapSize: number;
  ghostOpacity: number;
  cameraShake: number;
  rumble: number;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  reducedMotion: boolean;
  colorSafeDanger: boolean;
  graphicsQuality: 'low' | 'medium' | 'high';
}

const DEFAULT_SETTINGS: UiSettings = {
  stickSensitivity: 1,
  turnRate: 1,
  thrustFeel: 1,
  strafeStrength: 1,
  boostFeel: 1,
  invertPitch: false,
  invertYaw: false,
  hudScale: 1,
  minimapSize: 1,
  ghostOpacity: 0.72,
  cameraShake: 1,
  rumble: 1,
  masterVolume: 0.85,
  sfxVolume: 1,
  musicVolume: 0.35,
  reducedMotion: false,
  colorSafeDanger: false,
  graphicsQuality: 'medium',
};

const settings: UiSettings = loadUiSettings();
applyUiSettings();

let appScene: AppScene = 'title';
let previousMenuScene: AppScene = 'course';
let menuMessage = 'Field terminal ready.';
let titleActionIndex = 0;
let courseActionIndex = 0;
let resultsActionIndex = 0;
let invalidActionIndex = 0;
let pauseActionIndex = 0;
let settingsFocusIndex = 0;
let crashAutoRestartPending = false;
let friendEntryFocusIndex = 0;
let friendLobbyFocusIndex = 0;
let friendResultsActionIndex = 0;

function loadUiSettings(): UiSettings {
  try {
    const raw = localStorage.getItem(UI_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      graphicsQuality: parsed.graphicsQuality === 'low' || parsed.graphicsQuality === 'high' ? parsed.graphicsQuality : 'medium',
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveUiSettings(): void {
  try {
    localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('[settings] failed to persist UI settings', err);
  }
}

function applyUiSettings(): void {
  statusBar.style.setProperty('--hud-scale', settings.hudScale.toFixed(2));
  document.documentElement.style.setProperty('--minimap-scale', settings.minimapSize.toFixed(2));
  audio.setMasterVolume(settings.masterVolume);
  audio.setSfxVolume(settings.sfxVolume);
  audio.setMusicVolume(settings.musicVolume);
  topGhostReplay.setOpacity(settings.ghostOpacity);
  personalGhostReplay.setOpacity(settings.ghostOpacity);
  FEEDBACK_TUNING.SHAKE_AMP = BASE_SHAKE_AMP * settings.cameraShake * (settings.reducedMotion ? 0.35 : 1);
  FEEDBACK_TUNING.HAPTIC_MIN = settings.rumble <= 0 ? 99 : BASE_HAPTIC_MIN / Math.max(0.25, settings.rumble);
}

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
const trajectoryStart = new THREE.Vector3();
const ghostViewerPos = new THREE.Vector3();

const coursePanel = document.createElement('div');
coursePanel.id = 'course-select';
document.body.appendChild(coursePanel);
const countdownOverlay = document.createElement('div');
countdownOverlay.id = 'race-countdown';
document.body.appendChild(countdownOverlay);
const ringTracker = createRingTracker();
injectRaceStyles();
renderControls();
controls.style.display = 'none';
hud.style.display = 'none';
padDebug.style.display = 'none';
trajectoryRibbon.setVisible(false);
prepareCourse(selectedCourse);
renderAppScene('Field timing board online.');

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyH' && !e.repeat) {
    setDebugPanelsVisible(!panelsVisible);
  }
  if (e.code === 'KeyO' && !e.repeat) {
    setDebugPanelsVisible(!panelsVisible);
  }
  if (e.code === 'KeyG' && !e.repeat) {
    padDebugVisible = !padDebugVisible;
    padDebug.style.display = panelsVisible && padDebugVisible ? '' : 'none';
  }
});

function setDebugPanelsVisible(visible: boolean): void {
  panelsVisible = visible;
  controls.style.display = panelsVisible ? '' : 'none';
  hud.style.display = panelsVisible ? '' : 'none';
  padDebug.style.display = panelsVisible && padDebugVisible ? '' : 'none';
  trajectoryRibbon.setVisible(panelsVisible);
}

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
    syncGhostRuns(course.id);
    if (race.state !== 'racing' && race.state !== 'countdown') {
      renderAppScene(finishMessage || menuMessage);
    }
  });
  lifecycle.setRespawnPos(course.startPosition);
  ship.teleport(course.startPosition);
  ship.setFrozen(true);
  ship.refillHp();
  energy.refill();
  audio.silence();
  peakSpeed = 0;
  accelMag = 0;
  hasPrevVelocity = false;
  currentZone = 'open';
  gravitySample = sampleGravityAt(course.startPosition, asteroidField.asteroids);
  syncGhostRuns(course.id);
}

function selectCourse(index: number): void {
  if (race.state === 'racing' || race.state === 'countdown') return;
  selectedCourseIndex = (index + RACE_COURSES.length) % RACE_COURSES.length;
  prepareCourse(RACE_COURSES[selectedCourseIndex]);
  race.returnToSelect();
  finishMessage = '';
  menuMessage = 'Course loaded. Pick a launch option.';
  renderAppScene(menuMessage);
}

function startRace(): void {
  raceIsHeatAttempt = false;
  beginRace();
}

function startHeatAttempt(): void {
  if (!friendHeat?.canStartAttempt()) {
    friendStatusMessage = 'Heat timer expired - no new attempts.';
    renderAppScene();
    return;
  }
  raceIsHeatAttempt = true;
  beginRace();
}

function beginRace(): void {
  prepareCourse(selectedCourse);
  race.start(selectedCourse);
  goOverlayTimer = 0;
  ghostRecorder.reset();
  syncGhostRuns(selectedCourse.id);
  coursePanel.style.display = 'none';
  appScene = 'race';
  audio.setMusicState('race');
  audio.raceStart();
  showToast(raceIsHeatAttempt ? 'HEAT ATTEMPT' : 'STAND BY', 900);
}

async function finishRace(): Promise<void> {
  const finish = race.finish;
  if (!finish) return;
  ship.setFrozen(true);
  audio.silence();
  audio.finishTone();
  audio.setMusicState('results');
  const run = ghostRecorder.complete(finish.courseId, finish.timeSec, finish.splits, ship, race.nextCheckpoint);
  const result = await leaderboard.submitRun(run);
  const best = result.record.bestTimeSec;
  const delta = finish.timeSec - best;
  const remote = result.isGlobalBest
    ? ' - leaderboard best'
    : result.remoteError
      ? ` - leaderboard update failed: ${shortError(result.remoteError)}`
      : '';
  let heatNote = '';
  const heatAttempt = raceIsHeatAttempt;
  if (heatAttempt && friendHeat?.current) {
    try {
      await friendHeat.submitRun(run);
      const snap = friendHeat.current;
      if (snap?.lobbyBest && Math.abs(snap.lobbyBest.timeSec - finish.timeSec) < 0.0005) {
        heatNote = ' - lobby best';
      } else {
        heatNote = ' - heat run submitted';
      }
    } catch (err) {
      heatNote = ` - heat submit failed: ${shortError(err instanceof Error ? err.message : String(err))}`;
    }
  }
  finishMessage = `Finish ${formatRaceTime(finish.timeSec)}${result.isPersonalBest ? ' - best run' : ` (${formatDelta(delta)} vs best)`}${remote}${heatNote}`;
  raceIsHeatAttempt = false;
  syncGhostRuns(finish.courseId);
  showToast(finishMessage, 3000);
  appScene = 'results';
  resultsActionIndex = 0;
  renderAppScene(finishMessage, result.record);
  if (heatAttempt && friendHeat?.current) {
    void friendHeat.refresh();
  }
}

function syncGhostRuns(courseId: string): void {
  const heat = friendHeatSnapshot;
  if (heat && heat.lobby.status === 'active' && heat.lobby.courseId === courseId) {
    topGhostReplay.setRun(heat.lobbyBestGhost);
    personalGhostReplay.setRun(null);
    return;
  }
  topGhostReplay.setRun(leaderboard.getTopRecord(courseId)?.bestGhost ?? null);
  personalGhostReplay.setRun(leaderboard.getRecord(courseId)?.bestGhost ?? null);
}

function isFriendHeatScene(scene: AppScene): boolean {
  return scene === 'friend-entry' || scene === 'friend-lobby' || scene === 'friend-results';
}

function selectCourseById(courseId: string): void {
  const idx = RACE_COURSES.findIndex((c) => c.id === courseId);
  if (idx < 0 || idx === selectedCourseIndex) return;
  if (race.state === 'racing' || race.state === 'countdown') return;
  selectedCourseIndex = idx;
  prepareCourse(RACE_COURSES[idx]);
}

friendHeat?.subscribe((snap) => {
  const prevId = friendHeatSnapshot?.lobby.id ?? null;
  const prevStatus = friendHeatSnapshot?.lobby.status ?? null;
  const prevBestId = friendHeatSnapshot?.lobbyBest?.id ?? null;
  friendHeatSnapshot = snap;
  if (snap) {
    if (selectedCourse.id !== snap.lobby.courseId) selectCourseById(snap.lobby.courseId);
    if (snap.lobby.status === 'active' && prevStatus !== 'active' && appScene === 'friend-lobby') {
      friendStatusMessage = 'Heat is live. Start your run when ready.';
    }
    if (snap.lobby.status === 'closed' && appScene === 'friend-lobby') {
      friendStatusMessage = 'Heat closed.';
    }
  } else if (prevId) {
    if (isFriendHeatScene(appScene)) setAppScene('title', 'Heat ended.');
  }
  if (!raceIsHeatAttempt && race.state !== 'racing' && race.state !== 'countdown') {
    syncGhostRuns(selectedCourse.id);
  }
  if (isFriendHeatScene(appScene)) renderAppScene();
  if (prevBestId !== (snap?.lobbyBest?.id ?? null) && snap?.lobbyBest) {
    showToast(`LOBBY BEST ${formatRaceTime(snap.lobbyBest.timeSec)} - ${snap.lobbyBest.playerName}`, 1600);
  }
});

function applyCameraToggle(): void {
  cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
  statusBar.classList.toggle('cockpit', cameraMode === 'cockpit');
  showToast(`CAMERA ${cameraMode.toUpperCase()}`, 800);
}

function setAppScene(scene: AppScene, message = menuMessage): void {
  appScene = scene;
  menuMessage = message;
  if (scene === 'race') {
    coursePanel.style.display = 'none';
    return;
  }
  if (scene === 'results' || scene === 'invalid') audio.setMusicState('results');
  else audio.setMusicState('menu');
  renderAppScene(message);
}

function resumeRace(): void {
  setAppScene('race');
  audio.setMusicState('race');
  audio.resumeTone();
  showToast('RESUME', 500);
}

function pauseRace(): void {
  if (race.state !== 'racing' && race.state !== 'countdown') return;
  pauseActionIndex = 0;
  setAppScene('pause', 'Run paused.');
  audio.silence();
  audio.pauseTone();
  audio.setMusicState('menu');
}

function isSceneHoldingPhysics(): boolean {
  return appScene === 'pause' || (appScene === 'settings' && previousMenuScene === 'pause');
}

function handleAppInput(cmd: ShipCommand): void {
  if (cmd.menuUp || cmd.menuDown || cmd.menuLeft || cmd.menuRight) audio.menuMove();
  if (cmd.menuConfirm || cmd.startRace) audio.menuConfirm();
  if (cmd.menuBack) audio.menuBack();

  if (cmd.courseIndex !== null && race.state !== 'racing' && race.state !== 'countdown') {
    appScene = 'course';
    selectCourse(cmd.courseIndex);
    return;
  }

  if (cmd.restartRace) {
    audio.menuConfirm();
    startRace();
    return;
  }

  if (appScene === 'race') {
    if (cmd.menuPause || cmd.menuBack) pauseRace();
    return;
  }

  if (appScene === 'pause') {
    handlePauseInput(cmd);
    return;
  }

  if (appScene === 'settings') {
    handleSettingsInput(cmd);
    return;
  }

  if (appScene === 'title') {
    handleTitleInput(cmd);
    return;
  }

  if (appScene === 'course') {
    handleCourseInput(cmd);
    return;
  }

  if (appScene === 'results') {
    handleResultsInput(cmd);
    return;
  }

  if (appScene === 'invalid') {
    handleInvalidInput(cmd);
    return;
  }

  if (appScene === 'friend-entry') {
    handleFriendEntryInput(cmd);
    return;
  }

  if (appScene === 'friend-lobby') {
    handleFriendLobbyInput(cmd);
    return;
  }

  if (appScene === 'friend-results') {
    handleFriendResultsInput(cmd);
    return;
  }

}

function handleTitleInput(cmd: ShipCommand): void {
  if (cmd.menuUp) selectCourse(selectedCourseIndex - 1);
  if (cmd.menuDown) selectCourse(selectedCourseIndex + 1);
  if (cmd.menuLeft) titleActionIndex = wrapIndex(titleActionIndex - 1, 3);
  if (cmd.menuRight) titleActionIndex = wrapIndex(titleActionIndex + 1, 3);
  if (!cmd.menuConfirm && !cmd.startRace) {
    if (cmd.menuLeft || cmd.menuRight) renderAppScene();
    return;
  }
  if (titleActionIndex === 0) startRace();
  else if (titleActionIndex === 1) openFriendHeatEntry();
  else {
    previousMenuScene = 'title';
    setAppScene('settings', 'Tune controls and readability.');
  }
}

function handleCourseInput(cmd: ShipCommand): void {
  if (cmd.menuUp) selectCourse(selectedCourseIndex - 1);
  if (cmd.menuDown) selectCourse(selectedCourseIndex + 1);
  if (cmd.menuLeft) courseActionIndex = wrapIndex(courseActionIndex - 1, 3);
  if (cmd.menuRight) courseActionIndex = wrapIndex(courseActionIndex + 1, 3);
  if (cmd.menuBack) {
    setAppScene('title', 'Field terminal ready.');
    return;
  }
  if (cmd.menuConfirm || cmd.startRace) {
    if (courseActionIndex === 0) startRace();
    else if (courseActionIndex === 1) openFriendHeatEntry();
    else {
      previousMenuScene = 'course';
      setAppScene('settings', 'Tune controls and readability.');
    }
    return;
  }
  if (cmd.menuLeft || cmd.menuRight) renderAppScene();
}

function openFriendHeatEntry(): void {
  if (!friendHeat) {
    showToast('Friend Heat needs Supabase config', 1800);
    return;
  }
  friendStatusMessage = '';
  if (friendHeat.current) {
    setAppScene('friend-lobby', 'Lobby restored.');
    return;
  }
  friendEntryFocusIndex = 0;
  friendJoinCodeInput = '';
  setAppScene('friend-entry', 'Private invite-code heat.');
}

function handlePauseInput(cmd: ShipCommand): void {
  if (cmd.menuUp) pauseActionIndex = wrapIndex(pauseActionIndex - 1, 4);
  if (cmd.menuDown) pauseActionIndex = wrapIndex(pauseActionIndex + 1, 4);
  if (cmd.menuBack || cmd.menuPause) {
    resumeRace();
    return;
  }
  if (!cmd.menuConfirm) {
    if (cmd.menuUp || cmd.menuDown) renderAppScene();
    return;
  }
  if (pauseActionIndex === 0) resumeRace();
  else if (pauseActionIndex === 1) startRace();
  else if (pauseActionIndex === 2) {
    previousMenuScene = 'pause';
    setAppScene('settings', 'Tune controls and readability.');
  } else {
    race.returnToSelect();
    ship.setFrozen(true);
    setAppScene('title', 'Field terminal ready.');
  }
}

function handleResultsInput(cmd: ShipCommand): void {
  if (cmd.menuLeft) resultsActionIndex = wrapIndex(resultsActionIndex - 1, 2);
  if (cmd.menuRight) resultsActionIndex = wrapIndex(resultsActionIndex + 1, 2);
  if (cmd.menuBack) {
    setAppScene('course', 'Course board ready.');
    return;
  }
  if (!cmd.menuConfirm && !cmd.startRace) {
    if (cmd.menuLeft || cmd.menuRight) renderAppScene(finishMessage);
    return;
  }
  if (resultsActionIndex === 0) startRace();
  else setAppScene('title', 'Field terminal ready.');
}

async function withFriendBusy(label: string, action: () => Promise<void>): Promise<void> {
  if (friendBusy) return;
  friendBusy = true;
  friendStatusMessage = label;
  renderAppScene();
  try {
    await action();
    if (friendStatusMessage === label) friendStatusMessage = '';
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (/PGRST205|schema cache|friend_heat/.test(raw)) {
      friendStatusMessage = 'Friend Heat tables missing. Apply docs/database/supabase-racing.sql in Supabase.';
    } else {
      friendStatusMessage = `Error: ${shortError(raw)}`;
    }
  } finally {
    friendBusy = false;
    renderAppScene();
  }
}

function friendEntryRowCount(): number {
  return 5;
}

function handleFriendEntryInput(cmd: ShipCommand): void {
  if (!friendHeat) {
    setAppScene('title', 'Friend Heat unavailable.');
    return;
  }
  const rows = friendEntryRowCount();
  if (cmd.menuUp) {
    friendEntryFocusIndex = wrapIndex(friendEntryFocusIndex - 1, rows);
    renderAppScene();
    return;
  }
  if (cmd.menuDown) {
    friendEntryFocusIndex = wrapIndex(friendEntryFocusIndex + 1, rows);
    renderAppScene();
    return;
  }
  if (cmd.menuBack) {
    setAppScene('title', 'Field terminal ready.');
    return;
  }
  if (friendEntryFocusIndex === 0 && (cmd.menuLeft || cmd.menuRight)) {
    selectCourse(selectedCourseIndex + (cmd.menuLeft ? -1 : 1));
    return;
  }
  if (friendEntryFocusIndex === 1 && (cmd.menuLeft || cmd.menuRight)) {
    friendHeatDurationIndex = wrapIndex(friendHeatDurationIndex + (cmd.menuLeft ? -1 : 1), HEAT_DURATION_OPTIONS.length);
    renderAppScene();
    return;
  }
  if (!cmd.menuConfirm && !cmd.startRace) return;
  if (friendEntryFocusIndex === 2) {
    const courseId = selectedCourse.id;
    const dur = HEAT_DURATION_OPTIONS[friendHeatDurationIndex];
    void withFriendBusy('Creating heat...', async () => {
      await friendHeat!.createLobby(courseId, dur);
      setAppScene('friend-lobby', 'Heat created. Share the invite code.');
    });
    return;
  }
  if (friendEntryFocusIndex === 3) {
    const code = friendJoinCodeInput.trim();
    if (!code) {
      friendStatusMessage = 'Enter an invite code.';
      renderAppScene();
      return;
    }
    void withFriendBusy('Joining heat...', async () => {
      await friendHeat!.joinLobby(code);
      setAppScene('friend-lobby', 'Joined heat.');
    });
    return;
  }
  if (friendEntryFocusIndex === 4) {
    setAppScene('title', 'Field terminal ready.');
    return;
  }
}

function friendLobbyOptionCount(): number {
  const snap = friendHeatSnapshot;
  if (!snap) return 1;
  const isHost = friendHeat?.isHost() ?? false;
  if (snap.lobby.status === 'lobby') return isHost ? 3 : 2;
  if (snap.lobby.status === 'active') return 2;
  return 1;
}

function handleFriendLobbyInput(cmd: ShipCommand): void {
  const snap = friendHeatSnapshot;
  if (!snap || !friendHeat) {
    setAppScene('title', 'Lobby closed.');
    return;
  }
  const count = friendLobbyOptionCount();
  if (cmd.menuUp) {
    friendLobbyFocusIndex = wrapIndex(friendLobbyFocusIndex - 1, count);
    renderAppScene();
    return;
  }
  if (cmd.menuDown) {
    friendLobbyFocusIndex = wrapIndex(friendLobbyFocusIndex + 1, count);
    renderAppScene();
    return;
  }
  if (cmd.menuBack) {
    void leaveFriendHeat('Left the heat.');
    return;
  }
  if (!cmd.menuConfirm && !cmd.startRace) return;
  const isHost = friendHeat.isHost();
  if (snap.lobby.status === 'lobby') {
    if (friendLobbyFocusIndex === 0) {
      const me = snap.participants.find((p) => p.playerName === friendHeat.getPlayerName());
      const next = !(me?.ready ?? false);
      void withFriendBusy(next ? 'Marking ready...' : 'Marking unready...', async () => {
        await friendHeat!.setReady(next);
      });
      return;
    }
    if (friendLobbyFocusIndex === 1 && isHost) {
      void withFriendBusy('Starting heat...', async () => {
        await friendHeat!.startHeat();
      });
      return;
    }
    void leaveFriendHeat('Left the heat.');
    return;
  }
  if (snap.lobby.status === 'active') {
    if (friendLobbyFocusIndex === 0) {
      if (!friendHeat.canStartAttempt()) {
        friendStatusMessage = 'Heat timer expired - no new attempts.';
        renderAppScene();
        return;
      }
      startHeatAttempt();
      return;
    }
    void leaveFriendHeat('Left the heat.');
    return;
  }
  void leaveFriendHeat('Heat closed.');
}

function handleFriendResultsInput(cmd: ShipCommand): void {
  if (cmd.menuLeft) friendResultsActionIndex = wrapIndex(friendResultsActionIndex - 1, 1);
  if (cmd.menuRight) friendResultsActionIndex = wrapIndex(friendResultsActionIndex + 1, 1);
  if (cmd.menuBack || cmd.menuConfirm || cmd.startRace) {
    void leaveFriendHeat('Heat closed.');
  }
}

async function leaveFriendHeat(message: string): Promise<void> {
  if (!friendHeat) {
    setAppScene('title', message);
    return;
  }
  try {
    await friendHeat.leaveLobby();
  } catch (err) {
    console.warn('[friend-heat] leave failed', err);
  }
  raceIsHeatAttempt = false;
  syncGhostRuns(selectedCourse.id);
  setAppScene('title', message);
}

function handleInvalidInput(cmd: ShipCommand): void {
  if (cmd.menuLeft || cmd.menuRight) invalidActionIndex = wrapIndex(invalidActionIndex + (cmd.menuLeft ? -1 : 1), 2);
  if (cmd.menuBack) {
    setAppScene('course', 'Course board ready.');
    return;
  }
  if (!cmd.menuConfirm && !cmd.startRace) {
    if (cmd.menuLeft || cmd.menuRight) renderAppScene();
    return;
  }
  if (invalidActionIndex === 0) startRace();
  else setAppScene('course', 'Course board ready.');
}

const SETTINGS_ROWS = [
  'Stick sensitivity',
  'Turn rate',
  'Thrust feel',
  'Strafe strength',
  'Boost response',
  'Invert pitch',
  'Invert yaw',
  'HUD scale',
  'Minimap size',
  'Rival opacity',
  'Camera shake',
  'Rumble',
  'Master volume',
  'SFX volume',
  'Music volume',
  'Reduced motion',
  'Color-safe danger',
  'Graphics quality',
  'Return defaults',
] as const;
const SETTINGS_RESET_INDEX = SETTINGS_ROWS.length - 1;

function handleSettingsInput(cmd: ShipCommand): void {
  if (cmd.menuUp) settingsFocusIndex = wrapIndex(settingsFocusIndex - 1, SETTINGS_ROWS.length);
  if (cmd.menuDown) settingsFocusIndex = wrapIndex(settingsFocusIndex + 1, SETTINGS_ROWS.length);
  if (cmd.menuLeft || cmd.menuRight || cmd.menuConfirm) {
    adjustSetting(settingsFocusIndex, cmd.menuLeft ? -1 : 1);
  }
  if (cmd.menuBack || (cmd.menuPause && previousMenuScene === 'pause')) {
    setAppScene(previousMenuScene, previousMenuScene === 'pause' ? 'Run paused.' : 'Course board ready.');
    return;
  }
  if (cmd.menuUp || cmd.menuDown || cmd.menuLeft || cmd.menuRight || cmd.menuConfirm) renderAppScene();
}

function adjustSetting(index: number, dir: number): void {
  const step = dir >= 0 ? 1 : -1;
  if (index === SETTINGS_RESET_INDEX) {
    resetUiSettings();
    return;
  }
  if (index === 0) settings.stickSensitivity = clamp(settings.stickSensitivity + step * 0.1, 0.5, 1.8);
  else if (index === 1) settings.turnRate = clamp(settings.turnRate + step * 0.1, 0.65, 1.6);
  else if (index === 2) settings.thrustFeel = clamp(settings.thrustFeel + step * 0.1, 0.7, 1.4);
  else if (index === 3) settings.strafeStrength = clamp(settings.strafeStrength + step * 0.1, 0.5, 1.35);
  else if (index === 4) settings.boostFeel = clamp(settings.boostFeel + step * 0.1, 0.7, 1.35);
  else if (index === 5) settings.invertPitch = !settings.invertPitch;
  else if (index === 6) settings.invertYaw = !settings.invertYaw;
  else if (index === 7) {
    settings.hudScale = clamp(settings.hudScale + step * 0.05, 0.8, 1.3);
  } else if (index === 8) settings.minimapSize = clamp(settings.minimapSize + step * 0.1, 0.7, 1.4);
  else if (index === 9) settings.ghostOpacity = clamp(settings.ghostOpacity + step * 0.1, 0.2, 1);
  else if (index === 10) settings.cameraShake = clamp(settings.cameraShake + step * 0.1, 0, 1);
  else if (index === 11) settings.rumble = clamp(settings.rumble + step * 0.1, 0, 1);
  else if (index === 12) settings.masterVolume = clamp(settings.masterVolume + step * 0.05, 0, 1);
  else if (index === 13) settings.sfxVolume = clamp(settings.sfxVolume + step * 0.05, 0, 1);
  else if (index === 14) settings.musicVolume = clamp(settings.musicVolume + step * 0.05, 0, 1);
  else if (index === 15) settings.reducedMotion = !settings.reducedMotion;
  else if (index === 16) settings.colorSafeDanger = !settings.colorSafeDanger;
  else if (index === 17) {
    const qualities: UiSettings['graphicsQuality'][] = ['low', 'medium', 'high'];
    settings.graphicsQuality = qualities[wrapIndex(qualities.indexOf(settings.graphicsQuality) + step, qualities.length)];
  }
  applyUiSettings();
  saveUiSettings();
}

function resetUiSettings(): void {
  Object.assign(settings, DEFAULT_SETTINGS);
  applyUiSettings();
  saveUiSettings();
  showToast('SETTINGS RESTORED', 900);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapIndex(value: number, length: number): number {
  return ((value % length) + length) % length;
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

function applyCommandSettings(cmd: ShipCommand): void {
  cmd.rotate.pitch *= settings.stickSensitivity * settings.turnRate * (settings.invertPitch ? -1 : 1);
  cmd.rotate.yaw *= settings.stickSensitivity * settings.turnRate * (settings.invertYaw ? -1 : 1);
  cmd.rotate.roll *= settings.stickSensitivity * settings.turnRate;
  cmd.look.pitch *= settings.invertPitch ? -1 : 1;
  cmd.look.yaw *= settings.invertYaw ? -1 : 1;
  cmd.thrust.z *= settings.thrustFeel;
  cmd.thrust.x *= settings.strafeStrength;
  cmd.thrust.y *= settings.strafeStrength;
  cmd.boost = clamp(cmd.boost * settings.boostFeel, 0, 1);
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
  handleAppInput(cmd);
  applyCommandSettings(cmd);
  if (isSceneHoldingPhysics()) {
    checkpoints.update(FIXED_DT, race.nextCheckpoint);
    lifecycle.update(FIXED_DT);
    return;
  }
  if (cmd.toggleCameraMode) applyCameraToggle();
  if (cmd.cycleShipVisual && race.state !== 'racing' && race.state !== 'countdown') {
    ship.cycleVariant(1);
    void resolveAndSwapShipVisual();
    showToast(`SHIP ${ship.variantName}`, 1200);
  }

  const raceEvent = race.update(FIXED_DT);
  if (raceEvent.started) {
    ship.setFrozen(false);
    goOverlayTimer = 0.75;
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
  const thrustDemand = Math.max(Math.abs(cmd.thrust.x), Math.abs(cmd.thrust.y), Math.abs(cmd.thrust.z));
  audioThrustDemand = thrustDemand;
  audioBoost = boost;
  if (boost > 0.2 && thrustDemand > 0.08 && !boostWasActive) audio.boostKick();
  boostWasActive = boost > 0.2 && thrustDemand > 0.08;
  const drainMag = boost * thrustDemand * SHIP_TUNING.BOOST_ENERGY_MULT;
  const thrustScale = energy.tick(drainMag, FIXED_DT);
  ship.setThrustScale(thrustScale);
  ship.applyCommand(cmd, FIXED_DT);

  physics.step();
  asteroidField.update(FIXED_DT);
  checkpoints.update(FIXED_DT, race.nextCheckpoint);
  ghostRecorder.update(race.elapsedSec, ship, race.nextCheckpoint);
  ghostViewerPos.set(ship.position.x, ship.position.y, ship.position.z);
  topGhostReplay.update(race.elapsedSec, ghostViewerPos);
  personalGhostReplay.update(race.elapsedSec, ghostViewerPos);

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
      audio.dustImpact(Math.max(0.35, Math.min(1.4, preStepSpeed / 160)));
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
  trajectoryStart.set(0, 0, -2.8).applyQuaternion(ship.mesh.quaternion).add(ship.mesh.position);
  trajectoryRibbon.update(trajectory, trajectoryStart);
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
    ghosts: {
      top: topGhostReplay.position,
      personal: personalGhostReplay.position,
    },
  });
  minimap.render(renderer, settings.minimapSize);
  fadeOverlay.style.opacity = String(lifecycle.fadeAlpha);
  if (panelsVisible && padDebugVisible) renderPadDebug();
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
  if (race.state === 'racing') {
    audio.update(gravitySample.strongestPull, gravitySample.closestClearance, frameDt, 0);
    audio.updateFlight(audioThrustDemand, audioBoost, frameDt);
  } else {
    audio.update(0, Number.POSITIVE_INFINITY, frameDt, 0);
    audio.updateFlight(0, 0, frameDt);
  }
  tickToast(frameDt);
  updateCountdownOverlay(frameDt);
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
      `${asteroidField.asteroids.length} asteroids  rivals ${ghostStatusLabel()}  ${padHint}${lockHint}`;
  }

  requestAnimationFrame(loop);
}

function updateStatus(): void {
  const personalRecord = leaderboard.getRecord(selectedCourse.id);
  const topRecord = leaderboard.getTopRecord(selectedCourse.id);
  const best = personalRecord ? formatRaceTime(personalRecord.bestTimeSec) : '--:--.---';
  const boardBest = topRecord ? formatRaceTime(topRecord.bestTimeSec) : '--:--.---';
  const ePct = Math.round(energy.fraction * 100);
  const energyBar = bar(energy.fraction, 14);
  const hpBar = bar(ship.hpFraction, 10);
  const splitIndex = race.nextCheckpoint - 1;
  const splitDelta = personalRecord && splitIndex >= 0 && personalRecord.bestSplits[splitIndex] !== undefined
    ? formatDelta(race.splits[splitIndex] - personalRecord.bestSplits[splitIndex])
    : '';
  const stateLine =
    race.state === 'countdown' ? `COUNTDOWN ${Math.ceil(race.countdownSec)}` :
    race.state === 'finished' ? finishMessage :
    race.state === 'invalid' ? `INVALID - ${race.invalidReason}` :
    race.state === 'select' ? 'SELECT COURSE' :
    'RACING';

  const gateNow = Math.min(race.nextCheckpoint + 1, selectedCourse.gates.length);
  statusBar.innerHTML = `
    <div class="hud-tile primary"><span>Time</span><b>${formatRaceTime(race.elapsedSec)}</b><em>${stateLine}</em></div>
    <div class="hud-tile"><span>Gate</span><b>${gateNow}/${selectedCourse.gates.length}</b><em>${splitDelta || 'split --'}</em></div>
    <div class="hud-tile"><span>Speed</span><b>${ship.speed.toFixed(0)} m/s</b><em>peak ${peakSpeed.toFixed(0)}</em></div>
    <div class="hud-tile"><span>Energy</span><b>${energyBar} ${ePct}%</b><em>boost ${Math.round(audioBoost * 100)}%</em></div>
    <div class="hud-tile"><span>Hull</span><b>${hpBar}</b><em>${Math.round(ship.hp)} / ${Math.round(ship.hpMax)}</em></div>
    <div class="hud-tile"><span>Records</span><b>PB ${best}</b><em>lead ${boardBest}</em></div>
    <div class="hud-tile danger"><span>Gravity</span><b>${gravitySample.strongestPull.toFixed(1)} m/s2</b><em>${Number.isFinite(gravitySample.closestClearance) ? `${gravitySample.closestClearance.toFixed(0)}m clear` : 'open space'}</em></div>
  `;
}

function updateCountdownOverlay(dt: number): void {
  let text = '';
  if (race.state === 'countdown') {
    text = String(Math.max(1, Math.ceil(race.countdownSec)));
  } else if (goOverlayTimer > 0) {
    text = 'GO';
    goOverlayTimer = Math.max(0, goOverlayTimer - dt);
  }

  countdownOverlay.textContent = text;
  countdownOverlay.classList.toggle('visible', text.length > 0);
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
    <div class="row"><b>Gamepad</b> D-pad strafe</div>
    <div class="row"><b>Gamepad</b> RT/LT thrust/reverse, LB/RB boost</div>
    <div class="row"><b>Gamepad</b> Y cockpit, Select restart, Start pause</div>
    <div class="row"><b>Enter</b> start selected course</div>
    <div class="row"><b>1 / 2 / 3</b> choose course</div>
    <div class="row"><b>R</b> restart run</div>
    <div class="row"><b>W/S</b> thrust / brake</div>
    <div class="row"><b>A/D</b> roll, <b>Q/E</b> yaw</div>
    <div class="row"><b>Space/Ctrl</b> strafe up/down</div>
    <div class="row"><b>Shift</b> boost</div>
    <div class="row"><b>C</b> camera, <b>V</b> ship visual</div>
    <div class="row"><b>P</b> tuning, <b>O</b> panels, <b>G</b> pad debug</div>
  `;
}

function renderAppScene(message = menuMessage, recordOverride?: CourseRecord): void {
  menuMessage = message;
  coursePanel.className = `scene-${appScene}`;
  if (appScene === 'race') {
    coursePanel.style.display = 'none';
    return;
  }

  const html =
    appScene === 'title' ? renderTitleScene(message) :
    appScene === 'course' ? renderCourseBoard(message) :
    appScene === 'pause' ? renderPauseScene() :
    appScene === 'invalid' ? renderInvalidScene(message) :
    appScene === 'results' ? renderResultsScene(recordOverride) :
    appScene === 'friend-entry' ? renderFriendEntryScene(message) :
    appScene === 'friend-lobby' ? renderFriendLobbyScene(message) :
    appScene === 'friend-results' ? renderFriendResultsScene(message) :
    renderSettingsScene(message);

  coursePanel.innerHTML = html;
  coursePanel.style.display = '';
  wireSceneEvents();
  if (appScene === 'settings') scrollSettingsFocusIntoView();
}

function renderTitleScene(_message: string): string {
  return renderStartScreen('title');
}

function renderCourseBoard(_message: string): string {
  return renderStartScreen('course');
}

function renderStartScreen(mode: 'title' | 'course'): string {
  const actionPrefix = mode === 'title' ? 'title-action' : 'course-action';
  const activeAction = mode === 'title' ? titleActionIndex : courseActionIndex;
  const entries = leaderboard.getCourseEntries(selectedCourse.id);
  const record = leaderboard.getRecord(selectedCourse.id);
  const topRecord = leaderboard.getTopRecord(selectedCourse.id);
  const boardBest = topRecord?.bestTimeSec ?? entries[0]?.timeSec ?? null;
  const recordRank = record ? personalRank(record, entries) : null;
  const recordGap = record && boardBest !== null ? formatDelta(record.bestTimeSec - boardBest) : null;

  return `
    <div class="start-screen" role="dialog" aria-label="Slingshot start screen">
      <header class="start-header">
        <div class="start-brand">
          <div class="slingshot-logo" aria-label="Slingshot" style="--logo-url: url('${escapeHtml(slingshotLogoUrl)}')"></div>
          <div class="league-title">Dead Iron Racing League</div>
        </div>
        <div class="pilot-row start-pilot">${pilotInputHtml()}</div>
      </header>
      <main class="start-board">
        <section class="start-course-col" aria-label="Courses">
          <div class="start-section-head">
            <span>Courses</span>
            <em>${RACE_COURSES.length} circuits</em>
          </div>
          <div class="start-course-list">
            ${RACE_COURSES.map((course, index) => startCourseRow(course, index)).join('')}
          </div>
        </section>
        <section class="start-right-col" aria-label="Leaderboard">
          <div class="start-section-head">
            <span>Leaderboard</span>
            <em class="course-head">${escapeHtml(selectedCourse.name)}</em>
          </div>
          <div class="title-board-head">
            <span>#</span>
            <span>Pilot</span>
            <span>Time</span>
          </div>
          ${renderStartLeaderboardEntries(entries, record)}
          <div class="personal-best-bar">
            ${renderRecordComparison(record, topRecord ?? record)}
            <div class="personal-best">
              <span>Personal Best</span>
              ${record ? `
                <b>${formatRaceTime(record.bestTimeSec)}</b>
                <em>${recordRank ? `Rank #${recordRank}` : 'Unranked'}${recordGap ? ` &middot; ${recordGap} off record` : ''}</em>
              ` : `
                <strong>-- no time set --</strong>
                <em>complete a run to post a time</em>
              `}
            </div>
            <div class="start-actions">
              <button id="${actionPrefix}-0" class="launch-action${activeAction === 0 ? ' selected' : ''}">Start Race</button>
              <button id="${actionPrefix}-1" class="utility-action${activeAction === 1 ? ' selected' : ''}">Friend Heat</button>
            </div>
          </div>
        </section>
      </main>
      <div class="menu-hints start-hints">
        <button id="${actionPrefix}-2" class="footer-settings${activeAction === 2 ? ' selected' : ''}">Settings</button>
        <span>D-pad / stick: course</span>
        <span>Left / right: action</span>
        <span>A / Enter: confirm</span>
        <span>B: back</span>
      </div>
    </div>
  `;
}

function renderPauseScene(): string {
  const options = ['Resume', 'Restart run', 'Settings', 'Quit to title']
    .map((label, index) => menuButton(label, index === pauseActionIndex, `pause-action-${index}`)).join('');
  return sceneShell('Paused', selectedCourse.name, `${formatRaceTime(race.elapsedSec)}  Gate ${Math.min(race.nextCheckpoint + 1, selectedCourse.gates.length)}/${selectedCourse.gates.length}`, `
    <div class="center-panel">
      <section class="terminal-panel pause-panel">
        <div class="section-title"><h2>Run Hold</h2><span>Start/B resumes</span></div>
        <div class="action-stack">${options}</div>
      </section>
    </div>
  `);
}

function renderInvalidScene(message: string): string {
  const actions = ['Retry', 'Course board'].map((label, index) => menuButton(label, index === invalidActionIndex, `invalid-action-${index}`)).join('');
  return sceneShell('Run Lost', selectedCourse.name, message || race.invalidReason, `
    <div class="center-panel">
      <section class="terminal-panel lost-panel">
        <div class="section-title"><h2>${escapeHtml(race.invalidReason || 'Wrecked')}</h2><span>${formatRaceTime(race.elapsedSec)}</span></div>
        <p class="field-warning">That rock was pulling hard.</p>
        <div class="scene-actions">${actions}</div>
      </section>
    </div>
  `);
}

function renderResultsScene(recordOverride?: CourseRecord): string {
  const record = recordOverride ?? leaderboard.getRecord(selectedCourse.id);
  const finish = race.finish;
  const entries = leaderboard.getCourseEntries(selectedCourse.id);
  const topRecord = leaderboard.getTopRecord(selectedCourse.id);
  const personalEntry = entries.find((entry) => isPersonalEntry(entry, record)) ?? null;
  const finalTime = finish ? formatRaceTime(finish.timeSec) : '--:--.---';
  const finalSec = finish?.timeSec ?? null;
  const personalBest = record?.bestTimeSec ?? null;
  const playerBoardTime = personalEntry?.timeSec ?? record?.bestTimeSec ?? null;
  const topBoardTime = topRecord?.bestTimeSec ?? entries[0]?.timeSec ?? null;
  const actions = ['Retry', 'Title board']
    .map((label, index) => menuButton(label, index === resultsActionIndex, `results-action-${index}`)).join('');
  return sceneShell('Results', selectedCourse.name, finishMessage || 'Run complete.', `
    <div class="results-layout">
      <section class="terminal-panel result-summary">
        <div class="section-title"><h2>Finish Line</h2><span>${escapeHtml(leaderboard.getPlayerName())}</span></div>
        <div class="big-time">${finalTime}</div>
        <div class="metric-grid">
          ${metricText('Personal best', personalBest !== null ? formatRaceTime(personalBest) : '--:--.---')}
          ${metricText('PB delta', resultDelta(finalSec, personalBest))}
          ${metricText('Your board time', playerBoardTime !== null ? formatRaceTime(playerBoardTime) : '--:--.---')}
          ${metricText('Board delta', resultDelta(finalSec, playerBoardTime))}
          ${metricText('#1 board time', topBoardTime !== null ? formatRaceTime(topBoardTime) : '--:--.---')}
          ${metricText('#1 delta', resultDelta(finalSec, topBoardTime))}
        </div>
        <div class="scene-actions">${actions}</div>
      </section>
      <section class="terminal-panel splits-panel">
        <div class="section-title"><h2>Splits</h2><span>gate deltas</span></div>
        ${renderSplitBreakdown(finish?.splits ?? [], record?.bestSplits ?? [])}
      </section>
    </div>
  `);
}

function renderFriendEntryScene(message: string): string {
  const dur = HEAT_DURATION_OPTIONS[friendHeatDurationIndex];
  const courseRow = friendCycleRow('Course', selectedCourse.name, friendEntryFocusIndex === 0, 'friend-entry-course');
  const durationRow = friendCycleRow('Heat duration', `${Math.round(dur / 60)} min`, friendEntryFocusIndex === 1, 'friend-entry-duration');
  const createRow = friendActionRow('Create heat', `Host an invite-code lobby on ${selectedCourse.name}`, friendEntryFocusIndex === 2, 'friend-entry-create');
  const joinRow = friendJoinRow(friendEntryFocusIndex === 3);
  const backRow = friendActionRow('Back', 'Return to title board', friendEntryFocusIndex === 4, 'friend-entry-back');
  const errorBlock = friendStatusMessage ? `<p class="friend-status">${escapeHtml(friendStatusMessage)}</p>` : '';
  const body = `
    <div class="friend-panel">
      <section class="terminal-panel friend-card">
        <div class="section-title"><h2>Friend Heat</h2><span>private invite-code lobby</span></div>
        <p class="friend-blurb">Race a shared course with friends during a single heat. Only the current lobby-best run becomes the ghost.</p>
        ${errorBlock}
        <div class="friend-row-list">
          ${courseRow}
          ${durationRow}
          ${createRow}
          ${joinRow}
          ${backRow}
        </div>
      </section>
    </div>`;
  return sceneShell('Friend Heat', selectedCourse.name, message, body);
}

function renderFriendLobbyScene(message: string): string {
  const snap = friendHeatSnapshot;
  if (!snap) {
    return sceneShell('Friend Heat', selectedCourse.name, message, `
      <div class="friend-panel">
        <section class="terminal-panel friend-card">
          <p>No active lobby. Returning to title.</p>
        </section>
      </div>`);
  }
  const remaining = friendHeat?.remainingSec() ?? 0;
  const isHost = friendHeat?.isHost() ?? false;
  const statusLabel =
    snap.lobby.status === 'lobby' ? 'WAITING' :
    snap.lobby.status === 'active' ? (remaining > 0 ? 'LIVE' : 'CLOSING') :
    'CLOSED';
  const remainingLabel =
    snap.lobby.status === 'lobby' ? `${Math.round(snap.lobby.heatDurationSec / 60)} min heat` :
    snap.lobby.status === 'active' ? formatHeatRemaining(remaining) :
    '--:--';
  const inviteBlock = `
    <div class="friend-invite">
      <span>Invite code</span>
      <b>${escapeHtml(snap.lobby.inviteCode)}</b>
      <em>${escapeHtml(snap.lobby.courseId)}</em>
    </div>`;
  const timerBlock = `
    <div class="friend-timer">
      <span>${escapeHtml(statusLabel)}</span>
      <b>${escapeHtml(remainingLabel)}</b>
      <em>host ${escapeHtml(snap.lobby.hostName)}${isHost ? ' (you)' : ''}</em>
    </div>`;

  const me = friendHeat?.getPlayerName() ?? '';
  const participantRows = snap.participants.map((p) => `
    <li class="${p.playerName === me ? 'me' : ''}">
      <span>${escapeHtml(p.playerName)}${p.playerName === me ? ' <' : ''}</span>
      <em>${p.ready ? 'READY' : 'standing by'}</em>
      ${p.playerName === snap.lobby.hostName ? '<b>HOST</b>' : '<b></b>'}
    </li>`).join('');

  const runRows = snap.runs.length
    ? snap.runs.map((run, idx) => `
      <li class="${run.playerName === me ? 'me' : ''} rank-${Math.min(idx + 1, 4)}">
        <span>${idx + 1}</span>
        <b>${escapeHtml(run.playerName)}${run.playerName === me ? ' <' : ''}</b>
        <em>${formatRaceTime(run.timeSec)}</em>
      </li>`).join('')
    : '<li class="empty">No heat runs yet.</li>';

  const options = friendLobbyOptions(snap, isHost);
  const optionsHtml = options.map((opt, index) => menuButton(opt.label, index === friendLobbyFocusIndex, `friend-lobby-action-${index}`)).join('');

  const errorBlock = friendStatusMessage ? `<p class="friend-status">${escapeHtml(friendStatusMessage)}</p>` : '';

  const body = `
    <div class="friend-panel friend-lobby-layout">
      <section class="terminal-panel friend-card">
        <div class="section-title"><h2>Lobby</h2><span>private heat</span></div>
        <div class="friend-summary">
          ${inviteBlock}
          ${timerBlock}
        </div>
        ${errorBlock}
        <div class="section-title"><h2>Pilots</h2><span>${snap.participants.length} in lobby</span></div>
        <ul class="friend-participants">${participantRows || '<li class="empty">Waiting...</li>'}</ul>
        <div class="action-stack">${optionsHtml}</div>
      </section>
      <section class="terminal-panel friend-card">
        <div class="section-title"><h2>Heat Board</h2><span>lobby standings</span></div>
        <ol class="friend-runs">${runRows}</ol>
        <p class="friend-tip">Lobby-best ghost loads on next attempt start.</p>
      </section>
    </div>`;
  return sceneShell('Friend Heat', snap.lobby.courseId, message, body);
}

function renderFriendResultsScene(message: string): string {
  const snap = friendHeatSnapshot;
  if (!snap) return sceneShell('Friend Heat', selectedCourse.name, message, '<div class="friend-panel"><section class="terminal-panel friend-card"><p>Heat closed.</p></section></div>');
  const me = friendHeat?.getPlayerName() ?? '';
  const myBest = snap.runs.find((run) => run.playerName === me) ?? null;
  const winner = snap.lobbyBest;
  const runRows = snap.runs.length
    ? snap.runs.map((run, idx) => `
      <li class="${run.playerName === me ? 'me' : ''} rank-${Math.min(idx + 1, 4)}">
        <span>${idx + 1}</span>
        <b>${escapeHtml(run.playerName)}${run.playerName === me ? ' <' : ''}</b>
        <em>${formatRaceTime(run.timeSec)}</em>
      </li>`).join('')
    : '<li class="empty">No completed heat runs.</li>';
  const body = `
    <div class="friend-panel friend-lobby-layout">
      <section class="terminal-panel friend-card">
        <div class="section-title"><h2>Heat Result</h2><span>${escapeHtml(snap.lobby.courseId)}</span></div>
        <div class="friend-summary">
          <div class="friend-timer">
            <span>WINNER</span>
            <b>${winner ? escapeHtml(winner.playerName) : '--'}</b>
            <em>${winner ? formatRaceTime(winner.timeSec) : 'no completed runs'}</em>
          </div>
          <div class="friend-timer">
            <span>YOUR BEST</span>
            <b>${myBest ? formatRaceTime(myBest.timeSec) : '--'}</b>
            <em>${myBest && winner ? formatDelta(myBest.timeSec - winner.timeSec) : ''}</em>
          </div>
        </div>
        <div class="scene-actions">${menuButton('Back to title', true, 'friend-results-action-0')}</div>
      </section>
      <section class="terminal-panel friend-card">
        <div class="section-title"><h2>Heat Board</h2><span>final lobby standings</span></div>
        <ol class="friend-runs">${runRows}</ol>
      </section>
    </div>`;
  return sceneShell('Friend Heat', snap.lobby.courseId, message, body);
}

interface FriendLobbyOption { label: string; }

function friendLobbyOptions(snap: FriendHeatSnapshot, isHost: boolean): FriendLobbyOption[] {
  const remaining = friendHeat?.remainingSec() ?? 0;
  if (snap.lobby.status === 'lobby') {
    const me = snap.participants.find((p) => p.playerName === (friendHeat?.getPlayerName() ?? ''));
    const readyLabel = me?.ready ? 'Stand down' : 'Mark ready';
    const opts: FriendLobbyOption[] = [{ label: readyLabel }];
    if (isHost) opts.push({ label: 'Start heat' });
    opts.push({ label: 'Leave lobby' });
    return opts;
  }
  if (snap.lobby.status === 'active') {
    return [
      { label: remaining > 0 ? 'Start attempt' : 'Heat timer expired' },
      { label: 'Leave lobby' },
    ];
  }
  return [{ label: 'Back to title' }];
}

function friendCycleRow(label: string, value: string, selected: boolean, id: string): string {
  return `<button id="${id}" class="setting-row cycle-row${selected ? ' selected' : ''}">
    <span>${escapeHtml(label)}</span>
    <span class="cycle-value">
      <em class="cycle-arrow" aria-hidden="true">&lsaquo;</em>
      <b>${escapeHtml(value)}</b>
      <em class="cycle-arrow" aria-hidden="true">&rsaquo;</em>
    </span>
  </button>`;
}

function friendActionRow(label: string, hint: string, selected: boolean, id: string): string {
  return `<button id="${id}" class="setting-row${selected ? ' selected' : ''}">
    <span>${escapeHtml(label)}</span>
    <b>${escapeHtml(hint)}</b>
  </button>`;
}

function friendJoinRow(selected: boolean): string {
  return `<div id="friend-entry-join" class="setting-row friend-join-row${selected ? ' selected' : ''}">
    <span>Join with code</span>
    <input id="friend-join-code" maxlength="16" autocomplete="off" spellcheck="false" placeholder="ABC123" value="${escapeHtml(friendJoinCodeInput)}">
  </div>`;
}

function wireFriendSceneEvents(): void {
  if (appScene === 'friend-entry') {
    for (let i = 0; i < friendEntryRowCount(); i++) {
      const ids = ['friend-entry-course', 'friend-entry-duration', 'friend-entry-create', 'friend-entry-join', 'friend-entry-back'];
      const el = coursePanel.querySelector<HTMLElement>(`#${ids[i]}`);
      el?.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).tagName === 'INPUT') return;
        friendEntryFocusIndex = i;
        if (i === 0 || i === 1) {
          handleFriendEntryInput({ ...emptyMenuCommand(), menuRight: true });
          return;
        }
        handleFriendEntryInput({ ...emptyMenuCommand(), menuConfirm: true });
      });
      el?.addEventListener('contextmenu', (event) => {
        if (i !== 0 && i !== 1) return;
        event.preventDefault();
        friendEntryFocusIndex = i;
        handleFriendEntryInput({ ...emptyMenuCommand(), menuLeft: true });
      });
    }
    const codeInput = coursePanel.querySelector<HTMLInputElement>('#friend-join-code');
    codeInput?.addEventListener('input', () => {
      friendJoinCodeInput = codeInput.value.toUpperCase();
      codeInput.value = friendJoinCodeInput;
    });
    codeInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        friendEntryFocusIndex = 3;
        handleFriendEntryInput({ ...emptyMenuCommand(), menuConfirm: true });
      }
    });
  } else if (appScene === 'friend-lobby') {
    const count = friendLobbyOptionCount();
    for (let i = 0; i < count; i++) {
      coursePanel.querySelector<HTMLButtonElement>(`#friend-lobby-action-${i}`)?.addEventListener('click', () => {
        friendLobbyFocusIndex = i;
        handleFriendLobbyInput({ ...emptyMenuCommand(), menuConfirm: true });
      });
    }
  } else if (appScene === 'friend-results') {
    coursePanel.querySelector<HTMLButtonElement>('#friend-results-action-0')?.addEventListener('click', () => {
      friendResultsActionIndex = 0;
      handleFriendResultsInput({ ...emptyMenuCommand(), menuConfirm: true });
    });
  }
}

function renderSettingsScene(message: string): string {
  return `
    <div class="settings-card" role="dialog" aria-label="Settings">
      <header class="settings-card-head">
        <div>
          <div class="league-title">Settings</div>
          <h1>Controls</h1>
          <p>${escapeHtml(message)}</p>
        </div>
        <button class="settings-close" id="settings-back">Back</button>
      </header>
      <section class="terminal-panel settings-panel">
        <div class="section-title"><h2>Precision Controls</h2><span>A toggles, left/right adjusts</span></div>
        <div class="settings-grid">${SETTINGS_ROWS.map((label, index) => settingRow(label, index)).join('')}</div>
      </section>
      <div class="menu-hints"><span>D-pad / stick: move</span><span>A: adjust</span><span>B: back</span><span>Start: pause</span></div>
    </div>
  `;
}

function sceneShell(kicker: string, title: string, message: string, body: string): string {
  return `
    <div class="course-card" role="dialog" aria-label="${escapeHtml(kicker)}">
      <div class="course-header">
        <div>
          <div class="league-title">${escapeHtml(kicker)}</div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(message)}</p>
        </div>
        <div class="pilot-row">
          ${pilotInputHtml()}
          <span>${escapeHtml(connectionLabel())}</span>
        </div>
      </div>
      ${body}
      <div class="menu-hints"><span>D-pad / stick: move</span><span>A: confirm</span><span>B: back</span><span>Start: pause</span></div>
    </div>
  `;
}

function pilotInputHtml(): string {
  return `
    <label for="pilot-name">Callsign</label>
    <input id="pilot-name" maxlength="40" value="${escapeHtml(leaderboard.getPlayerName())}" autocomplete="nickname" spellcheck="false">
  `;
}

function courseButton(course: RaceCourse, index: number, compact = false): string {
  const record = leaderboard.getRecord(course.id);
  const selected = course.id === selectedCourse.id ? ' selected' : '';
  const className = `course-button${selected}${compact ? ' compact' : ''}`;
  return `<button class="${className}" data-course="${index}">
    <span class="course-number">${String(index + 1).padStart(2, '0')}</span>
    <span class="course-main">
      <strong>${escapeHtml(course.name)}</strong>
      <small>${escapeHtml(compact ? biomeLabel(course) : course.summary)}</small>
      <span class="course-meta">
        <em>${record ? formatRaceTime(record.bestTimeSec) : '--:--.---'}</em>
        <em>${course.gates.length} gates</em>
      </span>
    </span>
  </button>`;
}

function startCourseRow(course: RaceCourse, index: number): string {
  const selected = course.id === selectedCourse.id ? ' selected' : '';
  const topRecord = leaderboard.getTopRecord(course.id);
  const personalRecord = leaderboard.getRecord(course.id);
  const best = topRecord?.bestTimeSec ?? personalRecord?.bestTimeSec ?? null;
  return `<button class="start-course-row${selected}" data-course="${index}">
    <span class="start-course-title">
      <em>${String(index + 1).padStart(2, '0')}</em>
      <strong>${escapeHtml(course.name)}</strong>
    </span>
    <small>${escapeHtml(course.summary)}</small>
    <span class="start-course-meta">
      <em>${escapeHtml(difficultyLabel(course))}</em>
      <em>${course.gates.length} gates</em>
      <em>${escapeHtml(gravityLabel(course))}</em>
      <b>${best ? formatRaceTime(best) : '--:--.---'}</b>
    </span>
    <span class="start-course-zone">${escapeHtml(biomeLabel(course))}</span>
  </button>`;
}

void courseButton;

function menuButton(label: string, selected: boolean, id: string): string {
  return `<button id="${id}" class="menu-button${selected ? ' selected' : ''}">${escapeHtml(label)}</button>`;
}

function metricText(label: string, value: string): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`;
}

function resultDelta(finalSec: number | null, targetSec: number | null): string {
  if (finalSec === null || targetSec === null) return '--';
  return formatDelta(finalSec - targetSec);
}

function ratingBlocks(value: number, max: number): string {
  const filled = Math.max(0, Math.min(max, Math.round(value)));
  return `${'█'.repeat(filled)}${'░'.repeat(max - filled)}`;
}

void ratingBlocks;

function renderRecordComparison(record: CourseRecord | null, topRecord: CourseRecord | null): string {
  if (!record && !topRecord) {
    return `<div class="record-compare empty">
      <div class="record-compare-head"><span>Records</span><em>no split graph yet</em></div>
      <div class="record-empty">Finish a clean run to map gate deltas.</div>
    </div>`;
  }

  const latest = record?.recentRuns[0] ?? null;
  const latestSplits = latest?.splits ?? record?.bestSplits ?? [];
  const pbSplits = record?.bestSplits ?? [];
  const leaderSplits = topRecord?.bestSplits ?? [];
  const gateCount = Math.max(latestSplits.length, pbSplits.length, leaderSplits.length, selectedCourse.gates.length);
  const rows = Array.from({ length: gateCount }, (_, index) => {
    const label = index === gateCount - 1 ? 'FIN' : String(index + 1).padStart(2, '0');
    const current = latestSplits[index];
    const pb = pbSplits[index];
    const leader = leaderSplits[index];
    const base = leader ?? pb ?? current ?? 0;
    const currentDelta = current === undefined ? null : current - base;
    const pbDelta = pb === undefined ? null : pb - base;
    const leaderDelta = leader === undefined ? null : leader - base;
    return `<div class="record-row">
      <span>${label}</span>
      ${deltaCell(currentDelta, 'you')}
      ${deltaCell(pbDelta, 'pb')}
      ${deltaCell(leaderDelta, 'lead')}
    </div>`;
  }).join('');
  const graph = renderRecordGraph(latestSplits, pbSplits, leaderSplits);

  return `<div class="record-compare">
    <div class="record-compare-head"><span>Records</span><em>gate deltas</em></div>
    <div class="record-legend"><span class="you">You</span><span class="pb">PB</span><span class="lead">Leader</span></div>
    ${graph}
    <div class="record-table">${rows}</div>
  </div>`;
}

function deltaCell(value: number | null, cls: string): string {
  if (value === null || !Number.isFinite(value)) return `<b class="${cls} muted">--</b>`;
  const label = Math.abs(value) < 0.0005 ? '0.000' : formatDelta(value);
  const sign = value <= 0 ? 'good' : 'bad';
  return `<b class="${cls} ${sign}">${label}</b>`;
}

function renderRecordGraph(latest: readonly number[], pb: readonly number[], leader: readonly number[]): string {
  const count = Math.max(latest.length, pb.length, leader.length, 2);
  const all = [...latest, ...pb, ...leader].filter(Number.isFinite);
  if (all.length < 2) return '<div class="record-graph empty-graph"></div>';
  const max = Math.max(...all, 1);
  const toPoint = (value: number, index: number): string => {
    const x = count <= 1 ? 0 : (index / (count - 1)) * 100;
    const y = 88 - (value / max) * 76;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };
  const poly = (values: readonly number[], cls: string): string => {
    if (values.length < 2) return '';
    return `<polyline class="${cls}" points="${values.map(toPoint).join(' ')}" />`;
  };
  const dots = (values: readonly number[], cls: string): string => values
    .map((value, index) => {
      const [x, y] = toPoint(value, index).split(',');
      return `<circle class="${cls}" cx="${x}" cy="${y}" r="1.7" />`;
    }).join('');
  return `<svg class="record-graph" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <path class="grid" d="M0 12H100M0 50H100M0 88H100M12 0V100M50 0V100M88 0V100" />
    ${poly(leader, 'lead-line')}
    ${poly(pb, 'pb-line')}
    ${poly(latest, 'you-line')}
    ${dots(leader, 'lead-dot')}
    ${dots(pb, 'pb-dot')}
    ${dots(latest, 'you-dot')}
  </svg>`;
}

function connectionLabel(): string {
  const error = leaderboard.getLastRemoteError();
  if (error) return `Board issue: ${shortError(error)}`;
  return leaderboard.isRemoteEnabled() ? 'Shared timing board' : 'Local timing board';
}

function ghostStatusLabel(): string {
  const labels: string[] = [];
  if (leaderboard.getTopRecord(selectedCourse.id)) labels.push('blue');
  if (leaderboard.getRecord(selectedCourse.id)) labels.push('orange');
  return labels.length ? labels.join('+') : '-';
}

function biomeLabel(course: RaceCourse): string {
  if (course.design.biome === 'open-claim-space') return 'Open claim space';
  if (course.design.biome === 'dead-iron-belt') return 'Dead Iron belt';
  return 'Black core field';
}

function difficultyLabel(course: RaceCourse): string {
  if (course.design.difficulty <= 1) return 'Starter';
  if (course.design.difficulty <= 3) return 'Medium';
  return 'Expert';
}

function gravityLabel(course: RaceCourse): string {
  if (course.design.biome === 'open-claim-space') return 'Low';
  if (course.design.biome === 'dead-iron-belt') return 'Moderate';
  return 'Extreme';
}

function renderSplitBreakdown(splits: readonly number[], bestSplits: readonly number[]): string {
  if (splits.length === 0) return '<div class="empty-standings">No split data for this run.</div>';
  return `<ol class="splits-board">${splits.map((split, index) => {
    const delta = bestSplits[index] !== undefined ? formatDelta(split - bestSplits[index]) : '--';
    const gate = selectedCourse.gates[index]?.label ?? (index === splits.length - 1 ? 'Finish' : `Gate ${index + 1}`);
    return `<li><span>${escapeHtml(gate)}</span><b>${formatRaceTime(split)}</b><em>${delta}</em></li>`;
  }).join('')}</ol>`;
}

function renderRecentRuns(record: CourseRecord | null): string {
  if (!record || record.recentRuns.length === 0) return '<div class="empty-standings">No saved runs from this board.</div>';
  return `<ol class="leaderboard recent-runs">${record.recentRuns.slice(0, 6).map((run, index) => `
    <li>
      <span>${index === 0 ? 'PB' : `#${index + 1}`}</span>
      <b>${formatRaceTime(run.timeSec)}</b>
      <em>${escapeHtml(run.playerName ?? leaderboard.getPlayerName())}</em>
    </li>
  `).join('')}</ol>`;
}

void renderRecentRuns;

function settingRow(label: string, index: number): string {
  return `<button class="setting-row${settingsFocusIndex === index ? ' selected' : ''}" data-setting="${index}">
    <span>${escapeHtml(label)}</span>
    <b>${escapeHtml(settingValue(index))}</b>
  </button>`;
}

function scrollSettingsFocusIntoView(): void {
  requestAnimationFrame(() => {
    coursePanel
      .querySelector<HTMLButtonElement>('.setting-row.selected')
      ?.scrollIntoView({ block: 'nearest' });
  });
}

function settingValue(index: number): string {
  if (index === 0) return `${settings.stickSensitivity.toFixed(1)}x`;
  if (index === 1) return `${settings.turnRate.toFixed(1)}x`;
  if (index === 2) return `${settings.thrustFeel.toFixed(1)}x`;
  if (index === 3) return `${Math.round(settings.strafeStrength * 100)}%`;
  if (index === 4) return `${settings.boostFeel.toFixed(1)}x`;
  if (index === 5) return settings.invertPitch ? 'on' : 'off';
  if (index === 6) return settings.invertYaw ? 'on' : 'off';
  if (index === 7) return `${Math.round(settings.hudScale * 100)}%`;
  if (index === 8) return `${Math.round(settings.minimapSize * 100)}%`;
  if (index === 9) return `${Math.round(settings.ghostOpacity * 100)}%`;
  if (index === 10) return `${Math.round(settings.cameraShake * 100)}%`;
  if (index === 11) return `${Math.round(settings.rumble * 100)}%`;
  if (index === 12) return `${Math.round(settings.masterVolume * 100)}%`;
  if (index === 13) return `${Math.round(settings.sfxVolume * 100)}%`;
  if (index === 14) return `${Math.round(settings.musicVolume * 100)}%`;
  if (index === 15) return settings.reducedMotion ? 'on' : 'off';
  if (index === 16) return settings.colorSafeDanger ? 'on' : 'off';
  if (index === SETTINGS_RESET_INDEX) return 'restore';
  return settings.graphicsQuality;
}

function wireSceneEvents(): void {
  coursePanel.querySelectorAll<HTMLButtonElement>('[data-course]').forEach((button) => {
    button.addEventListener('click', () => selectCourse(Number(button.dataset.course ?? '0')));
  });
  const pilotInput = coursePanel.querySelector<HTMLInputElement>('#pilot-name');
  const savePilotName = (): void => {
    if (!pilotInput) return;
    void leaderboard.setPlayerName(pilotInput.value).then(() => {
      pilotInput.value = leaderboard.getPlayerName();
      friendHeat?.setPlayerName(leaderboard.getPlayerName());
      renderAppScene('Callsign saved. New finished runs will use this name.');
    });
  };
  pilotInput?.addEventListener('change', savePilotName);
  pilotInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    pilotInput.blur();
  });
  for (let i = 0; i < 3; i++) {
    coursePanel.querySelector<HTMLButtonElement>(`#title-action-${i}`)?.addEventListener('click', () => {
      titleActionIndex = i;
      handleTitleInput({ ...emptyMenuCommand(), menuConfirm: true });
    });
    coursePanel.querySelector<HTMLButtonElement>(`#course-action-${i}`)?.addEventListener('click', () => {
      courseActionIndex = i;
      handleCourseInput({ ...emptyMenuCommand(), menuConfirm: true });
    });
  }
  wireFriendSceneEvents();
  coursePanel.querySelector<HTMLButtonElement>('#settings-back')?.addEventListener('click', () => {
    handleSettingsInput({ ...emptyMenuCommand(), menuBack: true });
  });
  for (let i = 0; i < 4; i++) {
    coursePanel.querySelector<HTMLButtonElement>(`#pause-action-${i}`)?.addEventListener('click', () => {
      pauseActionIndex = i;
      handlePauseInput({ ...emptyMenuCommand(), menuConfirm: true });
    });
  }
  for (let i = 0; i < 2; i++) {
    coursePanel.querySelector<HTMLButtonElement>(`#results-action-${i}`)?.addEventListener('click', () => {
      resultsActionIndex = i;
      handleResultsInput({ ...emptyMenuCommand(), menuConfirm: true });
    });
  }
  for (let i = 0; i < 2; i++) {
    coursePanel.querySelector<HTMLButtonElement>(`#invalid-action-${i}`)?.addEventListener('click', () => {
      invalidActionIndex = i;
      handleInvalidInput({ ...emptyMenuCommand(), menuConfirm: true });
    });
  }
  coursePanel.querySelectorAll<HTMLButtonElement>('[data-setting]').forEach((button) => {
    button.addEventListener('click', () => {
      settingsFocusIndex = Number(button.dataset.setting ?? '0');
      adjustSetting(settingsFocusIndex, 1);
      renderAppScene();
    });
  });
}

function emptyMenuCommand(): ShipCommand {
  return {
    thrust: { x: 0, y: 0, z: 0 },
    rotate: { pitch: 0, yaw: 0, roll: 0 },
    look: { yaw: 0, pitch: 0 },
    boost: 0,
    fire: false,
    toggleCameraMode: false,
    cycleShipVisual: false,
    toggleHangar: false,
    toggleLock: false,
    restartRace: false,
    startRace: false,
    courseIndex: null,
    courseDelta: 0,
    menuUp: false,
    menuDown: false,
    menuLeft: false,
    menuRight: false,
    menuConfirm: false,
    menuBack: false,
    menuPause: false,
  };
}

function renderLeaderboardEntries(entries: readonly RaceLeaderboardEntry[]): string {
  if (entries.length === 0) return '<div class="empty-standings">No runs for this course yet.</div>';
  return `<ol class="leaderboard">${entries.slice(0, 10).map((entry) => `
    <li>
      <span>#${entry.rank}</span>
      <b>${formatRaceTime(entry.timeSec)}</b>
      <em>${escapeHtml(entry.playerName ?? 'Anonymous Pilot')}</em>
    </li>
  `).join('')}</ol>`;
}

function renderStartLeaderboardEntries(entries: readonly RaceLeaderboardEntry[], record: CourseRecord | null): string {
  if (entries.length === 0) return '<div class="start-empty-board">No runs for this course yet.</div>';
  return `<ol class="title-leaderboard">${entries.slice(0, 10).map((entry) => {
    const isMe = isPersonalEntry(entry, record);
    return `<li class="${isMe ? 'me ' : ''}rank-${Math.min(entry.rank, 4)}">
      <span>${entry.rank}</span>
      <b>${escapeHtml(entry.playerName ?? 'Anonymous Pilot')}${isMe ? ' <' : ''}</b>
      <em>${formatRaceTime(entry.timeSec)}</em>
    </li>`;
  }).join('')}</ol>`;
}

void renderLeaderboardEntries;

function isPersonalEntry(entry: RaceLeaderboardEntry, record: CourseRecord | null): boolean {
  if (!record) return false;
  const sameTime = Math.abs(entry.timeSec - record.bestTimeSec) < 0.001;
  const entryName = (entry.playerName ?? '').trim().toUpperCase();
  const recordName = (record.playerName ?? leaderboard.getPlayerName()).trim().toUpperCase();
  return sameTime && (!entryName || !recordName || entryName === recordName);
}

function personalRank(record: CourseRecord, entries: readonly RaceLeaderboardEntry[]): number | null {
  return entries.find((entry) => isPersonalEntry(entry, record))?.rank ?? null;
}

function injectRaceStyles(): void {
  const themeStyle = document.createElement('style');
  themeStyle.id = 'slingshot-theme';
  themeStyle.textContent = THEME_CSS;
  document.head.appendChild(themeStyle);
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
      min-height: min(760px, calc(100vh - 52px));
      max-height: calc(100vh - 52px);
      overflow-y: auto;
      overflow-x: hidden;
      border: 1px solid rgba(39, 32, 16, 0.95);
      background:
        linear-gradient(180deg, rgba(17, 14, 9, 0.96), rgba(12, 10, 7, 0.92)),
        rgba(12, 10, 7, 0.92);
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
      color: #2a8c80;
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
      color: #ede3cc;
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
      color: #d4921f;
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
    #course-select .controller-help {
      margin-top: 18px;
      padding-top: 14px;
      border-top: 1px solid rgba(121, 225, 214, 0.16);
    }
    #course-select .control-map {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    #course-select .control-map span {
      min-height: 30px;
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(121, 225, 214, 0.16);
      background: rgba(6, 10, 14, 0.42);
      color: #c8c3b7;
      font-size: 12px;
      line-height: 1.15;
      padding: 7px 9px;
      box-sizing: border-box;
    }
    #course-select .control-map b {
      color: #79e1d6;
      font-weight: 900;
      min-width: 46px;
    }
    #course-select button {
      font: inherit;
      color: #ede3cc;
      border: 1px solid #272010;
      background: #0e0b07;
      text-align: left;
      cursor: pointer;
    }
    #course-select button:hover,
    #course-select button:focus-visible {
      border-color: #d4921f;
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
      min-height: 410px;
      align-content: start;
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
      min-height: 410px;
      box-sizing: border-box;
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
      display: flex;
      justify-content: flex-end;
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
    #course-select .terminal-panel {
      min-width: 0;
      border: 1px solid #272010;
      background:
        linear-gradient(180deg, rgba(17, 14, 9, 0.94), rgba(12, 10, 7, 0.9)),
        repeating-linear-gradient(0deg, rgba(212, 146, 31, 0.025), rgba(212, 146, 31, 0.025) 1px, transparent 1px, transparent 5px);
      padding: 14px;
      box-sizing: border-box;
    }
    #course-select .title-grid,
    #course-select .results-layout {
      display: grid;
      grid-template-columns: minmax(0, 0.9fr) minmax(320px, 0.7fr);
      gap: 18px;
      margin-top: 18px;
    }
    #course-select .center-panel {
      min-height: 430px;
      display: grid;
      place-items: center;
      margin-top: 18px;
    }
    #course-select .pause-panel,
    #course-select .lost-panel {
      width: min(560px, 100%);
    }
    #course-select .field-warning {
      margin: 0 0 14px;
      color: #e6d7bd;
      font-size: 14px;
    }
    #course-select .terminal-readout {
      display: grid;
      grid-template-columns: minmax(120px, 0.6fr) minmax(0, 1fr);
      gap: 8px 12px;
      border-top: 1px solid rgba(121, 225, 214, 0.14);
      border-bottom: 1px solid rgba(121, 225, 214, 0.14);
      padding: 12px 0;
      margin: 12px 0;
      color: #bdb6a8;
      font-size: 13px;
    }
    #course-select .terminal-readout b {
      color: #fff8e8;
      font-weight: 800;
      overflow-wrap: anywhere;
    }
    #course-select .metric-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin: 12px 0 16px;
    }
    #course-select .metric {
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(0, 0, 0, 0.2);
      min-height: 48px;
      padding: 8px 10px;
      box-sizing: border-box;
      display: grid;
      gap: 4px;
      align-content: center;
    }
    #course-select .metric span {
      color: rgba(241, 238, 231, 0.62);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    #course-select .metric b {
      color: #fff8e8;
      font-weight: 850;
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #course-select .board-title {
      margin-top: 4px;
    }
    #course-select .action-stack {
      display: grid;
      gap: 10px;
      margin-top: 14px;
    }
    #course-select .scene-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 14px;
    }
    #course-select .menu-button,
    #course-select .setting-row {
      min-height: 40px;
      padding: 9px 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 900;
      font-size: 12px;
      border-left: 4px solid rgba(242, 143, 69, 0.45);
    }
    #course-select .scene-actions .menu-button {
      flex: 1 1 130px;
      text-align: center;
    }
    #course-select .menu-button.selected,
    #course-select .setting-row.selected {
      border-color: rgba(212, 146, 31, 0.9);
      border-left-color: #d4921f;
      background: linear-gradient(90deg, rgba(30, 21, 8, 0.95), rgba(17, 14, 9, 0.92));
      color: #ede3cc;
    }
    #course-select .setting-row {
      width: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      text-transform: none;
      letter-spacing: 0;
    }
    #course-select .setting-row span {
      color: #c8c3b7;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 11px;
    }
    #course-select .setting-row b {
      color: #fff8e8;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #course-select .cycle-row .cycle-value {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--c-text-strong);
    }
    #course-select .cycle-row .cycle-arrow {
      color: var(--c-text-muted);
      font-style: normal;
      font-size: 16px;
      line-height: 1;
      transition: color 120ms ease;
    }
    #course-select .cycle-row.selected .cycle-arrow {
      color: var(--c-accent);
    }
    #course-select .cycle-row:hover .cycle-arrow {
      color: var(--c-accent-bright);
    }
    #course-select .big-time {
      color: #fff8e8;
      font-size: clamp(42px, 8vw, 84px);
      line-height: 1;
      font-weight: 950;
      margin: 10px 0 14px;
      letter-spacing: 0;
    }
    #course-select .splits-board {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 7px;
    }
    #course-select .splits-board li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 94px 70px;
      gap: 10px;
      align-items: center;
      min-height: 34px;
      padding: 0 10px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(255, 255, 255, 0.035);
      color: #c8c3b7;
      font-size: 13px;
    }
    #course-select .splits-board b {
      color: #fff8e8;
    }
    #course-select .splits-board em {
      color: #79e1d6;
      font-style: normal;
      text-align: right;
    }
    #course-select .settings-panel {
      min-height: 0;
      padding: 14px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    #course-select .settings-panel .section-title {
      flex-shrink: 0;
    }
    #course-select .settings-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 7px;
      min-height: 0;
      max-height: none;
      overflow-y: auto;
      padding-right: 6px;
      scrollbar-width: thin;
      scrollbar-color: rgba(212, 146, 31, 0.55) rgba(12, 10, 7, 0.75);
    }
    #course-select .menu-hints {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid rgba(121, 225, 214, 0.16);
    }
    #course-select .menu-hints span {
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(0, 0, 0, 0.22);
      color: rgba(241, 238, 231, 0.68);
      font-size: 11px;
      padding: 5px 7px;
    }
    #course-select .course-grid.compact .course-button {
      min-height: 76px;
      grid-template-columns: 38px minmax(0, 1fr);
    }
    #course-select .course-grid.compact .course-number {
      width: 34px;
      height: 34px;
      font-size: 13px;
    }
    #course-select .course-grid.compact .course-main strong {
      font-size: 15px;
    }
    #course-select.scene-pause,
    #course-select.scene-invalid,
    #course-select.scene-results {
      background: linear-gradient(90deg, rgba(3, 6, 10, 0.68), rgba(3, 6, 10, 0.32) 50%, rgba(3, 6, 10, 0.66));
      backdrop-filter: blur(2px);
      font-family: "IBM Plex Mono", ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace;
    }
    #course-select.scene-pause .course-card,
    #course-select.scene-invalid .course-card {
      width: min(720px, 100%);
      min-height: 0;
      max-height: calc(100vh - 52px);
    }
    #course-select.scene-pause .center-panel,
    #course-select.scene-invalid .center-panel {
      min-height: 0;
      place-items: stretch;
    }
    #course-select.scene-settings {
      place-items: center;
      padding: 18px;
      background: linear-gradient(90deg, rgba(3, 6, 10, 0.72), rgba(3, 6, 10, 0.32) 50%, rgba(3, 6, 10, 0.7));
      backdrop-filter: blur(2px);
      font-family: "IBM Plex Mono", ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace;
    }
    #course-select .settings-card {
      width: min(620px, calc(100vw - 36px));
      max-height: calc(100vh - 36px);
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: 12px;
      border: 1px solid #272010;
      background:
        linear-gradient(180deg, rgba(17, 14, 9, 0.96), rgba(12, 10, 7, 0.93)),
        repeating-linear-gradient(0deg, rgba(212, 146, 31, 0.025), rgba(212, 146, 31, 0.025) 1px, transparent 1px, transparent 5px);
      box-shadow: 0 24px 90px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(237, 227, 204, 0.04);
      padding: 16px;
      box-sizing: border-box;
      overflow: hidden;
      color: #ede3cc;
      font-family: "IBM Plex Mono", ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace;
    }
    #course-select .settings-card-head {
      min-width: 0;
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 14px;
      padding-bottom: 12px;
      border-bottom: 1px solid #272010;
    }
    #course-select .settings-card-head h1 {
      margin: 4px 0 4px;
      color: #ede3cc;
      font-size: clamp(28px, 4vw, 44px);
      line-height: 0.96;
      font-weight: 900;
    }
    #course-select .settings-card-head p {
      margin: 0;
      color: #6e6250;
      font-size: 12px;
    }
    #course-select .settings-close {
      min-height: 34px;
      padding: 8px 12px;
      border: 1px solid #272010;
      background: #0e0b07;
      color: #6e6250;
      font: 700 11px "IBM Plex Mono", ui-monospace, monospace;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      text-align: center;
    }
    #course-select .settings-close:hover,
    #course-select .settings-close:focus-visible {
      color: #ede3cc;
      border-color: #d4921f;
    }
    @media (max-width: 900px) {
      #course-select {
        padding: 14px;
        place-items: start center;
      }
      #course-select .course-card {
        min-height: min(760px, calc(100vh - 28px));
        max-height: calc(100vh - 28px);
        padding: 16px;
      }
      #course-select .course-header,
      #course-select .course-layout,
      #course-select .course-footer,
      #course-select .title-grid,
      #course-select .results-layout {
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
      #course-select .control-map {
        grid-template-columns: 1fr;
      }
      #course-select .center-panel {
        min-height: 320px;
      }
      #course-select .settings-card {
        width: calc(100vw - 28px);
        max-height: calc(100vh - 28px);
        padding: 14px;
      }
      #course-select .settings-card-head {
        align-items: stretch;
        flex-direction: column;
      }
      #course-select .settings-close {
        width: 100%;
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
    #course-select.scene-title,
    #course-select.scene-course {
      display: block;
      padding: 0;
      background: #0c0a07;
      color: #ede3cc;
      font-family: "IBM Plex Mono", ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace;
    }
    #course-select.scene-title .start-screen,
    #course-select.scene-course .start-screen {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background:
        radial-gradient(circle at 72% 14%, rgba(42, 140, 128, 0.08), transparent 28%),
        linear-gradient(180deg, rgba(12, 10, 7, 0.96), #0c0a07);
    }
    #course-select .start-header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 18px;
      padding: 18px 22px 12px;
      flex-shrink: 0;
    }
    #course-select .start-brand {
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    #course-select .start-header .league-title {
      color: #2a8c80;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.22em;
      margin: 8px 0 0;
      text-transform: uppercase;
      text-align: center;
    }
    #course-select .slingshot-logo {
      width: clamp(300px, 42vw, 540px);
      height: clamp(54px, 7.8vw, 94px);
      background: #ede3cc;
      -webkit-mask: var(--logo-url) center center / contain no-repeat;
      mask: var(--logo-url) center center / contain no-repeat;
    }
    #course-select .start-pilot {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      min-width: 190px;
      color: #6e6250;
      font-size: 11px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }
    #course-select .start-pilot label {
      color: #6e6250;
      font-weight: 400;
      letter-spacing: 0.2em;
    }
    #course-select .start-pilot input {
      width: 180px;
      min-width: 0;
      padding: 3px 0;
      border: 0;
      border-bottom: 1.5px solid #d4921f;
      background: transparent;
      color: #ede3cc;
      font: 700 16px "IBM Plex Mono", ui-monospace, monospace;
      letter-spacing: 0.07em;
      text-align: right;
      text-transform: uppercase;
    }
    #course-select .start-pilot input:focus {
      outline: none;
      border-bottom-color: #f0b33d;
    }
    #course-select .start-board {
      display: flex;
      flex: 1;
      min-height: 0;
      margin: 0 22px 18px;
      border: 1px solid #272010;
      overflow: hidden;
      background: #110e09;
    }
    #course-select .start-course-col {
      width: 31%;
      min-width: 278px;
      display: flex;
      flex-direction: column;
      border-right: 1px solid #272010;
      overflow: hidden;
    }
    #course-select .start-right-col {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    #course-select .start-section-head {
      min-height: 34px;
      padding: 8px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid #272010;
      background: #110e09;
      flex-shrink: 0;
    }
    #course-select .start-section-head span {
      color: #6e6250;
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    #course-select .start-section-head em {
      color: #3e3428;
      font-size: 11px;
      font-style: normal;
      white-space: nowrap;
    }
    #course-select .start-section-head .course-head {
      color: #2a8c80;
      letter-spacing: 0.04em;
    }
    #course-select .start-course-list,
    #course-select .title-leaderboard {
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.14) transparent;
    }
    #course-select .start-course-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }
    #course-select .start-course-row {
      width: 100%;
      min-height: 132px;
      display: grid;
      gap: 7px;
      padding: 14px 16px;
      border: 0;
      border-bottom: 1px solid #272010;
      border-left: 3px solid transparent;
      background: #110e09;
      color: #ede3cc;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    #course-select .start-course-row:nth-child(even) {
      background: #0e0b07;
    }
    #course-select .start-course-row.selected {
      border-left-color: #d4921f;
      background: #1e1508;
    }
    #course-select .start-course-row:hover,
    #course-select .start-course-row:focus-visible {
      outline: none;
      background: #1a1309;
    }
    #course-select .start-course-title {
      display: flex;
      align-items: baseline;
      gap: 7px;
      min-width: 0;
    }
    #course-select .start-course-title em {
      color: #3e3428;
      font-size: 11px;
      font-style: normal;
      font-weight: 700;
    }
    #course-select .start-course-row.selected .start-course-title em {
      color: #d4921f;
    }
    #course-select .start-course-title strong {
      min-width: 0;
      color: #ede3cc;
      font-size: 15px;
      font-weight: 700;
      line-height: 1.2;
    }
    #course-select .start-course-row small {
      color: #6e6250;
      font-size: 12px;
      line-height: 1.45;
    }
    #course-select .start-course-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      color: #3e3428;
      font-size: 11px;
    }
    #course-select .start-course-meta em,
    #course-select .start-course-meta b {
      color: inherit;
      font-style: normal;
      font-weight: 400;
    }
    #course-select .start-course-row.selected .start-course-meta b {
      color: #d4921f;
      font-weight: 700;
    }
    #course-select .start-course-zone {
      color: #3e3428;
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    #course-select .title-board-head,
    #course-select .title-leaderboard li {
      display: grid;
      grid-template-columns: 26px minmax(0, 1fr) 80px;
      align-items: center;
    }
    #course-select .title-board-head {
      padding: 5px 14px;
      border-bottom: 1px solid #272010;
      background: #110e09;
      color: #3e3428;
      font-size: 11px;
      flex-shrink: 0;
    }
    #course-select .title-board-head span:last-child {
      text-align: right;
    }
    #course-select .title-leaderboard {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      margin: 0;
      padding: 0;
      list-style: none;
      background: #0c0a07;
    }
    #course-select .title-leaderboard li {
      min-height: 34px;
      padding: 7px 14px;
      border-bottom: 1px solid #272010;
      background: #110e09;
      color: #ede3cc;
      font-size: 13px;
    }
    #course-select .title-leaderboard li:nth-child(even) {
      background: #0e0b07;
    }
    #course-select .title-leaderboard li.me {
      background: #1e1508;
    }
    #course-select .title-leaderboard span {
      color: #3e3428;
      font-weight: 700;
    }
    #course-select .title-leaderboard .rank-1 span,
    #course-select .title-leaderboard .rank-1 em {
      color: #d4921f;
    }
    #course-select .title-leaderboard .rank-2 span {
      color: #7e7060;
    }
    #course-select .title-leaderboard .rank-3 span {
      color: #9b4232;
    }
    #course-select .title-leaderboard b {
      min-width: 0;
      overflow: hidden;
      color: #ede3cc;
      font-weight: 400;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #course-select .title-leaderboard li.me b {
      color: #d4921f;
      font-weight: 700;
    }
    #course-select .title-leaderboard em {
      color: #ede3cc;
      font-style: normal;
      font-weight: 700;
      text-align: right;
    }
    #course-select .start-empty-board {
      flex: 1;
      min-height: 0;
      padding: 18px 14px;
      border-bottom: 1px solid #272010;
      background: #0e0b07;
      color: #3e3428;
      font-size: 14px;
    }
    #course-select .personal-best-bar {
      display: grid;
      grid-template-columns: minmax(320px, 0.95fr) minmax(210px, 0.72fr) auto;
      align-items: stretch;
      gap: 12px;
      padding: 12px 16px;
      border-top: 1px solid #272010;
      background: #110e09;
      flex-shrink: 0;
    }
    #course-select .record-compare {
      min-width: 0;
      border: 1px solid #272010;
      background: #0c0a07;
      display: grid;
      grid-template-columns: minmax(150px, 0.72fr) minmax(140px, 0.7fr);
      grid-template-rows: auto auto minmax(76px, 1fr);
      gap: 6px 10px;
      padding: 9px;
      box-sizing: border-box;
    }
    #course-select .record-compare-head {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      color: #6e6250;
      font-size: 10px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    #course-select .record-compare-head em {
      color: #3e3428;
      font-style: normal;
      letter-spacing: 0.08em;
    }
    #course-select .record-legend {
      grid-column: 1 / -1;
      display: flex;
      gap: 10px;
      color: #6e6250;
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    #course-select .record-legend span::before {
      content: "";
      display: inline-block;
      width: 13px;
      height: 2px;
      margin-right: 5px;
      vertical-align: middle;
      background: currentColor;
    }
    #course-select .record-legend .you,
    #course-select .record-row .you { color: #d4921f; }
    #course-select .record-legend .pb,
    #course-select .record-row .pb { color: #ede3cc; }
    #course-select .record-legend .lead,
    #course-select .record-row .lead { color: #2a8c80; }
    #course-select .record-graph {
      width: 100%;
      height: 100%;
      min-height: 78px;
      border: 1px solid #272010;
      background: linear-gradient(180deg, rgba(42, 140, 128, 0.045), rgba(0, 0, 0, 0.08));
    }
    #course-select .record-graph .grid {
      fill: none;
      stroke: rgba(110, 98, 80, 0.28);
      stroke-width: 0.45;
      vector-effect: non-scaling-stroke;
    }
    #course-select .record-graph polyline {
      fill: none !important;
      stroke-width: 1.8;
      stroke-linejoin: round;
      stroke-linecap: round;
      vector-effect: non-scaling-stroke;
    }
    #course-select .record-graph circle {
      stroke: none;
      vector-effect: non-scaling-stroke;
    }
    #course-select .record-graph polyline.you-line { stroke: var(--c-accent); }
    #course-select .record-graph circle.you-dot { fill: var(--c-accent); }
    #course-select .record-graph polyline.pb-line { stroke: var(--c-text); opacity: 0.75; }
    #course-select .record-graph circle.pb-dot { fill: var(--c-text); opacity: 0.85; }
    #course-select .record-graph polyline.lead-line { stroke: var(--c-teal); }
    #course-select .record-graph circle.lead-dot { fill: var(--c-teal); }
    #course-select .record-table {
      min-height: 0;
      max-height: 96px;
      overflow: hidden;
      display: grid;
      align-content: start;
      border: 1px solid #272010;
    }
    #course-select .record-row {
      min-height: 18px;
      display: grid;
      grid-template-columns: 28px repeat(3, minmax(0, 1fr));
      align-items: center;
      gap: 6px;
      padding: 0 6px;
      border-bottom: 1px solid #1c170f;
      color: #6e6250;
      font-size: 10px;
    }
    #course-select .record-row b {
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #course-select .record-row .good { filter: brightness(1.12); }
    #course-select .record-row .bad { color: #9b4232; }
    #course-select .record-row .muted { color: #3e3428; }
    #course-select .record-empty {
      grid-column: 1 / -1;
      min-height: 86px;
      display: grid;
      place-items: center;
      color: #3e3428;
      font-size: 12px;
    }
    #course-select .personal-best {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    #course-select .personal-best span {
      color: #6e6250;
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    #course-select .personal-best b {
      color: #d4921f;
      font-family: Orbitron, "Arial Black", system-ui, sans-serif;
      font-size: 34px;
      font-weight: 700;
      letter-spacing: 0.06em;
      line-height: 1;
    }
    #course-select .personal-best strong {
      color: #3e3428;
      font-size: 17px;
      font-weight: 400;
    }
    #course-select .personal-best em {
      color: #3e3428;
      font-size: 11px;
      font-style: normal;
    }
    #course-select .start-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-shrink: 0;
    }
    #course-select .launch-action,
    #course-select .utility-action {
      border: 0;
      font: 700 11px "IBM Plex Mono", ui-monospace, monospace;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      cursor: pointer;
    }
    #course-select .launch-action {
      min-height: 41px;
      padding: 12px 28px;
      background: #d4921f;
      color: #0c0a07;
    }
    #course-select .utility-action {
      min-height: 34px;
      padding: 9px 12px;
      border: 1px solid #272010;
      background: #0e0b07;
      color: #6e6250;
    }
    #course-select .launch-action:hover,
    #course-select .utility-action:hover {
      opacity: 0.88;
    }
    #course-select .launch-action.selected,
    #course-select .utility-action.selected {
      outline: 1px solid #2a8c80;
      outline-offset: 2px;
    }
    #course-select .start-hints {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      margin: 0 22px 14px;
      padding: 0;
      border: 0;
      flex-shrink: 0;
    }
    #course-select .start-hints span,
    #course-select .footer-settings {
      border-color: #272010;
      background: #0e0b07;
      color: #6e6250;
    }
    #course-select .footer-settings {
      min-height: 30px;
      padding: 6px 10px;
      border: 1px solid #272010;
      font: 700 11px "IBM Plex Mono", ui-monospace, monospace;
      letter-spacing: 0.1em;
      text-align: center;
      text-transform: uppercase;
      cursor: pointer;
    }
    #course-select .footer-settings.selected {
      color: #ede3cc;
      border-color: #2a8c80;
      outline: 1px solid #2a8c80;
      outline-offset: 2px;
    }
    @media (max-width: 760px) {
      #course-select.scene-title,
      #course-select.scene-course {
        overflow-y: auto;
      }
      #course-select.scene-title .start-screen,
      #course-select.scene-course .start-screen {
        min-height: 100%;
        height: auto;
        overflow: visible;
      }
      #course-select .start-header,
      #course-select .personal-best-bar {
        align-items: stretch;
        flex-direction: column;
        grid-template-columns: 1fr;
      }
      #course-select .record-compare {
        grid-template-columns: 1fr;
      }
      #course-select .start-pilot {
        align-items: flex-start;
        min-width: 0;
      }
      #course-select .start-pilot input {
        width: min(260px, 100%);
        text-align: left;
      }
      #course-select .start-board {
        flex-direction: column;
        overflow: visible;
      }
      #course-select .start-course-col {
        width: 100%;
        min-width: 0;
        border-right: 0;
        border-bottom: 1px solid #272010;
      }
      #course-select .start-course-list,
      #course-select .title-leaderboard {
        max-height: none;
        overflow: visible;
      }
      #course-select .start-actions {
        justify-content: stretch;
        flex-wrap: wrap;
      }
      #course-select .launch-action,
      #course-select .utility-action {
        flex: 1 1 150px;
        text-align: center;
      }
    }
    #course-select .friend-panel {
      display: grid;
      gap: 14px;
      margin-top: 14px;
    }
    #course-select .friend-lobby-layout {
      grid-template-columns: minmax(0, 1fr) minmax(280px, 0.7fr);
    }
    @media (max-width: 900px) {
      #course-select .friend-lobby-layout {
        grid-template-columns: 1fr;
      }
    }
    #course-select .friend-card .friend-blurb,
    #course-select .friend-card .friend-tip {
      color: #c8c3b7;
      margin: 6px 0 10px;
      font-size: 13px;
      line-height: 1.45;
    }
    #course-select .friend-card .friend-status {
      color: #f28f45;
      margin: 0 0 8px;
      font-size: 12px;
    }
    #course-select .friend-row-list {
      display: grid;
      gap: 8px;
    }
    #course-select .friend-join-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 200px;
      gap: 12px;
      align-items: center;
      min-height: 40px;
      padding: 9px 12px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(255, 255, 255, 0.035);
      border-left: 4px solid rgba(242, 143, 69, 0.45);
      color: #ede3cc;
    }
    #course-select .friend-join-row.selected {
      border-color: rgba(212, 146, 31, 0.9);
      border-left-color: #d4921f;
      background: linear-gradient(90deg, rgba(30, 21, 8, 0.95), rgba(17, 14, 9, 0.92));
    }
    #course-select .friend-join-row span {
      color: #c8c3b7;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 11px;
    }
    #course-select .friend-join-row input {
      width: 100%;
      border: 1px solid rgba(121, 225, 214, 0.42);
      background: rgba(2, 4, 8, 0.62);
      color: #fff8e8;
      padding: 8px 10px;
      font: 700 14px "IBM Plex Mono", ui-monospace, monospace;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    #course-select .friend-summary {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin: 8px 0 12px;
    }
    #course-select .friend-invite,
    #course-select .friend-timer {
      border: 1px solid rgba(121, 225, 214, 0.22);
      background: rgba(6, 10, 14, 0.42);
      padding: 10px 12px;
      display: grid;
      gap: 4px;
    }
    #course-select .friend-invite span,
    #course-select .friend-timer span {
      color: #6e6250;
      font-size: 11px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    #course-select .friend-invite b {
      font: 900 22px "IBM Plex Mono", ui-monospace, monospace;
      letter-spacing: 0.22em;
      color: #d4921f;
    }
    #course-select .friend-timer b {
      font: 800 22px "IBM Plex Mono", ui-monospace, monospace;
      color: #79e1d6;
    }
    #course-select .friend-invite em,
    #course-select .friend-timer em {
      color: #c8c3b7;
      font-style: normal;
      font-size: 12px;
    }
    #course-select .friend-participants {
      list-style: none;
      margin: 0 0 12px;
      padding: 0;
      display: grid;
      gap: 6px;
    }
    #course-select .friend-participants li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 10px;
      align-items: center;
      min-height: 30px;
      padding: 4px 10px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(255, 255, 255, 0.035);
      color: #ede3cc;
      font-size: 13px;
    }
    #course-select .friend-participants li.me {
      background: #1e1508;
      border-color: #d4921f;
    }
    #course-select .friend-participants li.empty {
      color: #6e6250;
      grid-template-columns: 1fr;
    }
    #course-select .friend-participants em {
      color: #79e1d6;
      font-style: normal;
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    #course-select .friend-participants b {
      color: #d4921f;
      font-size: 10px;
      letter-spacing: 0.16em;
    }
    #course-select .friend-runs {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 6px;
    }
    #course-select .friend-runs li {
      display: grid;
      grid-template-columns: 28px minmax(0, 1fr) 90px;
      gap: 10px;
      align-items: center;
      min-height: 30px;
      padding: 4px 10px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(255, 255, 255, 0.035);
      color: #ede3cc;
      font-size: 13px;
    }
    #course-select .friend-runs li.me {
      background: #1e1508;
      border-color: #d4921f;
    }
    #course-select .friend-runs li.empty {
      grid-template-columns: 1fr;
      color: #6e6250;
    }
    #course-select .friend-runs span {
      color: #6e6250;
      font-weight: 700;
    }
    #course-select .friend-runs b {
      font-weight: 400;
      color: #ede3cc;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #course-select .friend-runs em {
      color: #79e1d6;
      font-style: normal;
      font-weight: 700;
      text-align: right;
    }
    #course-select .friend-runs li.rank-1 span,
    #course-select .friend-runs li.rank-1 em {
      color: #d4921f;
    }
    /* ===================================================================
     * Aesthetic consistency overlay
     * Brings non-start scenes (pause, results, invalid, friend-*, settings)
     * in line with the start-screen's monochrome Amber Iron claim board.
     * =================================================================== */
    #course-select {
      color: var(--c-text);
      font-family: var(--font-display);
      background:
        linear-gradient(180deg, rgba(7, 6, 10, 0.86), rgba(7, 6, 10, 0.62) 48%, rgba(7, 6, 10, 0.86)),
        radial-gradient(circle at 70% 12%, rgba(42, 140, 128, 0.06), transparent 32%),
        #07060a;
    }
    #course-select .course-card {
      background: var(--c-bg-1);
      border-color: var(--c-border);
      box-shadow: var(--shadow-panel);
    }
    #course-select .course-header {
      border-bottom-color: var(--c-border);
    }
    #course-select .league-title {
      color: var(--c-teal);
      letter-spacing: var(--ls-label);
      font-weight: var(--fw-bold);
    }
    #course-select h1 {
      color: var(--c-text-strong);
      font-weight: var(--fw-heavy);
      letter-spacing: var(--ls-tight);
    }
    #course-select p {
      color: var(--c-text-muted);
      font-size: var(--fs-body);
    }
    #course-select .terminal-panel {
      border-color: var(--c-border);
      background:
        linear-gradient(180deg, rgba(17, 14, 9, 0.96), rgba(12, 10, 7, 0.94)),
        var(--scanlines);
    }
    /* Section header bars: cleaner stripe with eyebrow + meta */
    #course-select .section-title {
      align-items: baseline;
      gap: 12px;
      padding-bottom: 8px;
      margin-bottom: 12px;
      border-bottom: 1px solid var(--c-border);
    }
    #course-select .section-title h2 {
      color: var(--c-text-muted);
      font-size: var(--fs-mini);
      font-weight: var(--fw-bold);
      letter-spacing: var(--ls-label);
    }
    #course-select .section-title span {
      color: var(--c-text-faint);
      font-size: var(--fs-mini);
      letter-spacing: 0.08em;
    }
    /* Pilot row: monochrome callsign matching start screen */
    #course-select .pilot-row {
      grid-template-columns: minmax(0, 1fr);
      gap: 4px;
      color: var(--c-text-muted);
      font-size: var(--fs-mini);
      letter-spacing: var(--ls-label);
      text-transform: uppercase;
      text-align: right;
    }
    #course-select .pilot-row label {
      color: var(--c-text-muted);
      font-weight: var(--fw-text);
      letter-spacing: var(--ls-label);
    }
    #course-select .pilot-row input {
      border: 0;
      border-bottom: 1.5px solid var(--c-accent);
      background: transparent;
      color: var(--c-text);
      padding: 4px 0;
      font: var(--fw-bold) var(--fs-md) var(--font-mono);
      letter-spacing: 0.06em;
      text-align: right;
      text-transform: uppercase;
    }
    #course-select .pilot-row input:focus {
      outline: none;
      border-bottom-color: var(--c-accent-bright);
    }
    #course-select .pilot-row span {
      color: var(--c-text-faint);
      font-size: var(--fs-mini);
      letter-spacing: 0.12em;
    }
    /* Unified menu / setting / scene action buttons */
    #course-select .menu-button,
    #course-select .setting-row {
      min-height: 42px;
      padding: 10px 14px;
      border: 1px solid var(--c-border);
      border-left: 3px solid transparent;
      background: var(--c-bg-2);
      color: var(--c-text);
      font: var(--fw-bold) var(--fs-mini) var(--font-mono);
      letter-spacing: var(--ls-button);
      text-transform: uppercase;
      transition: background-color 120ms ease, border-color 120ms ease;
    }
    #course-select .menu-button:hover,
    #course-select .setting-row:hover {
      background: var(--c-bg-3);
      border-color: var(--c-border-strong);
    }
    #course-select .menu-button.selected,
    #course-select .setting-row.selected {
      background: var(--c-bg-4);
      border-color: var(--c-border-strong);
      border-left-color: var(--c-accent);
      color: var(--c-text-strong);
    }
    #course-select .setting-row span {
      color: var(--c-text-muted);
      font-size: var(--fs-mini);
      letter-spacing: var(--ls-button);
    }
    #course-select .setting-row.selected span {
      color: var(--c-text);
    }
    #course-select .setting-row b {
      color: var(--c-text-strong);
      font-weight: var(--fw-bold);
    }
    #course-select .setting-row.selected b {
      color: var(--c-accent);
    }
    /* Primary action: filled amber, matches start screen Start Race */
    #course-select .scene-actions {
      gap: 8px;
    }
    #course-select .scene-actions .menu-button:first-child {
      background: var(--c-accent);
      color: #0c0a07;
      border-color: var(--c-accent);
      border-left-color: var(--c-accent);
    }
    #course-select .scene-actions .menu-button:first-child:hover {
      background: var(--c-accent-bright);
      border-color: var(--c-accent-bright);
    }
    #course-select .scene-actions .menu-button:first-child.selected {
      background: var(--c-accent-bright);
      border-color: var(--c-accent-bright);
      outline: 1px solid var(--c-teal);
      outline-offset: 2px;
    }
    /* Metric tiles align with start-screen calm muted look */
    #course-select .metric {
      border-color: var(--c-border);
      background: var(--c-bg-1);
    }
    #course-select .metric span {
      color: var(--c-text-muted);
      letter-spacing: var(--ls-button);
    }
    #course-select .metric b {
      color: var(--c-text-strong);
    }
    /* Leaderboard rows: same striped pattern as title-leaderboard */
    #course-select .leaderboard li {
      border-color: var(--c-border);
      background: var(--c-bg-2);
    }
    #course-select .leaderboard li:nth-child(even) {
      background: var(--c-bg-1);
    }
    #course-select .leaderboard b { color: var(--c-text-strong); }
    #course-select .leaderboard em { color: var(--c-accent); }
    /* Big finishing time uses Orbitron like start-screen PB */
    #course-select .big-time {
      font-family: var(--font-numeric);
      color: var(--c-accent);
      font-weight: var(--fw-bold);
      letter-spacing: 0.04em;
    }
    /* Splits */
    #course-select .splits-board li {
      border-color: var(--c-border);
      background: var(--c-bg-2);
    }
    #course-select .splits-board b { color: var(--c-text-strong); }
    #course-select .splits-board em { color: var(--c-teal-bright); }
    /* Friend Heat panels: dark monochrome to match */
    #course-select .friend-card .friend-blurb {
      color: var(--c-text-muted);
      font-size: var(--fs-body);
    }
    #course-select .friend-card .friend-tip {
      color: var(--c-text-faint);
      font-size: var(--fs-mini);
      letter-spacing: 0.06em;
    }
    #course-select .friend-card .friend-status {
      border: 1px solid var(--c-danger);
      background: rgba(155, 66, 50, 0.12);
      color: var(--c-warn);
      padding: 8px 10px;
      font-size: var(--fs-small);
      line-height: 1.4;
      margin: 0 0 10px;
    }
    #course-select .friend-invite,
    #course-select .friend-timer {
      border-color: var(--c-border);
      background: var(--c-bg-1);
    }
    #course-select .friend-invite span,
    #course-select .friend-timer span {
      color: var(--c-text-muted);
      letter-spacing: var(--ls-label);
    }
    #course-select .friend-invite b {
      font-family: var(--font-mono);
      color: var(--c-accent);
      font-weight: var(--fw-heavy);
      letter-spacing: 0.22em;
    }
    #course-select .friend-timer b {
      font-family: var(--font-numeric);
      color: var(--c-text-strong);
      font-weight: var(--fw-bold);
      letter-spacing: 0.04em;
    }
    #course-select .friend-invite em,
    #course-select .friend-timer em {
      color: var(--c-text-faint);
    }
    /* Friend join row: subtle, amber underline like callsign */
    #course-select .friend-join-row {
      border-color: var(--c-border);
      border-left: 3px solid transparent;
      background: var(--c-bg-2);
    }
    #course-select .friend-join-row.selected {
      background: var(--c-bg-4);
      border-color: var(--c-border-strong);
      border-left-color: var(--c-accent);
    }
    #course-select .friend-join-row span {
      color: var(--c-text-muted);
      letter-spacing: var(--ls-button);
    }
    #course-select .friend-join-row input {
      border: 0;
      border-bottom: 1.5px solid var(--c-accent);
      background: transparent;
      color: var(--c-text-strong);
      padding: 6px 0;
      letter-spacing: 0.18em;
    }
    #course-select .friend-join-row input:focus {
      outline: none;
      border-bottom-color: var(--c-accent-bright);
    }
    /* Friend Heat layout: stack panels vertically when narrow, with tighter gap */
    #course-select .friend-panel {
      gap: 12px;
    }
    /* Menu hints: subdued footer */
    #course-select .menu-hints {
      border-top-color: var(--c-border);
      gap: 6px;
    }
    #course-select .menu-hints span {
      border-color: var(--c-border);
      background: var(--c-bg-1);
      color: var(--c-text-muted);
      letter-spacing: 0.08em;
      font-size: var(--fs-micro);
      text-transform: uppercase;
    }
    /* Settings card: align with start-screen sidebar feel */
    #course-select .settings-card {
      border-color: var(--c-border);
    }
    #course-select .settings-card-head {
      border-bottom-color: var(--c-border);
    }
    #course-select .settings-card-head h1 {
      color: var(--c-text-strong);
    }
    #course-select .settings-card-head p {
      color: var(--c-text-muted);
    }
    #course-select .settings-close {
      border-color: var(--c-border);
      background: var(--c-bg-2);
      color: var(--c-text-muted);
    }
    #course-select .settings-close:hover,
    #course-select .settings-close:focus-visible {
      color: var(--c-text-strong);
      border-color: var(--c-accent);
    }
    /* Scrollbar styling consistency */
    #course-select *::-webkit-scrollbar { width: 10px; height: 10px; }
    #course-select *::-webkit-scrollbar-track { background: transparent; }
    #course-select *::-webkit-scrollbar-thumb {
      background: var(--c-border-strong);
      border: 2px solid transparent;
      background-clip: padding-box;
    }
    #course-select *::-webkit-scrollbar-thumb:hover { background: var(--c-accent); background-clip: padding-box; }
    /* ------------------------------------------------------------------
     * Start screen layout polish
     * ------------------------------------------------------------------ */
    #course-select .start-header {
      padding: 22px 24px 14px;
      align-items: center;
    }
    #course-select .start-brand { gap: 4px; }
    #course-select .start-header .league-title {
      color: var(--c-teal);
      font-size: var(--fs-mini);
      letter-spacing: var(--ls-label);
    }
    #course-select .start-board {
      margin: 0 24px 16px;
      border-color: var(--c-border);
      background: var(--c-bg-2);
    }
    #course-select .start-course-col {
      border-right-color: var(--c-border);
    }
    #course-select .start-section-head {
      min-height: 38px;
      padding: 10px 16px;
      border-bottom-color: var(--c-border);
      background: var(--c-bg-2);
    }
    #course-select .start-section-head span {
      color: var(--c-text-muted);
      letter-spacing: var(--ls-label);
    }
    #course-select .start-section-head .course-head {
      color: var(--c-teal);
      letter-spacing: 0.06em;
    }
    #course-select .start-course-row {
      gap: 8px;
      padding: 16px 18px;
      border-bottom-color: var(--c-border);
      background: var(--c-bg-2);
    }
    #course-select .start-course-row:nth-child(even) { background: var(--c-bg-1); }
    #course-select .start-course-row:hover,
    #course-select .start-course-row:focus-visible { background: var(--c-bg-3); }
    #course-select .start-course-row.selected {
      background: var(--c-bg-4);
      border-left-color: var(--c-accent);
    }
    #course-select .start-course-title strong {
      font-size: var(--fs-md);
      letter-spacing: 0.02em;
    }
    #course-select .start-course-row small { color: var(--c-text-muted); }
    #course-select .start-course-meta {
      gap: 8px;
      color: var(--c-text-faint);
      font-size: var(--fs-mini);
    }
    #course-select .start-course-meta em,
    #course-select .start-course-meta b {
      color: var(--c-text-muted);
      font-weight: var(--fw-text);
    }
    #course-select .start-course-row.selected .start-course-meta { color: var(--c-text-muted); }
    #course-select .start-course-row.selected .start-course-meta b {
      color: var(--c-accent);
      font-weight: var(--fw-bold);
    }
    #course-select .start-course-zone {
      color: var(--c-text-faint);
      letter-spacing: var(--ls-label);
    }
    /* Title leaderboard table polish */
    #course-select .title-board-head {
      padding: 8px 16px;
      border-bottom-color: var(--c-border);
      background: var(--c-bg-2);
      color: var(--c-text-faint);
      font-size: var(--fs-mini);
      letter-spacing: var(--ls-button);
      text-transform: uppercase;
    }
    #course-select .title-leaderboard li {
      padding: 9px 16px;
      border-bottom-color: var(--c-border);
      background: var(--c-bg-2);
      font-size: var(--fs-body);
    }
    #course-select .title-leaderboard li:nth-child(even) { background: var(--c-bg-1); }
    #course-select .title-leaderboard li.me { background: var(--c-bg-4); }
    #course-select .title-leaderboard span { color: var(--c-text-faint); font-weight: var(--fw-bold); }
    #course-select .title-leaderboard b { color: var(--c-text); font-weight: var(--fw-text); }
    #course-select .title-leaderboard em { color: var(--c-text-strong); font-weight: var(--fw-bold); }
    /* Personal best bar: lay out as three balanced columns */
    #course-select .personal-best-bar {
      align-items: center;
      gap: 18px;
      padding: 16px 18px;
      border-top-color: var(--c-border);
      background: var(--c-bg-2);
    }
    #course-select .record-compare {
      border-color: var(--c-border);
      background: var(--c-bg-1);
      padding: 10px 12px;
      gap: 8px 12px;
    }
    #course-select .record-compare-head { color: var(--c-text-muted); }
    #course-select .record-compare-head em { color: var(--c-text-faint); }
    #course-select .record-graph {
      border-color: var(--c-border);
      background:
        linear-gradient(180deg, rgba(42, 140, 128, 0.04), rgba(0, 0, 0, 0.16));
    }
    #course-select .record-graph .grid {
      stroke: rgba(110, 98, 80, 0.22);
    }
    #course-select .record-table {
      border-color: var(--c-border);
      background: var(--c-bg-1);
    }
    #course-select .personal-best b {
      color: var(--c-accent);
      font-size: 32px;
    }
    #course-select .personal-best span { color: var(--c-text-muted); letter-spacing: var(--ls-label); }
    #course-select .personal-best em { color: var(--c-text-faint); }
    #course-select .personal-best strong { color: var(--c-text-faint); }
    /* Start actions: amber primary, ghost secondary */
    #course-select .start-actions { gap: 10px; }
    #course-select .launch-action {
      min-height: 44px;
      padding: 12px 30px;
      background: var(--c-accent);
      color: #0c0a07;
      letter-spacing: 0.14em;
      font-weight: var(--fw-heavy);
    }
    #course-select .launch-action:hover { background: var(--c-accent-bright); opacity: 1; }
    #course-select .launch-action.selected {
      background: var(--c-accent-bright);
      outline: 1px solid var(--c-teal);
      outline-offset: 2px;
    }
    #course-select .utility-action {
      min-height: 36px;
      padding: 10px 14px;
      border: 1px solid var(--c-border);
      background: var(--c-bg-1);
      color: var(--c-text-muted);
      letter-spacing: 0.12em;
    }
    #course-select .utility-action:hover { color: var(--c-text); border-color: var(--c-border-strong); opacity: 1; }
    #course-select .utility-action.selected {
      color: var(--c-text-strong);
      border-color: var(--c-accent);
      outline: 1px solid var(--c-teal);
      outline-offset: 2px;
    }
    /* Footer hints */
    #course-select .start-hints {
      margin: 0 24px 16px;
      gap: 8px;
    }
    #course-select .footer-settings {
      border-color: var(--c-border);
      background: var(--c-bg-1);
      color: var(--c-text-muted);
    }
    #course-select .footer-settings:hover {
      color: var(--c-text);
      border-color: var(--c-border-strong);
    }
    #course-select .footer-settings.selected {
      color: var(--c-text-strong);
      border-color: var(--c-accent);
      outline: 1px solid var(--c-teal);
    }
    #course-select .start-hints span {
      border-color: var(--c-border);
      background: var(--c-bg-1);
      color: var(--c-text-muted);
      font-size: var(--fs-micro);
      letter-spacing: 0.1em;
      padding: 6px 10px;
      text-transform: uppercase;
    }
    #race-countdown {
      position: fixed;
      inset: 0;
      z-index: 46;
      display: grid;
      place-items: center;
      pointer-events: none;
      opacity: 0;
      color: #fff8e8;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: clamp(72px, 18vw, 210px);
      line-height: 1;
      font-weight: 950;
      letter-spacing: 0;
      text-shadow: 0 8px 32px rgba(0, 0, 0, 0.72), 0 0 34px rgba(93, 255, 154, 0.42);
      transition: opacity 0.08s linear, transform 0.08s linear;
      transform: scale(0.96);
    }
    #race-countdown.visible {
      opacity: 1;
      transform: scale(1);
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
      background: radial-gradient(ellipse at top center, rgba(93, 255, 154, 0.62), rgba(93, 255, 154, 0.18) 38%, rgba(93, 255, 154, 0) 74%);
    }
    #ring-tracker .right {
      top: 0;
      right: 0;
      bottom: 0;
      width: 18vw;
      opacity: var(--ring-right);
      background: radial-gradient(ellipse at right center, rgba(93, 255, 154, 0.62), rgba(93, 255, 154, 0.18) 38%, rgba(93, 255, 154, 0) 74%);
    }
    #ring-tracker .bottom {
      left: 0;
      right: 0;
      bottom: 0;
      height: 18vh;
      opacity: var(--ring-bottom);
      background: radial-gradient(ellipse at bottom center, rgba(93, 255, 154, 0.62), rgba(93, 255, 154, 0.18) 38%, rgba(93, 255, 154, 0) 74%);
    }
    #ring-tracker .left {
      top: 0;
      left: 0;
      bottom: 0;
      width: 18vw;
      opacity: var(--ring-left);
      background: radial-gradient(ellipse at left center, rgba(93, 255, 154, 0.62), rgba(93, 255, 154, 0.18) 38%, rgba(93, 255, 154, 0) 74%);
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
