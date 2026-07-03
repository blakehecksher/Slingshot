import type { RaceCourse } from './courses';
import type { AsteroidGravityClass } from '../asteroids';

export type RaceState = 'select' | 'countdown' | 'ready' | 'racing' | 'finished' | 'invalid';
export type RaceStartMode = 'countdown' | 'ready';

export const RACE_TIME_TUNING = {
  DEAD_IRON_TIME_PULL_REF: 28,
  DEAD_IRON_MIN_TIME_SCALE: 0.35,
  WEAK_DEAD_IRON_TIME_MULT: 0.35,
};

export interface RaceFinish {
  readonly courseId: string;
  readonly timeSec: number;
  readonly splits: number[];
}

export class RaceManager {
  state: RaceState = 'select';
  course: RaceCourse | null = null;
  elapsedSec = 0;
  countdownSec = 0;
  nextCheckpoint = 0;
  splits: number[] = [];
  invalidReason = '';
  finish: RaceFinish | null = null;

  start(course: RaceCourse, mode: RaceStartMode = 'countdown'): void {
    this.course = course;
    this.state = mode;
    this.elapsedSec = 0;
    this.countdownSec = mode === 'countdown' ? 3 : 0;
    this.nextCheckpoint = 0;
    this.splits = [];
    this.invalidReason = '';
    this.finish = null;
  }

  update(dt: number, launchRequested = false, timeScale = 1): { started: boolean } {
    if (this.state === 'countdown') {
      this.countdownSec -= dt;
      if (this.countdownSec <= 0) {
        this.countdownSec = 0;
        this.state = 'racing';
        return { started: true };
      }
    } else if (this.state === 'ready' && launchRequested) {
      this.state = 'racing';
      return { started: true };
    } else if (this.state === 'racing') {
      this.elapsedSec += dt * clamp01(timeScale);
    }
    return { started: false };
  }

  checkpoint(index: number): { accepted: boolean; finished: boolean } {
    if (this.state !== 'racing' || !this.course) return { accepted: false, finished: false };
    if (index !== this.nextCheckpoint) return { accepted: false, finished: false };
    this.splits = [...this.splits, this.elapsedSec];
    this.nextCheckpoint++;
    const finished = this.nextCheckpoint >= this.course.gates.length;
    if (finished) {
      this.state = 'finished';
      this.finish = {
        courseId: this.course.id,
        timeSec: this.elapsedSec,
        splits: this.splits,
      };
    }
    return { accepted: true, finished };
  }

  invalidate(reason: string): void {
    if (this.state !== 'racing' && this.state !== 'countdown') return;
    this.state = 'invalid';
    this.invalidReason = reason;
  }

  returnToSelect(): void {
    this.state = 'select';
    this.elapsedSec = 0;
    this.countdownSec = 0;
    this.nextCheckpoint = 0;
    this.splits = [];
    this.invalidReason = '';
    this.finish = null;
  }
}

export function formatRaceTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '--:--.---';
  const minutes = Math.floor(sec / 60);
  const seconds = sec - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
}

export function formatDelta(sec: number): string {
  if (!Number.isFinite(sec)) return '';
  const sign = sec <= 0 ? '-' : '+';
  return `${sign}${Math.abs(sec).toFixed(3)}`;
}

export function raceTimeScaleForGravity(gravityClass: AsteroidGravityClass | null, pull: number): number {
  if (!gravityClass || gravityClass === 'ordinary' || !Number.isFinite(pull) || pull <= 0) return 1;

  const pullT = clamp01(pull / Math.max(0.001, RACE_TIME_TUNING.DEAD_IRON_TIME_PULL_REF));
  const shapedPull = pullT * pullT * (3 - 2 * pullT);
  const classMult = gravityClass === 'weak' ? RACE_TIME_TUNING.WEAK_DEAD_IRON_TIME_MULT : 1;
  const maxReward = 1 - clamp01(RACE_TIME_TUNING.DEAD_IRON_MIN_TIME_SCALE);
  return clamp01(1 - shapedPull * clamp01(classMult) * maxReward);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
