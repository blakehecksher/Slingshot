import GUI, { type Controller } from 'lil-gui';
import * as THREE from 'three';
import { AUDIO_TUNING, type GameAudio } from '../audio/audio';
import { ASTEROID_TUNING, AsteroidField } from '../game/asteroids';
import { ENERGY_TUNING } from '../game/energy';
import { FEEDBACK_TUNING } from '../game/feedback';
import { GRAVITY_TUNING } from '../game/gravity';
import { isTextInputTarget } from '../game/input';
import { LIFECYCLE_TUNING } from '../game/lifecycle';
import { SHIP_TUNING, type Ship } from '../game/ship';
import type { DebugViz } from './debugViz';
import {
  applyTuning,
  clearSavedTuning,
  saveTuning,
  type TuningGroupKey,
  type TuningSnapshot,
} from './tuningStore';

const LIVE = {
  fps: 0,
  speed: 0,
  energy: 0,
  pull: 0,
  clearance: 0,
  state: 'select',
};

export interface LiveReadout {
  fps: number;
  speed: number;
  energy: number;
  pull: number;
  clearance: number;
  state: string;
}

export interface TuningPanelDeps {
  ship: Ship;
  field: AsteroidField;
  audio: GameAudio;
  spawnPos: THREE.Vector3;
  /** The in-source recovery baseline captured at boot, before saved overrides. */
  baseline: TuningSnapshot;
  debugViz: DebugViz;
  onToast: (msg: string, durationMs: number) => void;
}

type TunableRecord = Record<string, number>;

const DEBUG_FLAGS = {
  hitboxes: false,
  gravityGradient: false,
  wireframe: false,
};

