import * as THREE from 'three';
import type { Asteroid } from './asteroids';

// Mining-by-proximity + cargo + bank + scatter accounting.
//
// Mining is stateless: each fixed step we sample distance to every asteroid
// and add a chunk of cargo proportional to mass / clearance². Cap and mining
// coefficient can be augmented by ship parts via setMods().

export const ECONOMY_TUNING = {
  CARGO_CAP_KG: 2000,
  // Per-asteroid mining rate scaling. rate = COEF × mass / (clearance² + ε²)
  // where clearance is in meters (distance from ship to asteroid surface).
  // Tuned with massForRadius(r) = r² × 900, so a r=100 rock at clearance 50m
  // gives ~ 0.02 × 9_000_000 / 2500 = 72 kg/s. Feels chunky but not absurd.
  MINE_COEF: 0.022,
  MINE_EPSILON: 6,
  // Cap mining contribution per asteroid per second so a single big rock
  // doesn't trivialize the loop. Tuned to ~half cargo cap per minute when
  // properly orbiting a deep-field giant.
  MAX_RATE_PER_AST: 60,
  MAX_TOTAL_RATE: 110,
  // Range past which an asteroid contributes nothing (perf cull).
  MINING_RANGE: 700,
  // Cargo chunk granularity for scatter on death.
  SCATTER_CHUNK_KG: 250,
  SCATTER_DRIFT_INHERIT: 0.4,
  SCATTER_RAND_VEL: 8,
};

export class Economy {
  private cargoKg = 0;
  private bankKg = 0;
  private lastMineRate = 0;
  private _delta = new THREE.Vector3();
  private _cargoCapAdd = 0;
  private _miningCoefAdd = 0;

  get cargo(): number { return this.cargoKg; }
  get bank(): number { return this.bankKg; }
  get cargoCap(): number { return ECONOMY_TUNING.CARGO_CAP_KG + this._cargoCapAdd; }
  get mineRate(): number { return this.lastMineRate; }
  get cargoFraction(): number { return this.cargoCap > 0 ? this.cargoKg / this.cargoCap : 0; }

  setBank(kg: number): void { this.bankKg = Math.max(0, kg); }

  /** Mods plumbed in from ship parts. Called whenever the manifest changes. */
  setMods(cargoCapAdd: number, miningCoefAdd: number): void {
    this._cargoCapAdd = Math.max(0, cargoCapAdd);
    this._miningCoefAdd = Math.max(0, miningCoefAdd);
    if (this.cargoKg > this.cargoCap) this.cargoKg = this.cargoCap;
  }

  /** Per fixed step. Returns rate (kg/s) so caller can drive feedback (dust trail). */
  tickMining(shipPos: { x: number; y: number; z: number }, asteroids: readonly Asteroid[], dt: number): number {
    if (this.cargoKg >= this.cargoCap) {
      this.lastMineRate = 0;
      return 0;
    }

    const coef = ECONOMY_TUNING.MINE_COEF + this._miningCoefAdd;
    let totalRate = 0;
    for (const a of asteroids) {
      this._delta.set(a.position.x - shipPos.x, a.position.y - shipPos.y, a.position.z - shipPos.z);
      const distance = this._delta.length();
      if (distance > ECONOMY_TUNING.MINING_RANGE) continue;
      const clearance = Math.max(0, distance - a.radius);
      const denom = clearance * clearance + ECONOMY_TUNING.MINE_EPSILON * ECONOMY_TUNING.MINE_EPSILON;
      let rate = coef * a.mass / denom;
      if (rate > ECONOMY_TUNING.MAX_RATE_PER_AST) rate = ECONOMY_TUNING.MAX_RATE_PER_AST;
      totalRate += rate;
      if (totalRate >= ECONOMY_TUNING.MAX_TOTAL_RATE) {
        totalRate = ECONOMY_TUNING.MAX_TOTAL_RATE;
        break;
      }
    }

    const room = this.cargoCap - this.cargoKg;
    const added = Math.min(room, totalRate * dt);
    this.cargoKg += added;
    this.lastMineRate = totalRate;
    return totalRate;
  }

  depositAll(): number {
    const dep = this.cargoKg;
    this.bankKg += dep;
    this.cargoKg = 0;
    return dep;
  }

  spendBank(kg: number): boolean {
    if (this.bankKg < kg) return false;
    this.bankKg -= kg;
    return true;
  }

  addBank(kg: number): void {
    this.bankKg = Math.max(0, this.bankKg + kg);
  }

  consumeScatter(): { chunkValueKg: number; count: number } {
    if (this.cargoKg <= 0) {
      this.cargoKg = 0;
      return { chunkValueKg: 0, count: 0 };
    }
    const chunkValue = ECONOMY_TUNING.SCATTER_CHUNK_KG;
    const count = Math.max(1, Math.ceil(this.cargoKg / chunkValue));
    const total = this.cargoKg;
    this.cargoKg = 0;
    return { chunkValueKg: total / count, count };
  }

  addCargo(kg: number): number {
    const room = this.cargoCap - this.cargoKg;
    const added = Math.min(room, kg);
    this.cargoKg += added;
    return added;
  }
}
