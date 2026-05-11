import type { RaceCourse } from './courses';

export type RaceState = 'select' | 'countdown' | 'racing' | 'finished' | 'invalid';

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

  start(course: RaceCourse): void {
    this.course = course;
    this.state = 'countdown';
    this.elapsedSec = 0;
    this.countdownSec = 3;
    this.nextCheckpoint = 0;
    this.splits = [];
    this.invalidReason = '';
    this.finish = null;
  }

  update(dt: number): { started: boolean } {
    if (this.state === 'countdown') {
      this.countdownSec -= dt;
      if (this.countdownSec <= 0) {
        this.countdownSec = 0;
        this.state = 'racing';
        return { started: true };
      }
    } else if (this.state === 'racing') {
      this.elapsedSec += dt;
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