// Plain-English hover docs, keyed by tuning property. Shown as a native tooltip
// on the param name. One line, what it actually does + which way to push it.
const PARAM_DOCS: Record<string, string> = {
  // Gravity / sling feel
  G: 'Master gravity strength. Higher = every asteroid pulls harder, tighter slingshot curves.',
  CORE_BOOST_PEAK: 'Extra pull multiplier right at an asteroid surface. Higher = dense cores yank much harder on a close pass.',
  CORE_BOOST_RANGE_FRAC: 'How far out (as a fraction of radius) the close-pass pull spike begins. Higher = the strong pull reaches further from the rock.',
  DANGER_RANGE: 'Clearance distance where the HUD/danger warning starts escalating. Raise this for bigger rocks.',
  SOFTENING_FACTOR: 'Smooths gravity very close to a rock so pull does not spike to infinity. Higher = gentler near the surface.',
  MIN_SOFTENING: 'Floor for the softening above, in metres. Higher = softer minimum even for tiny rocks.',
  // Ship / sling feel
  SPEED_ASSIST_PULL_SUPPRESS_LO: 'At high speed, gravity pull is damped. This is the gentle floor of that damping — low values keep more throw when fast.',
  SPEED_ASSIST_PULL_SUPPRESS_HI: 'Upper limit of high-speed pull damping. LOWER this if you "zoom past" rocks without feeling thrown.',
  FORWARD_THRUST: 'Main engine push. Higher = faster acceleration and top speed.',
  REVERSE_THRUST: 'Reverse / brake-thrust push.',
  STRAFE_THRUST: 'Sideways and vertical strafe push.',
  FORWARD_THRUST_BIAS: 'Balances forward vs reverse authority.',
  MAX_PITCH_RATE: 'Max nose up/down turn speed.',
  MAX_YAW_RATE: 'Max left/right turn speed.',
  MAX_ROLL_RATE: 'Max barrel-roll speed.',
  BRAKE_DAMPING: 'How hard the brake bleeds off velocity. Higher = stops quicker.',
  BOOST_THRUST_MULT: 'Thrust multiplier while boosting.',
  BOOST_ENERGY_MULT: 'How fast boosting drains the energy cell.',
  SPEED_ASSIST_START: 'Speed (m/s) where flight assist begins easing control.',
  SPEED_ASSIST_FULL: 'Speed (m/s) where flight assist is fully applied.',
  SPEED_ASSIST_DAMPING: 'Strength of the high-speed control assist.',
  // Asteroids
  PROCEDURAL_COUNT: 'How many real (collidable, gravity-bearing) asteroids spawn.',
  RADIUS_MIN: 'Smallest possible asteroid radius (metres). Raise to shift the whole field bigger.',
  RADIUS_RANGE: 'Added size span on top of the minimum. Raise for much larger rocks — this is the main "scale up" knob.',
  RADIUS_POWER: 'Size distribution curve. Higher = mostly small rocks with rare giants; lower = more medium/large.',
  SPHERE_INNER: 'Clear bubble radius around spawn — no rocks closer than this.',
  SPHERE_OUTER: 'Outer edge of the asteroid shell.',
  RADIAL_BIAS: 'Packs rocks inward (<1) or outward (>1).',
  SIZE_INNER_MAX: 'Caps how big inner-shell rocks can get (fraction of full range). Keeps giants out in the deep field.',
  MASS_COEF: 'Density coefficient: scales mass (and therefore gravity pull) for every rock. Raise for "massive grav pull" at the same size.',
  MASS_RADIUS_POWER: 'How steeply mass grows with radius (mass = radius^this). 3 = realistic volume scaling.',
  DRIFT_MIN: 'Minimum slow drift speed of asteroids.',
  DRIFT_RANGE: 'Added random drift speed range.',
  CORE_DENSITY_MIN: 'Minimum core density (denser = heavier = pulls harder).',
  CORE_DENSITY_RANGE: 'Random density span added on top.',
  // Boost energy
  ENERGY_MAX: 'Boost cell capacity.',
  THRUST_COST_PER_SEC: 'Base energy drain per second of thrust.',
  RESERVE_THRESHOLD_FRAC: 'Fraction of the cell that becomes a low-power reserve.',
  RESERVE_THRUST_SCALE: 'Thrust available while running on reserve.',
  // Crash / respawn
  GRAZE_VELOCITY_DAMP: 'On a low-speed graze, velocity is scaled by this. Lower = grazes bleed more speed.',
  DEATH_SPEED_THRESHOLD: 'Impact speed above which a hit kills instead of grazes. Raise to survive harder bumps.',
  DEATH_FADE_MS: 'Black-out fade time on death (main game only).',
  RESPAWN_FADE_MS: 'Fade-back-in time on respawn (main game only).',
  INVULN_AFTER_RESPAWN_MS: 'Invulnerable grace window after respawn.',
  // Feedback / audio
  JERK_THRESHOLD: 'Acceleration-change level before shake/rumble kicks in.',
  JERK_REF: 'Reference jerk used to normalise shake intensity.',
  SHAKE_AMP: 'Camera shake amplitude.',
  HAPTIC_MIN: 'Minimum controller rumble level.',
  HAPTIC_INTERVAL: 'Rumble pulse spacing.',
  MASTER_VOLUME: 'Overall audio volume.',
  RUMBLE_VOLUME: 'Low-frequency engine rumble volume.',
  CREAK_VOLUME: 'Hull-stress creak volume under heavy gravity.',
  FADE_TAU: 'Audio fade smoothing time constant.',
};

