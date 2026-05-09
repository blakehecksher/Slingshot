import GUI from 'lil-gui';
import * as THREE from 'three';
import { AUDIO_TUNING, type GameAudio } from '../audio/audio';
import { ASTEROID_TUNING, AsteroidField } from '../game/asteroids';
import { BASE_TUNING } from '../game/base';
import { ECONOMY_TUNING } from '../game/economy';
import { ENERGY_TUNING } from '../game/energy';
import { GRAVITY_TUNING } from '../game/gravity';
import { LIFECYCLE_TUNING } from '../game/lifecycle';
import { PICKUP_TUNING, PickupSystem } from '../game/pickups';
import { SHIP_TUNING, type Ship } from '../game/ship';

const LIVE = {
  fps: 0, speed: 0, cargo: 0, bank: 0, energy: 0,
  mineRate: 0, pull: 0, clearance: 0, state: 'alive',
};

export interface LiveReadout {
  fps: number; speed: number; cargo: number; bank: number; energy: number;
  mineRate: number; pull: number; clearance: number; state: string;
}

export interface TuningPanelDeps {
  ship: Ship;
  field: AsteroidField;
  pickups: PickupSystem;
  audio: GameAudio;
  spawnPos: THREE.Vector3;
  onToast: (msg: string, durationMs: number) => void;
}

// Shallow clone — all TUNING objects are flat scalar maps.
function snapshot<T extends Record<string, unknown>>(obj: T): T {
  return { ...obj };
}

export class TuningPanel {
  private gui: GUI;
  private visible = true;

  // Snapshots taken at construction so "Reset" restores the original defaults.
  private defaults = {
    SHIP_TUNING: snapshot(SHIP_TUNING),
    GRAVITY_TUNING: snapshot(GRAVITY_TUNING),
    ECONOMY_TUNING: snapshot(ECONOMY_TUNING),
    ENERGY_TUNING: snapshot(ENERGY_TUNING),
    LIFECYCLE_TUNING: snapshot(LIFECYCLE_TUNING),
    ASTEROID_TUNING: snapshot(ASTEROID_TUNING),
    PICKUP_TUNING: snapshot(PICKUP_TUNING),
    BASE_TUNING: snapshot(BASE_TUNING),
    AUDIO_TUNING: snapshot(AUDIO_TUNING),
  };

