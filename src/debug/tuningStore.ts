import { AUDIO_TUNING } from '../audio/audio';
import { ASTEROID_TUNING } from '../game/asteroids';
import { ENERGY_TUNING } from '../game/energy';
import { FEEDBACK_TUNING } from '../game/feedback';
import { GRAVITY_TUNING } from '../game/gravity';
import { LIFECYCLE_TUNING } from '../game/lifecycle';
import { SHIP_TUNING } from '../game/ship';

// Single registry of every live-tunable group. Anything added here is
// automatically persisted, baselined, and reset by the panel.
export const TUNING_GROUPS = {
  SHIP_TUNING,
  GRAVITY_TUNING,
  ENERGY_TUNING,
  LIFECYCLE_TUNING,
  ASTEROID_TUNING,
  AUDIO_TUNING,
  FEEDBACK_TUNING,
} as const;

export type TuningGroupKey = keyof typeof TUNING_GROUPS;
export type TuningSnapshot = Record<TuningGroupKey, Record<string, number>>;

const STORE_KEY = 'slingshot.tuning.v1';

function snapshotGroup(group: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(group)) {
    if (typeof v === 'number') out[k] = v;
  }
  return out;
}

/** Deep snapshot of the current values of every tuning group. */
export function snapshotTuning(): TuningSnapshot {
  const out = {} as TuningSnapshot;
  for (const key of Object.keys(TUNING_GROUPS) as TuningGroupKey[]) {
    out[key] = snapshotGroup(TUNING_GROUPS[key]);
  }
  return out;
}

/** Overwrite the live tuning objects from a snapshot (only known numeric keys). */
export function applyTuning(snapshot: Partial<TuningSnapshot>): void {
  for (const key of Object.keys(TUNING_GROUPS) as TuningGroupKey[]) {
    const incoming = snapshot[key];
    if (!incoming) continue;
    const live = TUNING_GROUPS[key] as Record<string, number>;
    for (const [prop, value] of Object.entries(incoming)) {
      if (typeof value === 'number' && prop in live) live[prop] = value;
    }
  }
}

/** Read the developer's saved tuning overrides, if any. */
export function loadSavedTuning(): Partial<TuningSnapshot> | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<TuningSnapshot>;
  } catch (err) {
    console.warn('[tuning] failed to read saved tuning', err);
    return null;
  }
}

/** Persist the current live values as the next-launch defaults. */
export function saveTuning(): boolean {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(snapshotTuning()));
    return true;
  } catch (err) {
    console.warn('[tuning] failed to save tuning', err);
    return false;
  }
}

/** Drop saved overrides so the next launch boots from the code baseline. */
export function clearSavedTuning(): void {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch (err) {
    console.warn('[tuning] failed to clear saved tuning', err);
  }
}
