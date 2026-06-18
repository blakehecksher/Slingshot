// Gamepad-driven quick-tune overlay. A curated, controller-navigable view of the
// handful of params that actually shape feel, editing the same live *_TUNING
// objects as the lil-gui panel. So feel can be dialed without dropping the pad.
//
// Controls while open:  D-pad up/down select · D-pad left/right adjust
//                       A save as defaults · X reset row to baseline
// Toggle open/close:    R3 (right stick click)

import { saveTuning } from './tuningStore';

export interface QuickTuneEntry {
  label: string;
  get: () => number;
  set: (v: number) => void;
  reset: () => void;
  step: number;
  min: number;
  max: number;
  /** Asteroid params need a field regen to take effect. */
  needsRegen?: boolean;
}

// Standard gamepad button indices.
const BTN_A = 0;
const BTN_X = 2;
const BTN_R3 = 11;
const BTN_DUP = 12;
const BTN_DDOWN = 13;
const BTN_DLEFT = 14;
const BTN_DRIGHT = 15;

const REPEAT_DELAY_MS = 320;
const REPEAT_RATE_MS = 80;

export interface QuickTuneDeps {
  entries: QuickTuneEntry[];
  onToast: (msg: string, durationMs: number) => void;
  onRegen: () => void;
}

export class QuickTune {
  private entries: QuickTuneEntry[];
  private onToast: (msg: string, durationMs: number) => void;
  private onRegen: () => void;
  private el: HTMLDivElement;
  private open = false;
  private index = 0;
  private prevButtons: boolean[] = [];
  private holdDir = 0;
  private holdSinceMs = 0;
  private lastRepeatMs = 0;

  constructor(deps: QuickTuneDeps) {
    this.entries = deps.entries;
    this.onToast = deps.onToast;
    this.onRegen = deps.onRegen;
    this.el = document.createElement('div');
    this.el.id = 'quick-tune';
    QuickTune.injectStyles();
    document.body.appendChild(this.el);
    this.render();
  }

  isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    this.open = !this.open;
    this.render();
  }

  /** Call once per frame with the live gamepad (or null). */
  update(pad: Gamepad | null, nowMs: number): void {
    if (!pad) {
      this.prevButtons = [];
      return;
    }
    const pressed = (i: number): boolean => Boolean(pad.buttons[i]?.pressed);
    const edge = (i: number): boolean => pressed(i) && !this.prevButtons[i];

    if (edge(BTN_R3)) this.toggle();

    if (this.open) {
      if (edge(BTN_DUP)) this.move(-1);
      if (edge(BTN_DDOWN)) this.move(1);
      if (edge(BTN_A)) this.save();
      if (edge(BTN_X)) this.resetRow();

      // Held left/right adjusts with an accelerating repeat for smooth sweeps.
      const dir = pressed(BTN_DRIGHT) ? 1 : pressed(BTN_DLEFT) ? -1 : 0;
      if (dir !== 0) {
        if (this.holdDir !== dir) {
          this.holdDir = dir;
          this.holdSinceMs = nowMs;
          this.lastRepeatMs = nowMs;
          this.adjust(dir);
        } else if (nowMs - this.holdSinceMs >= REPEAT_DELAY_MS && nowMs - this.lastRepeatMs >= REPEAT_RATE_MS) {
          this.lastRepeatMs = nowMs;
          this.adjust(dir);
        }
      } else {
        this.holdDir = 0;
      }
    }

    this.prevButtons = pad.buttons.map((b) => b.pressed);
  }

  private move(delta: number): void {
    this.index = (this.index + delta + this.entries.length) % this.entries.length;
    this.render();
  }

  private adjust(dir: number): void {
    const e = this.entries[this.index];
    const next = Math.max(e.min, Math.min(e.max, e.get() + dir * e.step));
    e.set(next);
    if (e.needsRegen) this.onRegen();
    this.render();
  }

  private resetRow(): void {
    const e = this.entries[this.index];
    e.reset();
    if (e.needsRegen) this.onRegen();
    this.onToast(`${e.label} reset to baseline`, 1000);
    this.render();
  }

  private save(): void {
    const ok = saveTuning();
    this.onToast(ok ? 'saved as launch defaults' : 'save failed', 1400);
  }

  private render(): void {
    if (!this.open) {
      this.el.classList.remove('visible');
      this.el.innerHTML = '<div class="qt-hint">R3 · quick tune</div>';
      return;
    }
    this.el.classList.add('visible');
    const rows = this.entries.map((e, i) => {
      const val = e.get();
      const txt = Math.abs(val) >= 100 ? val.toFixed(0) : val.toFixed(val % 1 === 0 ? 0 : 3);
      return `<div class="qt-row${i === this.index ? ' sel' : ''}">
        <span class="qt-label">${e.label}</span>
        <span class="qt-val">${txt}</span>
      </div>`;
    }).join('');
    this.el.innerHTML = `
      <div class="qt-head">Quick Tune</div>
      ${rows}
      <div class="qt-foot">↕ select · ◀▶ adjust · Ⓐ save · Ⓧ reset · R3 close</div>
    `;
  }

  private static injectStyles(): void {
    if (document.getElementById('quick-tune-styles')) return;
    const style = document.createElement('style');
    style.id = 'quick-tune-styles';
    style.textContent = `
      #quick-tune {
        position: fixed; right: 12px; bottom: 12px; z-index: 120;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        pointer-events: none;
      }
      #quick-tune .qt-hint { font-size: 10px; color: #6e6250; opacity: 0.7; letter-spacing: 0.12em; }
      #quick-tune.visible {
        min-width: 280px;
        background: rgba(8,10,16,0.86);
        border: 1px solid rgba(208,100,36,0.55);
        padding: 10px 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      }
      #quick-tune .qt-head {
        font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
        color: #f0b33d; margin-bottom: 8px;
      }
      #quick-tune .qt-row {
        display: flex; justify-content: space-between; gap: 18px;
        font-size: 12px; padding: 3px 6px; color: #c8c3b7;
      }
      #quick-tune .qt-row.sel {
        background: rgba(212,146,31,0.18);
        color: #fff8e8; border-left: 2px solid #f0b33d;
      }
      #quick-tune .qt-val { color: #79e1d6; font-weight: 700; }
      #quick-tune .qt-row.sel .qt-val { color: #aef3e8; }
      #quick-tune .qt-foot { margin-top: 8px; font-size: 9px; color: #6e6250; letter-spacing: 0.08em; }
    `;
    document.head.appendChild(style);
  }
}
