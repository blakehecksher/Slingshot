// Energy as shaping constraint. Boosted forward thrust drains; pickups + base
// refill; below reserve threshold thrust is throttled to a "limp home" rate.

export const ENERGY_TUNING = {
  ENERGY_MAX: 100,
  // Base drain rate per second passed to tick(). main.ts scales this by
  // boost intensity and forward thrust amount.
  THRUST_COST_PER_SEC: 2,
  // Below this fraction of max, thrust is throttled to RESERVE_THRUST_SCALE.
  RESERVE_THRESHOLD_FRAC: 0.05,
  RESERVE_THRUST_SCALE: 0.25,
  PICKUP_AMOUNT: 100,
};

export class Energy {
  private current: number;

  constructor(start = ENERGY_TUNING.ENERGY_MAX) {
    this.current = start;
  }

  get value(): number { return this.current; }
  get max(): number { return ENERGY_TUNING.ENERGY_MAX; }
  get fraction(): number { return this.current / ENERGY_TUNING.ENERGY_MAX; }
  get inReserve(): boolean { return this.fraction <= ENERGY_TUNING.RESERVE_THRESHOLD_FRAC; }

  /** Returns the thrust-scale (0–1) caller should apply to ship this tick. */
  tick(thrustMagnitude: number, dt: number): number {
    if (thrustMagnitude > 0.001 && this.current > 0) {
      const drain = ENERGY_TUNING.THRUST_COST_PER_SEC * thrustMagnitude * dt;
      this.current = Math.max(0, this.current - drain);
    }
    return this.inReserve ? ENERGY_TUNING.RESERVE_THRUST_SCALE : 1;
  }

  add(amount: number): void {
    this.current = Math.min(ENERGY_TUNING.ENERGY_MAX, this.current + amount);
  }

  refill(): void {
    this.current = ENERGY_TUNING.ENERGY_MAX;
  }
}
