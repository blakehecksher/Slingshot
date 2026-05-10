import * as THREE from 'three';
import { AsteroidField } from './game/asteroids';
import { createBase } from './game/base';
import { ContactRegistry, type ContactKind } from './game/collision';
import { Economy, ECONOMY_TUNING } from './game/economy';
import { Energy, ENERGY_TUNING } from './game/energy';
import { SHIP_TUNING } from './game/ship';
import { GravityFeedback } from './game/feedback';
import { sampleGravityAt } from './game/gravity';
import { HangarState } from './game/hangar';
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
import { HangarUI } from './render/hangarUI';
import { computeModsFromParts, defaultManifest, applyCost as upgradeApplyCost, manifestPartCost } from './game/upgrades';
import { resolveShipVisual } from './render/shipVisual';
import { WeaponSystem, PlayerWeaponController, WEAPON_TUNING } from './game/weapons';
import { EnemyManager, ENEMY_TUNING } from './game/enemies';
import { zoneFor, zoneLabel, type FieldZone } from './game/zones';
import { ReticleHUD } from './render/reticle';
import * as persistence from './game/persistence';

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

const { renderer, composer, scene, camera, skybox } = createRenderRig(canvas);
const physics = new PhysicsWorld(FIXED_DT);
const input = new Input(canvas);
const registry = new ContactRegistry();

// --- Persistence ---
let save = persistence.load();
let manifest = save.manifest?.inline ?? defaultManifest();

const ship = new Ship(physics, scene);
const dust = new SpaceDust(scene);
const asteroidField = new AsteroidField(scene, physics, registry);
const trajectoryRibbon = new TrajectoryRibbon(scene);
const minimap = new Minimap();
const feedback = new GravityFeedback();

const economy = new Economy();
economy.setBank(save.bank);
const energy = new Energy();
const pickups = new PickupSystem(scene, physics, registry);
const weapons = new WeaponSystem(scene, physics, registry);
const enemies = new EnemyManager(scene, physics, registry, weapons, pickups);
const playerWeapons = new PlayerWeaponController(weapons);
const reticle = new ReticleHUD();
let lockedEnemyId: number | null = null;
const tmpShipPos = new THREE.Vector3();
const tmpShipVel = new THREE.Vector3();
const tmpEnemyPos = new THREE.Vector3();
const tmpEnemyVel = new THREE.Vector3();
const tmpForwardWorld = new THREE.Vector3();
const tmpToEnemy = new THREE.Vector3();

const BASE_POS = new THREE.Vector3(0, 0, 0);
createBase(scene, physics, registry, BASE_POS);

const SPAWN_POS = new THREE.Vector3(0, 0, 180);
ship.teleport(SPAWN_POS);

pickups.seedEnergyField();
enemies.seed(asteroidField.asteroids);

// Apply initial mods derived from saved/default manifest.
applyManifestMods();
void resolveAndSwapShipVisual();

const hangar = new HangarState(manifest.parts);
const hangarUI = new HangarUI({
  hangar,
  getBank: () => economy.bank,
  getOwned: () => save.upgradesOwned,
  onApply: (cost) => applyHangarChanges(cost),
  onCancel: () => closeHangar(),
});

const tuningPanel = new TuningPanel({
  ship,
  field: asteroidField,
  pickups,
  audio,
  spawnPos: SPAWN_POS,
  onToast: (msg, dur) => showToast(msg, dur),
});

let runStartedAt = performance.now();
let runStartBank = economy.bank;