export class TuningPanel {
  private gui: GUI;
  private visible = true;
  private refreshResetButtons: Array<() => void> = [];
  private baseline: TuningSnapshot;
  private deps: TuningPanelDeps;
  private regenTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: TuningPanelDeps) {
    this.deps = deps;
    this.baseline = deps.baseline;
    TuningPanel.injectResetStyles();

    this.gui = new GUI({ title: 'Tuning   (P to toggle)', width: 360 });
    this.gui.domElement.style.zIndex = '100';
    this.gui.domElement.style.top = '40px';

    this.buildActions();
    this.buildLiveReadouts();
    this.buildSlingFeel();
    this.buildAsteroids();
    this.buildShip();
    this.buildBoostEnergy();
    this.buildCrashRespawn();
    this.buildDebugViz();
    this.buildAdvanced();

    window.addEventListener('keydown', (e) => {
      if (isTextInputTarget(e.target)) return;
      if (e.code === 'KeyP' && !e.repeat) this.toggle();
    });
  }

  // --- Folders ----------------------------------------------------------------

  private buildActions(): void {
    const actions = this.gui.addFolder('Actions');
    actions.add({ fn: () => this.saveAsDefaults() }, 'fn').name('💾 Save as defaults');
    actions.add({ fn: () => this.resetToBaseline() }, 'fn').name('↺ Reset to baseline');
    actions.add({ fn: () => this.clearSaved() }, 'fn').name('🗑 Clear saved defaults');
    actions.add({ fn: () => this.copyToClipboard() }, 'fn').name('Copy values (JSON)');
    actions.add({ fn: () => this.regenerate() }, 'fn').name('Regenerate asteroid field');
    actions.open();
  }

  private buildLiveReadouts(): void {
    const live = this.gui.addFolder('Live readouts');
    live.add(LIVE, 'fps').listen().disable().name('fps');
    live.add(LIVE, 'speed').listen().disable().name('speed m/s');
    live.add(LIVE, 'pull').listen().disable().name('gravity pull');
    live.add(LIVE, 'clearance').listen().disable().name('clearance m');
    live.add(LIVE, 'energy').listen().disable().name('energy %');
    live.add(LIVE, 'state').listen().disable().name('race state');
    live.open();
  }

  // The params that actually shape sling feel, pulled to the top across groups.
  private buildSlingFeel(): void {
    const f = this.gui.addFolder('Sling feel');
    this.addTunable(f, 'GRAVITY_TUNING', GRAVITY_TUNING, 'G', 0, 0.6, 0.001);
    this.addTunable(f, 'GRAVITY_TUNING', GRAVITY_TUNING, 'CORE_BOOST_PEAK', 0, 16, 0.05);
    this.addTunable(f, 'GRAVITY_TUNING', GRAVITY_TUNING, 'CORE_BOOST_RANGE_FRAC', 0, 6, 0.05);
    this.addTunable(f, 'GRAVITY_TUNING', GRAVITY_TUNING, 'DANGER_RANGE', 50, 2500, 5);
    // High-speed pull suppression — the likely culprit when you "zoom past" rocks.
    this.addTunable(f, 'SHIP_TUNING', SHIP_TUNING, 'SPEED_ASSIST_PULL_SUPPRESS_LO', 0, 40, 0.1);
    this.addTunable(f, 'SHIP_TUNING', SHIP_TUNING, 'SPEED_ASSIST_PULL_SUPPRESS_HI', 0.5, 120, 0.1);
    this.addTunable(f, 'SHIP_TUNING', SHIP_TUNING, 'FORWARD_THRUST', 5, 2000, 1);
    this.addTunable(f, 'LIFECYCLE_TUNING', LIFECYCLE_TUNING, 'DEATH_SPEED_THRESHOLD', 1, 120, 0.5);
    f.open();
  }

  private buildAsteroids(): void {
    const ast = this.gui.addFolder('Asteroids   (auto-regen)');
    const live = (c: Controller) => c.onChange(() => this.scheduleRegen());
    live(this.addTunable(ast, 'ASTEROID_TUNING', ASTEROID_TUNING, 'PROCEDURAL_COUNT', 0, 2000, 5));
    live(this.addTunable(ast, 'ASTEROID_TUNING', ASTEROID_TUNING, 'RADIUS_MIN', 1, 400, 0.5));
    live(this.addTunable(ast, 'ASTEROID_TUNING', ASTEROID_TUNING, 'RADIUS_RANGE', 1, 1500, 1));
    live(this.addTunable(ast, 'ASTEROID_TUNING', ASTEROID_TUNING, 'RADIUS_POWER', 0.5, 6, 0.05));
    live(this.addTunable(ast, 'ASTEROID_TUNING', ASTEROID_TUNING, 'SPHERE_INNER', 50, 6000, 10));
    live(this.addTunable(ast, 'ASTEROID_TUNING', ASTEROID_TUNING, 'SPHERE_OUTER', 1000, 30000, 50));
    live(this.addTunable(ast, 'ASTEROID_TUNING', ASTEROID_TUNING, 'RADIAL_BIAS', 0.3, 2.0, 0.05));
    live(this.addTunable(ast, 'ASTEROID_TUNING', ASTEROID_TUNING, 'SIZE_INNER_MAX', 0.05, 1.0, 0.01));
    live(this.addTunable(ast, 'ASTEROID_TUNING', ASTEROID_TUNING, 'MASS_COEF', 0.5, 400, 0.5));
    live(this.addTunable(ast, 'ASTEROID_TUNING', ASTEROID_TUNING, 'MASS_RADIUS_POWER', 1, 4, 0.05));
    live(this.addTunable(ast, 'ASTEROID_TUNING', ASTEROID_TUNING, 'WEAK_GRAVITY_CHANCE', 0, 0.8, 0.01));
    live(this.addTunable(ast, 'ASTEROID_TUNING', ASTEROID_TUNING, 'STRONG_GRAVITY_CHANCE', 0, 0.4, 0.01));
    live(this.addTunable(ast, 'ASTEROID_TUNING', ASTEROID_TUNING, 'WEAK_GRAVITY_MASS_SCALE', 0.02, 0.8, 0.01));
  }

  private buildShip(): void {
    const ship = this.gui.addFolder('Ship');
    this.addTunable(ship, 'SHIP_TUNING', SHIP_TUNING, 'REVERSE_THRUST', 5, 500, 1);
    this.addTunable(ship, 'SHIP_TUNING', SHIP_TUNING, 'STRAFE_THRUST', 0, 250, 1);
    this.addTunable(ship, 'SHIP_TUNING', SHIP_TUNING, 'FORWARD_THRUST_BIAS', 0.3, 1.5, 0.01);
    this.addTunable(ship, 'SHIP_TUNING', SHIP_TUNING, 'MAX_PITCH_RATE', 0.3, 5, 0.05);
    this.addTunable(ship, 'SHIP_TUNING', SHIP_TUNING, 'MAX_YAW_RATE', 0.3, 5, 0.05);
    this.addTunable(ship, 'SHIP_TUNING', SHIP_TUNING, 'MAX_ROLL_RATE', 0.3, 5, 0.05);
    this.addTunable(ship, 'SHIP_TUNING', SHIP_TUNING, 'BRAKE_DAMPING', 0, 8, 0.05);
    this.addTunable(ship, 'SHIP_TUNING', SHIP_TUNING, 'BOOST_THRUST_MULT', 1, 8, 0.05);
    this.addTunable(ship, 'SHIP_TUNING', SHIP_TUNING, 'BOOST_ENERGY_MULT', 1, 12, 0.1);
  }

  private buildBoostEnergy(): void {
    const energy = this.gui.addFolder('Boost energy');
    this.addTunable(energy, 'ENERGY_TUNING', ENERGY_TUNING, 'ENERGY_MAX', 20, 500, 5);
    this.addTunable(energy, 'ENERGY_TUNING', ENERGY_TUNING, 'THRUST_COST_PER_SEC', 0, 30, 0.1);
    this.addTunable(energy, 'ENERGY_TUNING', ENERGY_TUNING, 'RESERVE_THRESHOLD_FRAC', 0, 0.4, 0.01);
    this.addTunable(energy, 'ENERGY_TUNING', ENERGY_TUNING, 'RESERVE_THRUST_SCALE', 0, 1, 0.01);
  }

  private buildCrashRespawn(): void {
    const life = this.gui.addFolder('Crash / respawn');
    this.addTunable(life, 'LIFECYCLE_TUNING', LIFECYCLE_TUNING, 'GRAZE_VELOCITY_DAMP', 0, 1, 0.01);
    this.addTunable(life, 'LIFECYCLE_TUNING', LIFECYCLE_TUNING, 'DEATH_FADE_MS', 0, 2500, 25);
    this.addTunable(life, 'LIFECYCLE_TUNING', LIFECYCLE_TUNING, 'RESPAWN_FADE_MS', 0, 2500, 25);
    this.addTunable(life, 'LIFECYCLE_TUNING', LIFECYCLE_TUNING, 'INVULN_AFTER_RESPAWN_MS', 0, 5000, 50);
  }

  private buildDebugViz(): void {
    const viz = this.gui.addFolder('Debug view');
    const h = viz.add(DEBUG_FLAGS, 'hitboxes').name('show hitboxes').onChange((v: boolean) => this.deps.debugViz.setHitboxes(v));
    if (h.$name) h.$name.title = 'Wireframe sphere at each asteroid\'s TRUE collision radius. The gap vs the visible rock is your "asteroid trust" issue.';
    const g = viz.add(DEBUG_FLAGS, 'gravityGradient').name('gravity gradient').onChange((v: boolean) => this.deps.debugViz.setGradient(v));
    if (g.$name) g.$name.title = 'Point grid around the ship colored by gravity pull (dim = weak, red = strong).';
    const w = viz.add(DEBUG_FLAGS, 'wireframe').name('wireframe world').onChange((v: boolean) => this.deps.debugViz.setWireframe(v));
    if (w.$name) w.$name.title = 'Strip the scene to wireframe so you read the sim, not the art.';
    viz.open();
  }

  // Everything already dialed in — collapsed so it stays out of the way.
  private buildAdvanced(): void {
    const adv = this.gui.addFolder('Advanced');

    this.addTunable(adv, 'GRAVITY_TUNING', GRAVITY_TUNING, 'SOFTENING_FACTOR', 0, 2, 0.01);
    this.addTunable(adv, 'GRAVITY_TUNING', GRAVITY_TUNING, 'MIN_SOFTENING', 0, 100, 1);
    this.addTunable(adv, 'SHIP_TUNING', SHIP_TUNING, 'SPEED_ASSIST_START', 30, 500, 1);
    this.addTunable(adv, 'SHIP_TUNING', SHIP_TUNING, 'SPEED_ASSIST_FULL', 60, 800, 1);
    this.addTunable(adv, 'SHIP_TUNING', SHIP_TUNING, 'SPEED_ASSIST_DAMPING', 0, 2, 0.01);
    this.addTunable(adv, 'ASTEROID_TUNING', ASTEROID_TUNING, 'DRIFT_MIN', 0, 5, 0.05).onChange(() => this.scheduleRegen());
    this.addTunable(adv, 'ASTEROID_TUNING', ASTEROID_TUNING, 'DRIFT_RANGE', 0, 5, 0.05).onChange(() => this.scheduleRegen());
    this.addTunable(adv, 'ASTEROID_TUNING', ASTEROID_TUNING, 'CORE_DENSITY_MIN', 0.1, 2, 0.05).onChange(() => this.scheduleRegen());
    this.addTunable(adv, 'ASTEROID_TUNING', ASTEROID_TUNING, 'CORE_DENSITY_RANGE', 0, 3, 0.05).onChange(() => this.scheduleRegen());

    const fb = adv.addFolder('Feedback');
    this.addTunable(fb, 'FEEDBACK_TUNING', FEEDBACK_TUNING, 'JERK_THRESHOLD', 0, 30, 0.1);
    this.addTunable(fb, 'FEEDBACK_TUNING', FEEDBACK_TUNING, 'JERK_REF', 1, 200, 1);
    this.addTunable(fb, 'FEEDBACK_TUNING', FEEDBACK_TUNING, 'SHAKE_AMP', 0, 0.6, 0.005);
    this.addTunable(fb, 'FEEDBACK_TUNING', FEEDBACK_TUNING, 'HAPTIC_MIN', 0, 1, 0.01);
    this.addTunable(fb, 'FEEDBACK_TUNING', FEEDBACK_TUNING, 'HAPTIC_INTERVAL', 0.05, 1, 0.01);

    const audio = adv.addFolder('Audio');
    this.addTunable(audio, 'AUDIO_TUNING', AUDIO_TUNING, 'MASTER_VOLUME', 0, 1, 0.01).onChange((v: number) => this.deps.audio.setMasterVolume(v));
    this.addTunable(audio, 'AUDIO_TUNING', AUDIO_TUNING, 'RUMBLE_VOLUME', 0, 2, 0.01);
    this.addTunable(audio, 'AUDIO_TUNING', AUDIO_TUNING, 'CREAK_VOLUME', 0, 2, 0.01);
    this.addTunable(audio, 'AUDIO_TUNING', AUDIO_TUNING, 'FADE_TAU', 0.02, 1.5, 0.01);
  }

  // --- Lifecycle --------------------------------------------------------------

  toggle(): void {
    this.visible = !this.visible;
    this.gui.domElement.style.display = this.visible ? '' : 'none';
  }

  update(r: LiveReadout): void {
    LIVE.fps = Math.round(r.fps);
    LIVE.speed = Math.round(r.speed * 10) / 10;
    LIVE.energy = Math.round(r.energy * 100);
    LIVE.pull = Math.round(r.pull * 100) / 100;
    LIVE.clearance = Math.round(r.clearance);
    LIVE.state = r.state;
    this.refreshResetButtons.forEach((refresh) => refresh());
  }

  private scheduleRegen(): void {
    if (this.regenTimer) clearTimeout(this.regenTimer);
    this.regenTimer = setTimeout(() => {
      this.regenTimer = null;
      this.deps.field.regenerate();
      this.deps.debugViz.refreshHitboxes();
    }, 220);
  }

  private regenerate(): void {
    this.deps.field.regenerate();
    this.deps.debugViz.refreshHitboxes();
    this.deps.onToast('asteroid field regenerated', 1500);
  }

  // --- Tunable control + always-visible reset ---------------------------------

  private addTunable(
    folder: GUI,
    groupKey: TuningGroupKey,
    object: TunableRecord,
    property: string,
    min: number,
    max: number,
    step: number,
  ): Controller {
    const controller = folder.add(object, property, min, max, step);
    const doc = PARAM_DOCS[property];
    if (doc && controller.$name) controller.$name.title = doc;
    this.attachResetButton(controller, groupKey, object, property);
    return controller;
  }

  private attachResetButton(
    controller: Controller,
    groupKey: TuningGroupKey,
    object: TunableRecord,
    property: string,
  ): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tuning-reset-value';
    button.textContent = '↺';
    button.title = `Reset ${property} to baseline`;
    button.setAttribute('aria-label', button.title);

    const baselineValue = () => (this.baseline[groupKey] as TunableRecord)[property];

    const refresh = () => {
      const modified = object[property] !== baselineValue();
      controller.domElement.classList.toggle('tuning-modified', modified);
      button.disabled = !modified;
    };

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      controller.setValue(baselineValue());
      controller.updateDisplay();
      refresh();
    });

    controller.domElement.classList.add('tuning-resettable');
    controller.$widget.appendChild(button);
    this.refreshResetButtons.push(refresh);
    refresh();
  }

  private static injectResetStyles(): void {
    if (document.getElementById('slingshot-tuning-reset-styles')) return;

    const style = document.createElement('style');
    style.id = 'slingshot-tuning-reset-styles';
    style.textContent = `
      .lil-gui .lil-controller.tuning-resettable .lil-widget {
        gap: var(--spacing);
      }
      .lil-gui .tuning-reset-value {
        flex: 0 0 auto;
        height: var(--widget-height);
        width: var(--widget-height);
        border: 0;
        border-radius: var(--widget-border-radius);
        background: var(--widget-color);
        color: var(--text-color);
        cursor: pointer;
        font-size: 13px;
        line-height: var(--widget-height);
        padding: 0;
        opacity: 0.25;
      }
      .lil-gui .lil-controller.tuning-modified .tuning-reset-value {
        opacity: 0.9;
        background: var(--focus-color, var(--widget-color));
      }
      .lil-gui .tuning-reset-value:disabled {
        cursor: default;
      }
      .lil-gui .tuning-reset-value:not(:disabled):hover {
        background: var(--hover-color);
        opacity: 1;
      }
      .lil-gui .lil-controller.tuning-modified .lil-name {
        color: #ffd27f;
      }
    `;
    document.head.appendChild(style);
  }

  // --- Actions ----------------------------------------------------------------

  private copyToClipboard(): void {
    const text = JSON.stringify({
      SHIP_TUNING, GRAVITY_TUNING, ENERGY_TUNING, LIFECYCLE_TUNING,
      ASTEROID_TUNING, AUDIO_TUNING, FEEDBACK_TUNING,
    }, null, 2);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => this.deps.onToast('tuning JSON copied to clipboard', 1500))
        .catch(() => this.fallbackCopy(text));
    } else {
      this.fallbackCopy(text);
    }
  }

  private fallbackCopy(text: string): void {
    console.log('[tuning]\n' + text);
    this.deps.onToast('clipboard blocked - see console', 2000);
  }

  private saveAsDefaults(): void {
    const ok = saveTuning();
    this.deps.onToast(ok ? 'saved as launch defaults' : 'save failed - see console', 1600);
  }

  private clearSaved(): void {
    clearSavedTuning();
    this.deps.onToast('saved defaults cleared (baseline next launch)', 1800);
  }

  private resetToBaseline(): void {
    applyTuning(this.baseline);
    this.deps.audio.setMasterVolume(AUDIO_TUNING.MASTER_VOLUME);
    this.gui.controllersRecursive().forEach((c) => c.updateDisplay());
    this.refreshResetButtons.forEach((refresh) => refresh());
    this.deps.field.regenerate();
    this.deps.debugViz.refreshHitboxes();
    this.deps.onToast('tuning reset to baseline', 1400);
  }
}