  constructor(deps: TuningPanelDeps) {
    this.gui = new GUI({ title: 'Tuning   (P to toggle)', width: 340 });
    this.gui.domElement.style.zIndex = '100';
    this.gui.domElement.style.top = '40px';

    const actions = this.gui.addFolder('Actions');
    actions.add({ fn: () => this.copyToClipboard(deps.onToast) }, 'fn').name('Copy values to clipboard');
    actions.add({ fn: () => this.resetToDefaults(deps.onToast) }, 'fn').name('Reset to defaults');
    actions.add({ fn: () => this.regenerate(deps) }, 'fn').name('Regenerate field + pickups');
    actions.open();

    const live = this.gui.addFolder('Live readouts');
    live.add(LIVE, 'fps').listen().disable().name('fps');
    live.add(LIVE, 'speed').listen().disable().name('speed m/s');
    live.add(LIVE, 'pull').listen().disable().name('gravity pull');
    live.add(LIVE, 'clearance').listen().disable().name('clearance m');
    live.add(LIVE, 'cargo').listen().disable().name('cargo kg');
    live.add(LIVE, 'bank').listen().disable().name('bank kg');
    live.add(LIVE, 'energy').listen().disable().name('energy %');
    live.add(LIVE, 'mineRate').listen().disable().name('mining kg/s');
    live.add(LIVE, 'state').listen().disable().name('lifecycle');
    live.open();

    const ship = this.gui.addFolder('Ship');
    ship.add(SHIP_TUNING, 'FORWARD_THRUST', 5, 500, 1);
    ship.add(SHIP_TUNING, 'REVERSE_THRUST', 5, 500, 1);
    ship.add(SHIP_TUNING, 'STRAFE_THRUST', 0, 200, 1);
    ship.add(SHIP_TUNING, 'FORWARD_THRUST_BIAS', 0.3, 1.5, 0.01);
    ship.add(SHIP_TUNING, 'MAX_PITCH_RATE', 0.3, 5, 0.05);
    ship.add(SHIP_TUNING, 'MAX_YAW_RATE', 0.3, 5, 0.05);
    ship.add(SHIP_TUNING, 'MAX_ROLL_RATE', 0.3, 5, 0.05);
    ship.add(SHIP_TUNING, 'BRAKE_DAMPING', 0, 8, 0.05);
    ship.add(SHIP_TUNING, 'SPEED_ASSIST_START', 30, 500, 1);
    ship.add(SHIP_TUNING, 'SPEED_ASSIST_FULL', 60, 800, 1);
    ship.add(SHIP_TUNING, 'SPEED_ASSIST_DAMPING', 0, 2, 0.01);
    ship.add(SHIP_TUNING, 'BOOST_THRUST_MULT', 1, 8, 0.05);
    ship.add(SHIP_TUNING, 'BOOST_ENERGY_MULT', 1, 12, 0.1);

    const gravity = this.gui.addFolder('Gravity');
    gravity.add(GRAVITY_TUNING, 'G', 0, 0.2, 0.001);
    gravity.add(GRAVITY_TUNING, 'SOFTENING_FACTOR', 0, 2, 0.01);
    gravity.add(GRAVITY_TUNING, 'MIN_SOFTENING', 0, 100, 1);
    gravity.add(GRAVITY_TUNING, 'DANGER_RANGE', 50, 600, 5);

    const econ = this.gui.addFolder('Mining / Cargo');
    econ.add(ECONOMY_TUNING, 'CARGO_CAP_KG', 500, 20000, 100);
    econ.add(ECONOMY_TUNING, 'MINE_COEF', 0, 0.1, 0.001);
    econ.add(ECONOMY_TUNING, 'MINE_EPSILON', 1, 60, 1);
    econ.add(ECONOMY_TUNING, 'MAX_RATE_PER_AST', 5, 300, 1);
    econ.add(ECONOMY_TUNING, 'MAX_TOTAL_RATE', 10, 500, 1);
    econ.add(ECONOMY_TUNING, 'MINING_RANGE', 100, 2000, 10);
    econ.add(ECONOMY_TUNING, 'SCATTER_CHUNK_KG', 50, 1500, 10);
    econ.add(ECONOMY_TUNING, 'SCATTER_DRIFT_INHERIT', 0, 1, 0.01);
    econ.add(ECONOMY_TUNING, 'SCATTER_RAND_VEL', 0, 30, 0.5);

    const energy = this.gui.addFolder('Energy');
    energy.add(ENERGY_TUNING, 'ENERGY_MAX', 20, 500, 5);
    energy.add(ENERGY_TUNING, 'THRUST_COST_PER_SEC', 0, 30, 0.1);
    energy.add(ENERGY_TUNING, 'RESERVE_THRESHOLD_FRAC', 0, 0.4, 0.01);
    energy.add(ENERGY_TUNING, 'RESERVE_THRUST_SCALE', 0, 1, 0.01);
    energy.add(ENERGY_TUNING, 'PICKUP_AMOUNT', 5, 200, 1);

    const life = this.gui.addFolder('Death / Respawn');
    life.add(LIFECYCLE_TUNING, 'DEATH_SPEED_THRESHOLD', 1, 80, 0.5);
    life.add(LIFECYCLE_TUNING, 'GRAZE_VELOCITY_DAMP', 0, 1, 0.01);
    life.add(LIFECYCLE_TUNING, 'DEATH_FADE_MS', 100, 2500, 50);
    life.add(LIFECYCLE_TUNING, 'RESPAWN_FADE_MS', 100, 2500, 50);
    life.add(LIFECYCLE_TUNING, 'INVULN_AFTER_RESPAWN_MS', 0, 5000, 50);

    const ast = this.gui.addFolder('Asteroids   (regen to apply)');
    ast.add(ASTEROID_TUNING, 'PROCEDURAL_COUNT', 0, 400, 1);
    ast.add(ASTEROID_TUNING, 'RADIUS_MIN', 1, 80, 0.5);
    ast.add(ASTEROID_TUNING, 'RADIUS_RANGE', 1, 250, 1);
    ast.add(ASTEROID_TUNING, 'RADIUS_POWER', 0.5, 6, 0.05);
    ast.add(ASTEROID_TUNING, 'BAND_INNER', 0, 1500, 10);
    ast.add(ASTEROID_TUNING, 'BAND_RANGE', 100, 5000, 25);
    ast.add(ASTEROID_TUNING, 'BAND_JITTER', 0, 800, 5);
    ast.add(ASTEROID_TUNING, 'Z_NEAR', -2000, 0, 10);
    ast.add(ASTEROID_TUNING, 'Z_DEPTH', 200, 8000, 50);
    ast.add(ASTEROID_TUNING, 'Y_RANGE', 0, 1500, 10);
    ast.add(ASTEROID_TUNING, 'DRIFT_MIN', 0, 5, 0.05);
    ast.add(ASTEROID_TUNING, 'DRIFT_RANGE', 0, 5, 0.05);
    ast.add(ASTEROID_TUNING, 'ROT_MIN', 0, 0.5, 0.005);
    ast.add(ASTEROID_TUNING, 'ROT_RANGE', 0, 0.5, 0.005);
    ast.add(ASTEROID_TUNING, 'MASS_COEF', 50, 5000, 50);

    const pk = this.gui.addFolder('Pickups   (regen to apply)');
    pk.add(PICKUP_TUNING, 'ENERGY_PICKUP_COUNT', 0, 100, 1);
    pk.add(PICKUP_TUNING, 'ENERGY_RADIUS', 1, 20, 0.5);
    pk.add(PICKUP_TUNING, 'CARGO_RADIUS', 1, 20, 0.5);
    pk.add(PICKUP_TUNING, 'ENERGY_TRIGGER_RADIUS', 2, 50, 1);
    pk.add(PICKUP_TUNING, 'CARGO_TRIGGER_RADIUS', 2, 50, 1);
    pk.add(PICKUP_TUNING, 'CARGO_DRIFT_DAMPING', 0, 2, 0.01);
    pk.add(PICKUP_TUNING, 'ENERGY_SEED_X_RANGE', 100, 5000, 50);
    pk.add(PICKUP_TUNING, 'ENERGY_SEED_Y_RANGE', 50, 2500, 25);
    pk.add(PICKUP_TUNING, 'ENERGY_SEED_Z_NEAR', -2000, 500, 10);
    pk.add(PICKUP_TUNING, 'ENERGY_SEED_Z_FAR', -8000, 0, 25);

    const base = this.gui.addFolder('Base   (baked at startup, display only)');
    base.add(BASE_TUNING, 'TRIGGER_RADIUS').disable();
    base.add(BASE_TUNING, 'CORE_SIZE').disable();

    const audio = this.gui.addFolder('Audio');
    audio.add(AUDIO_TUNING, 'MASTER_VOLUME', 0, 1, 0.01).onChange((v: number) => deps.audio.setMasterVolume(v));
    audio.add(AUDIO_TUNING, 'RUMBLE_VOLUME', 0, 2, 0.01);
    audio.add(AUDIO_TUNING, 'RUMBLE_REF_PULL', 0.2, 12, 0.1);
    audio.add(AUDIO_TUNING, 'RUMBLE_CURVE', 0.2, 2, 0.05);
    audio.add(AUDIO_TUNING, 'CREAK_VOLUME', 0, 2, 0.01);
    audio.add(AUDIO_TUNING, 'CREAK_NEAR', 0, 200, 1);
    audio.add(AUDIO_TUNING, 'CREAK_FAR', 50, 800, 5);
    audio.add(AUDIO_TUNING, 'FADE_TAU', 0.02, 1.5, 0.01);
    audio.add(AUDIO_TUNING, 'CREAK_PITCH_LOW', 0.5, 1.5, 0.01);
    audio.add(AUDIO_TUNING, 'CREAK_PITCH_HIGH', 0.5, 1.5, 0.01);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyP' && !e.repeat) this.toggle();
    });
  }

  toggle(): void {
    this.visible = !this.visible;
    this.gui.domElement.style.display = this.visible ? '' : 'none';
  }

  update(r: LiveReadout): void {
    LIVE.fps = Math.round(r.fps);
    LIVE.speed = Math.round(r.speed * 10) / 10;
    LIVE.cargo = Math.round(r.cargo);
    LIVE.bank = Math.round(r.bank);
    LIVE.energy = Math.round(r.energy * 100);
    LIVE.mineRate = Math.round(r.mineRate * 10) / 10;
    LIVE.pull = Math.round(r.pull * 100) / 100;
    LIVE.clearance = Math.round(r.clearance);
    LIVE.state = r.state;
  }

  private copyToClipboard(toast: (msg: string, dur: number) => void): void {
    const dump = {
      SHIP_TUNING, GRAVITY_TUNING, ECONOMY_TUNING, ENERGY_TUNING,
      LIFECYCLE_TUNING, ASTEROID_TUNING, PICKUP_TUNING, BASE_TUNING, AUDIO_TUNING,
    };
    const text = JSON.stringify(dump, null, 2);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => toast('tuning JSON copied to clipboard', 1500))
        .catch(() => this.fallbackCopy(text, toast));
    } else {
      this.fallbackCopy(text, toast);
    }
  }

  private fallbackCopy(text: string, toast: (msg: string, dur: number) => void): void {
    // Some browsers gate clipboard.writeText behind secure context. Fallback
    // dumps to console — easy to copy from devtools.
    console.log('[tuning]\n' + text);
    toast('clipboard blocked — see console', 2000);
  }

  private resetToDefaults(toast: (msg: string, dur: number) => void): void {
    Object.assign(SHIP_TUNING, this.defaults.SHIP_TUNING);
    Object.assign(GRAVITY_TUNING, this.defaults.GRAVITY_TUNING);
    Object.assign(ECONOMY_TUNING, this.defaults.ECONOMY_TUNING);
    Object.assign(ENERGY_TUNING, this.defaults.ENERGY_TUNING);
    Object.assign(LIFECYCLE_TUNING, this.defaults.LIFECYCLE_TUNING);
    Object.assign(ASTEROID_TUNING, this.defaults.ASTEROID_TUNING);
    Object.assign(PICKUP_TUNING, this.defaults.PICKUP_TUNING);
    Object.assign(BASE_TUNING, this.defaults.BASE_TUNING);
    Object.assign(AUDIO_TUNING, this.defaults.AUDIO_TUNING);
    this.gui.controllersRecursive().forEach((c) => c.updateDisplay());
    toast('tuning reset to defaults', 1400);
  }

  private regenerate(deps: TuningPanelDeps): void {
    deps.ship.teleport({ x: deps.spawnPos.x, y: deps.spawnPos.y, z: deps.spawnPos.z });
    deps.field.regenerate();
    deps.pickups.regenerate();
    deps.onToast('field + pickups regenerated', 1500);
  }
}