const lifecycle = new Lifecycle(ship, SPAWN_POS, {
  onDeath: (deathPos, deathVel) => {
    const { chunkValueKg, count } = economy.consumeScatter();
    if (count > 0) {
      const inherit = ECONOMY_TUNING.SCATTER_DRIFT_INHERIT;
      const rand = ECONOMY_TUNING.SCATTER_RAND_VEL;
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
    save.stats.shipsLost += 1;
    persistence.save(save);
    audio.destroy();
    showToast(`SHIP LOST  cargo scattered: ${count} chunks`, 1800);
  },
  onRespawn: () => {
    energy.refill();
    ship.refillHp();
    peakSpeed = 0;
    hasPrevVelocity = false;
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
const tmpThrustWorld = new THREE.Vector3();
const tmpShipQuat = new THREE.Quaternion();
const prevVelocity = new THREE.Vector3();
let hasPrevVelocity = false;
let accelMag = 0;
let peakSpeed = 0;
let currentZone: FieldZone = 'open';

let trajectory: Trajectory = predictTrajectory(ship.position, ship.linearVelocity, asteroidField.asteroids);
let gravitySample = sampleGravityAt(shipPosVec.copy(SPAWN_POS), asteroidField.asteroids);

let inBase = false;

/** Find best lock target: alive enemy in front cone, biased to dot product. */
function pickLockTarget(): number | null {
  const r = ship.body.rotation();
  tmpShipQuat.set(r.x, r.y, r.z, r.w);
  tmpForwardWorld.set(0, 0, -1).applyQuaternion(tmpShipQuat);
  const sp = ship.position;
  tmpShipPos.set(sp.x, sp.y, sp.z);
  const cosCone = Math.cos((35 * Math.PI) / 180);
  const maxRange = 1800;
  let bestId: number | null = null;
  let bestScore = -Infinity;
  for (const e of enemies.enemies) {
    if (!e.alive) continue;
    const t = e.body.translation();
    tmpToEnemy.set(t.x - sp.x, t.y - sp.y, t.z - sp.z);
    const dist = tmpToEnemy.length();
    if (dist > maxRange || dist < 1) continue;
    const dot = tmpToEnemy.divideScalar(dist).dot(tmpForwardWorld);
    if (dot < cosCone) continue;
    // Score = forward alignment with mild range falloff.
    const score = dot - dist / maxRange * 0.25;
    if (score > bestScore) {
      bestScore = score;
      bestId = e.id;
    }
  }
  return bestId;
}

function applyManifestMods(): void {
  const mods = computeModsFromParts(manifest.parts);
  ship.setMods(mods);
  economy.setMods(mods.cargoCapAdd, mods.miningCoefAdd);
  energy.setMaxAdd(mods.energyMaxAdd);
}

async function resolveAndSwapShipVisual(): Promise<void> {
  try {
    const built = await resolveShipVisual({
      variant: ship.variant,
      manifest,
    });
    ship.setVisual(built);
  } catch (err) {
    console.warn('[ship] visual resolve failed', err);
  }
}

function applyHangarChanges(cost: number): void {
  if (cost > economy.bank) return;
  if (cost > 0 && !economy.spendBank(cost)) return;
  // Mark all working parts as owned.
  const owned = new Set(save.upgradesOwned);
  for (const p of hangar.workingParts) owned.add(p.partId);
  save.upgradesOwned = Array.from(owned);
  save.bank = economy.bank;
  manifest = hangar.toManifest('player', 'Custom rig');
  save.manifest = { id: manifest.id, inline: manifest };
  persistence.save(save);
  applyManifestMods();
  void resolveAndSwapShipVisual();
  ship.refillHp();
  energy.refill();
  showToast(`SHIP RECONFIGURED  ${cost > 0 ? `-${cost} kg` : ''}`, 1800);
  audio.deposit();
  closeHangar();
}

function openHangar(): void {
  if (hangar.open) return;
  hangar.open = true;
  hangar.reset(manifest.parts);
  ship.setFrozen(true);
  hangarUI.show();
}

function closeHangar(): void {
  if (!hangar.open) return;
  hangar.open = false;
  ship.setFrozen(false);
  hangarUI.hide();
}

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
  <div class="row">D-pad - strafe</div>
  <div class="row">A - fire weapon</div>
  <div class="row">B - boost (drains energy)</div>
  <div class="row">X - cycle ship visual</div>
  <div class="row">Y - hangar toggle (at base)</div>
  <div class="row">R-stick click - lock / unlock target</div>
  <div class="row">Back - chase / cockpit cam</div>
  <div class="row" style="opacity:0.7">In hangar: A enter / confirm · B back · X reset · Start apply · Y close</div>
  <div class="row" style="height:6px"></div>
  <div class="row"><b>Keyboard + mouse</b></div>
  <div class="row">W / S - thrust / brake</div>
  <div class="row">A / D - roll left / right</div>
  <div class="row">Space / Ctrl - thrust up / down</div>
  <div class="row">Q / E - yaw left / right</div>
  <div class="row">Shift - boost</div>
  <div class="row">F - fire weapon</div>
  <div class="row">L - lock / unlock target</div>
  <div class="row">Y / Tab - hangar (at base)</div>
  <div class="row">Mouse (click to capture) - yaw / pitch</div>
  <div class="row">Arrows - pitch + yaw (alt)</div>
  <div class="row">C - chase / cockpit cam</div>
  <div class="row">V - cycle ship visual</div>
  <div class="row">G - gamepad debug</div>
  <div class="row">P - tuning panel</div>
  <div class="row">H - hide / show this panel</div>
`;

let controlsVisible = true;
let padDebugVisible = false;
padDebug.style.display = 'none';
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
      `<div style="opacity:0.85">Plug it in, then press a button or move a stick.</div>`,
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

function describeOther(h1: number, h2: number): { handle: number; kind: ContactKind | undefined } {
  if (isShipCollider(h1)) return { handle: h2, kind: registry.lookup(h2) };
  if (isShipCollider(h2)) return { handle: h1, kind: registry.lookup(h1) };
  // Neither is the player ship — return both kinds resolved.
  return { handle: h1, kind: registry.lookup(h1) };
}

function tickPhysics(): void {
  const cmd = input.sample();
  if (cmd.toggleCameraMode) applyCameraToggle();
  if (cmd.cycleShipVisual && !hangar.open) {
    ship.cycleVariant(1);
    showToast(`SHIP ${ship.variantName}`, 1200);
  }
  if (cmd.toggleHangar) {
    if (hangar.open) closeHangar();
    else if (inBase) openHangar();
    else showToast('HANGAR REQUIRES DOCKING AT BASE', 1400);
  }

  if (cmd.toggleLock && !hangar.open) {
    if (lockedEnemyId !== null) {
      lockedEnemyId = null;
      showToast('LOCK RELEASED', 700);
    } else {
      const found = pickLockTarget();
      if (found !== null) {
        lockedEnemyId = found;
        showToast('TARGET LOCKED', 900);
      } else {
        showToast('NO TARGET IN CONE', 900);
      }
    }
  }

  if (hangar.open) {
    return; // pause sim while building.
  }

  updateLook(cmd, FIXED_DT);

  const preStepSpeed = ship.speed;

  const p = ship.position;
  shipPosVec.set(p.x, p.y, p.z);
  gravitySample = sampleGravityAt(shipPosVec, asteroidField.asteroids);

  ship.setAmbientPull(gravitySample.strongestPull);
  ship.setCargoFraction(economy.cargoFraction);

  if (lifecycle.isAlive()) {
    ship.applyAcceleration(gravitySample.acceleration, FIXED_DT);

    const boost = Math.max(0, Math.min(1, cmd.boost));
    const forwardThrust = Math.max(0, -cmd.thrust.z);
    const drainMag = boost * forwardThrust * SHIP_TUNING.BOOST_ENERGY_MULT;
    const thrustScale = energy.tick(drainMag, FIXED_DT);
    ship.setThrustScale(thrustScale);
    ship.applyCommand(cmd, FIXED_DT);

    // Player firing.
    const fired = playerWeapons.tick(FIXED_DT, cmd.fire, ship);
    if (fired) audio.laser();

    economy.tickMining(p, asteroidField.asteroids, FIXED_DT);
  }

  physics.step();
  asteroidField.update(FIXED_DT);
  pickups.update(FIXED_DT);
  weapons.update(FIXED_DT, asteroidField.asteroids);
  enemies.update(
    FIXED_DT,
    p,
    economy.cargo > 100,
    ship.linearVelocity,
    asteroidField.asteroids,
  );

  const v = ship.linearVelocity;
  const speed = Math.hypot(v.x, v.y, v.z);
  if (speed > peakSpeed) peakSpeed = speed;
  if (hasPrevVelocity) {
    const ax = (v.x - prevVelocity.x) / FIXED_DT;
    const ay = (v.y - prevVelocity.y) / FIXED_DT;
    const az = (v.z - prevVelocity.z) / FIXED_DT;
    const a = Math.hypot(ax, ay, az);
    accelMag += (a - accelMag) * 0.18;
  }
  prevVelocity.set(v.x, v.y, v.z);
  hasPrevVelocity = true;

  const r = ship.body.rotation();
  tmpShipQuat.set(r.x, r.y, r.z, r.w);
  tmpThrustWorld.set(cmd.thrust.x, cmd.thrust.y, cmd.thrust.z).applyQuaternion(tmpShipQuat);
  feedback.update(gravitySample.acceleration, tmpThrustWorld, FIXED_DT, input.readGamepad());

  // Field zone tracking.
  const distFromBase = Math.hypot(p.x - BASE_POS.x, p.y - BASE_POS.y, p.z - BASE_POS.z);
  const z = zoneFor(distFromBase);
  if (z !== currentZone) {
    currentZone = z;
    if (lifecycle.isAlive()) showToast(`ENTERING ${zoneLabel(z)}`, 1200);
  }
  if (-p.z > save.stats.deepestRunZ) {
    save.stats.deepestRunZ = -p.z;
  }
  if (peakSpeed > save.stats.peakSpeed) save.stats.peakSpeed = peakSpeed;

  // Drain collision events. Multiple kinds now: asteroids, base, pickups,
  // projectiles, enemies.
  let deathThisTick = false;
  let baseTouchedThisTick = false;
  physics.eventQueue.drainCollisionEvents((h1, h2, started) => {
    const k1 = registry.lookup(h1);
    const k2 = registry.lookup(h2);

    // Projectile contacts: handle regardless of which side is which.
    const projHandle = (k1?.type === 'projectile') ? h1 : (k2?.type === 'projectile') ? h2 : null;
    if (projHandle !== null && started) {
      const proj = (k1?.type === 'projectile') ? k1 : (k2?.type === 'projectile' ? k2 : null);
      if (proj && proj.type === 'projectile') {
        const otherKind = (proj === k1) ? k2 : k1;
        if (!otherKind) {
          weapons.killById(proj.id);
          return;
        }
        if (otherKind.type === 'asteroid') {
          weapons.killById(proj.id);
          return;
        }
        if (otherKind.type === 'enemy' && proj.ownerKind === 'player') {
          // Hit enemy.
          const projObj = weapons.projectiles.find((x) => x.id === proj.id);
          const dmg = projObj ? projObj.damage : 8;
          const result = enemies.applyDamage(otherKind.id, dmg);
          if (result?.killed) {
            economy.addBank(ENEMY_TUNING.BANK_REWARD_KG);
            save.bank = economy.bank;
            showToast(`+${ENEMY_TUNING.BANK_REWARD_KG} kg salvage`, 1200);
            audio.destroy();
          } else {
            audio.hit();
          }
          weapons.killById(proj.id);
          return;
        }
        if (proj.ownerKind === 'enemy' && otherKind.type === undefined) {
          // Hit player ship (which has no registry entry — its handle is the ship.collider).
          // handled below in ship-handle branch.
        }
        // Hitting the player's ship collider directly:
        const isShipHandle = (h1 === ship.colliderHandle) || (h2 === ship.colliderHandle);
        if (isShipHandle && proj.ownerKind === 'enemy') {
          const projObj = weapons.projectiles.find((x) => x.id === proj.id);
          const dmg = projObj ? projObj.damage : 14;
          const killed = ship.applyDamage(dmg);
          audio.hit();
          if (killed) {
            deathThisTick = true;
          }
          weapons.killById(proj.id);
          return;
        }
        // Anything else just kills the projectile.
        weapons.killById(proj.id);
      }
      return;
    }

    // Player-ship contacts (existing logic).
    const info = isShipCollider(h1) || isShipCollider(h2) ? describeOther(h1, h2) : null;
    if (!info || !info.kind) return;
    const kind = info.kind;

    if (kind.type === 'asteroid') {
      if (!started) return;
      if (!lifecycle.isAlive()) return;
      if (lifecycle.current === 'invuln') return;
      if (preStepSpeed > LIFECYCLE_TUNING.DEATH_SPEED_THRESHOLD) {
        deathThisTick = true;
      } else {
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
        audio.pickupChime();
      }
      return;
    }

    if (kind.type === 'pickup-cargo') {
      if (!started) return;
      const got = pickups.collect(kind.id);
      if (got) {
        const added = economy.addCargo(got.value);
        showToast(`+${Math.round(added)} kg cargo recovered`, 900);
        audio.pickupChime();
      }
      return;
    }

    if (kind.type === 'base') {
      if (started) baseTouchedThisTick = true;
      else inBase = false;
      return;
    }

    if (kind.type === 'enemy') {
      if (!started) return;
      if (!lifecycle.isAlive()) return;
      if (lifecycle.current === 'invuln') return;
      // Bumping an enemy ship at speed = damage to both.
      if (preStepSpeed > 18) {
        deathThisTick = true;
      }
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
    save.bank = economy.bank;
    if (deposited > 0) {
      save.stats.totalDeposited += deposited;
      save.stats.runsCompleted += 1;
      const elapsed = ((performance.now() - runStartedAt) / 1000).toFixed(0);
      const earned = Math.round(economy.bank - runStartBank);
      showToast(`DEPOSITED ${Math.round(deposited)} kg  -  +${earned} kg this run (${elapsed}s)`, 2400);
      audio.deposit();
      runStartBank = economy.bank;
      runStartedAt = performance.now();
    } else {
      showToast(`ENERGY REFILLED  -  Tab/Back to enter Hangar`, 1800);
    }
    persistence.save(save);
  }

  if (baseTouchedThisTick && !lifecycle.isAlive()) {
    inBase = false;
  }
  if (!baseTouchedThisTick && inBase) {
    // Base leaves are recorded by physics ended event above; nothing to do.
  }

  lifecycle.update(FIXED_DT);
}

function render(): void {
  ship.syncMeshFromBody();
  dust.update(ship.position);
  trajectory = predictTrajectory(ship.position, ship.linearVelocity, asteroidField.asteroids);
  trajectoryRibbon.update(trajectory);
  weapons.syncVisuals();
  syncCamera();
  feedback.apply(camera);
  // Skybox tracks camera so dome + stars feel infinitely distant rather than
  // a finite outer wall.
  skybox.position.copy(camera.position);
  composer.render();

  // Reticle + lock target update.
  let target = null as null | { position: THREE.Vector3; velocity: THREE.Vector3 };
  if (lockedEnemyId !== null) {
    const enemy = enemies.enemies.find((e) => e.id === lockedEnemyId);
    if (!enemy || !enemy.alive) {
      lockedEnemyId = null;
      reticle.setLabel('');
    } else {
      const t = enemy.body.translation();
      const v = enemy.body.linvel();
      tmpEnemyPos.set(t.x, t.y, t.z);
      tmpEnemyVel.set(v.x, v.y, v.z);
      target = { position: tmpEnemyPos, velocity: tmpEnemyVel };
      const sp = ship.position;
      const dist = Math.hypot(t.x - sp.x, t.y - sp.y, t.z - sp.z);
      reticle.setLabel(`LOCK · ${Math.round(dist)} m`);
    }
  } else {
    reticle.setLabel('');
  }
  const sv = ship.linearVelocity;
  const sp = ship.position;
  tmpShipPos.set(sp.x, sp.y, sp.z);
  tmpShipVel.set(sv.x, sv.y, sv.z);
  reticle.update(camera, target, tmpShipPos, tmpShipVel, ship.mods.weaponMuzzle);
  reticle.setVisible(!hangar.open);

  const r = ship.body.rotation();
  shipQuat.set(r.x, r.y, r.z, r.w);
  shipEuler.setFromQuaternion(shipQuat, 'YXZ');
  minimap.update(asteroidField.asteroids, trajectory, ship.position, shipEuler.y);
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
  audio.update(gravitySample.strongestPull, gravitySample.closestClearance, frameDt, economy.cargoFraction);
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
      `Slingshot — single-player run loop\n` +
      `fps ${fps.toFixed(0)}  dt ${(FIXED_DT * 1000).toFixed(2)}ms  cam ${cameraMode}  ${zoneLabel(currentZone)}\n` +
      `speed ${speed} m/s  peak ${peakSpeed.toFixed(1)} m/s  accel ${accelMag.toFixed(1)} m/s²\n` +
      `pull ${pull} m/s²  clearance ${clearance}m  shake ${feedbackLevel}%\n` +
      `${asteroidField.asteroids.length} asteroids  ${enemies.enemies.filter((e) => e.alive).length} hostiles  ${weapons.projectiles.filter((p) => p.alive).length} projectiles  ${padHint}${lockHint}`;
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
  const cargoBar = bar(economy.cargo / Math.max(1, economy.cargoCap), 14);
  const energyBar = bar(energy.fraction, 14);
  const hpBar = bar(ship.hpFraction, 10);

  const lifecycleHint =
    lifecycle.current === 'dying' ? `<span style="color:#d06424">— SHIP DESTROYED</span>` :
    lifecycle.current === 'respawning' ? `<span style="color:#d06424">— RESPAWNING</span>` :
    lifecycle.current === 'invuln' ? `<span style="color:#6dd6c8">— INVULN</span>` :
    '';

  const hpStyle = ship.hpFraction < 0.3 ? 'color:#ff5a4a;font-weight:bold' : '';
  const baseHint = inBase && !hangar.open ? '<span class="mining">— Tab/Back: HANGAR</span>' : '';
  const hangarHint = hangar.open ? '<span style="color:#6dd6c8">— HANGAR OPEN</span>' : '';

  statusBar.innerHTML = `
    <div class="line"><b>HULL</b> <span style="${hpStyle}">${hpBar} ${Math.round(ship.hp)} / ${Math.round(ship.hpMax)}</span></div>
    <div class="line"><b>CARGO</b> ${cargoBar} ${cargo} / ${cargoCap} kg ${mineRate !== '0.0' ? `<span class="mining">+${mineRate} kg/s</span>` : ''}</div>
    <div class="line"><b>BANK</b>  ${bank} kg ${baseHint}${hangarHint}</div>
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

// Touch a couple imports so unused-warning doesn't fire when only types are used.
void upgradeApplyCost;
void manifestPartCost;
void WEAPON_TUNING;
