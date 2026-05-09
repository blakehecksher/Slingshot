import * as THREE from 'three';
import type { Ship } from './ship';

// Tunables.
export const LIFECYCLE_TUNING = {
  DEATH_FADE_MS: 600,
  RESPAWN_FADE_MS: 450,
  INVULN_AFTER_RESPAWN_MS: 1200,
  // Speed below which a ship-asteroid contact is a graze, not a death.
  // Ship speed (not relative — asteroid drift is small). Tuned for feel:
  // brushing a rock at low speed survives; slamming one above ~mid-throttle
  // cruise speed kills you. Tune up if grazes feel too fragile.
  DEATH_SPEED_THRESHOLD: 14,
  // Energy of a graze: scale linvel by this factor on contact.
  GRAZE_VELOCITY_DAMP: 0.55,
};

export type LifecycleState = 'alive' | 'dying' | 'respawning' | 'invuln';

export interface LifecycleHooks {
  onDeath?(deathPos: THREE.Vector3, deathVel: THREE.Vector3): void;
  onRespawn?(): void;
  onInvulnEnd?(): void;
}

export class Lifecycle {
  private state: LifecycleState = 'alive';
  private timer = 0;
  private deathPos = new THREE.Vector3();
  private deathVel = new THREE.Vector3();
  private respawnPos = new THREE.Vector3();
  private hooks: LifecycleHooks;
  private ship: Ship;

  constructor(ship: Ship, respawnPos: THREE.Vector3, hooks: LifecycleHooks = {}) {
    this.ship = ship;
    this.respawnPos.copy(respawnPos);
    this.hooks = hooks;
  }

  setRespawnPos(p: THREE.Vector3): void {
    this.respawnPos.copy(p);
  }

  /** 0 = clear, 1 = full black. Drives the fade overlay. */
  get fadeAlpha(): number {
    if (this.state === 'dying') {
      return Math.min(1, this.timer / LIFECYCLE_TUNING.DEATH_FADE_MS);
    }
    if (this.state === 'respawning') {
      return Math.max(0, 1 - this.timer / LIFECYCLE_TUNING.RESPAWN_FADE_MS);
    }
    return 0;
  }

  get current(): LifecycleState {
    return this.state;
  }

  isAlive(): boolean {
    return this.state === 'alive' || this.state === 'invuln';
  }

  /** Trigger a death. Idempotent within a death cycle. */
  die(deathPos: THREE.Vector3, deathVel: THREE.Vector3): void {
    if (this.state !== 'alive' && this.state !== 'invuln') return;
    this.state = 'dying';
    this.timer = 0;
    this.deathPos.copy(deathPos);
    this.deathVel.copy(deathVel);
    this.ship.setFrozen(true);
    this.hooks.onDeath?.(this.deathPos, this.deathVel);
  }

  update(dt: number): void {
    if (this.state === 'alive') return;
    const dtMs = dt * 1000;
    this.timer += dtMs;

    if (this.state === 'dying' && this.timer >= LIFECYCLE_TUNING.DEATH_FADE_MS) {
      // Teleport + start respawn fade.
      this.ship.teleport(this.respawnPos);
      this.ship.setFrozen(false);
      this.ship.setInvulnerable(true);
      this.hooks.onRespawn?.();
      this.state = 'respawning';
      this.timer = 0;
      return;
    }

    if (this.state === 'respawning' && this.timer >= LIFECYCLE_TUNING.RESPAWN_FADE_MS) {
      this.state = 'invuln';
      this.timer = 0;
      return;
    }

    if (this.state === 'invuln' && this.timer >= LIFECYCLE_TUNING.INVULN_AFTER_RESPAWN_MS) {
      this.ship.setInvulnerable(false);
      this.state = 'alive';
      this.timer = 0;
      this.hooks.onInvulnEnd?.();
      return;
    }
  }
}
