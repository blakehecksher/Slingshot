import * as THREE from 'three';

type HapticGamepad = Gamepad & {
  vibrationActuator?: {
    playEffect?: (
      type: 'dual-rumble',
      params: {
        startDelay: number;
        duration: number;
        weakMagnitude: number;
        strongMagnitude: number;
      },
    ) => Promise<unknown>;
  };
};

export const FEEDBACK_TUNING = {
  // Stress = magnitude of gravity-vector jerk (m/s³) + thrust opposing pull.
  // Stable orbit has near-constant gravity → near-zero jerk → no rumble.
  // Close flyby flips the gravity vector fast → spike → rumble.
  JERK_THRESHOLD: 4,
  JERK_REF: 35,
  // When pilot thrust opposes gravity direction in a real well, add stress.
  THRUST_OPPOSE_REF: 6,
  // Smoothing on stress signal so rumble doesn't pop.
  STRESS_RISE_TAU: 0.08,
  STRESS_FALL_TAU: 0.35,
  // Camera shake amplitude scaling.
  SHAKE_AMP: 0.12,
  // Haptics gating.
  HAPTIC_MIN: 0.15,
  HAPTIC_INTERVAL: 0.18,
  HAPTIC_DURATION_MS: 140,
};

export class GravityFeedback {
  private intensity = 0;
  private rumbleCooldown = 0;
  private time = 0;
  private offset = new THREE.Vector3();
  private prevGravity = new THREE.Vector3();
  private hasPrev = false;
  private _jerk = new THREE.Vector3();
  private _gravDir = new THREE.Vector3();
  private _thrustWorld = new THREE.Vector3();

  /** Drives camera shake + haptics from the *change* of the gravity field
   *  (jerk), not its magnitude. Stable orbits stay quiet; close flybys ramp.
   *  `thrustWorld` is the pilot's commanded thrust vector in world space; if
   *  it opposes gravity, that adds to stress. */
  update(
    gravity: THREE.Vector3,
    thrustWorld: THREE.Vector3 | null,
    dt: number,
    pad: Gamepad | null,
  ): void {
    this.time += dt;

    if (this.hasPrev && dt > 0) {
      this._jerk.copy(gravity).sub(this.prevGravity).divideScalar(dt);
    } else {
      this._jerk.set(0, 0, 0);
    }
    this.prevGravity.copy(gravity);
    this.hasPrev = true;

    const jerkMag = this._jerk.length();
    const jerkStress = Math.max(0, (jerkMag - FEEDBACK_TUNING.JERK_THRESHOLD) / FEEDBACK_TUNING.JERK_REF);

    let opposeStress = 0;
    const pullMag = gravity.length();
    if (pullMag > 0.01 && thrustWorld && thrustWorld.lengthSq() > 0.0001) {
      this._gravDir.copy(gravity).divideScalar(pullMag);
      this._thrustWorld.copy(thrustWorld);
      // Negative dot = thrust pointing against gravity = pilot fighting pull.
      const oppose = -this._thrustWorld.dot(this._gravDir);
      if (oppose > 0) {
        opposeStress = (oppose * pullMag) / FEEDBACK_TUNING.THRUST_OPPOSE_REF;
      }
    }

    const target = Math.max(0, Math.min(1, jerkStress + opposeStress));
    const tau = target > this.intensity ? FEEDBACK_TUNING.STRESS_RISE_TAU : FEEDBACK_TUNING.STRESS_FALL_TAU;
    const follow = 1 - Math.exp(-dt / tau);
    this.intensity += (target - this.intensity) * follow;

    this.rumbleCooldown -= dt;
    if (pad && this.intensity > FEEDBACK_TUNING.HAPTIC_MIN && this.rumbleCooldown <= 0) {
      this.rumbleCooldown = FEEDBACK_TUNING.HAPTIC_INTERVAL;
      const haptic = pad as HapticGamepad;
      void haptic.vibrationActuator?.playEffect?.('dual-rumble', {
        startDelay: 0,
        duration: FEEDBACK_TUNING.HAPTIC_DURATION_MS,
        weakMagnitude: Math.min(0.75, this.intensity * 0.7),
        strongMagnitude: Math.min(1, this.intensity),
      });
    }
  }

  apply(camera: THREE.Camera): void {
    if (this.intensity <= 0.001) return;

    const amp = this.intensity * FEEDBACK_TUNING.SHAKE_AMP;
    this.offset.set(
      Math.sin(this.time * 53.1) * amp,
      Math.sin(this.time * 71.7 + 1.8) * amp * 0.65,
      Math.sin(this.time * 43.3 + 0.7) * amp * 0.35,
    );
    this.offset.applyQuaternion(camera.quaternion);
    camera.position.add(this.offset);
  }

  get level(): number {
    return this.intensity;
  }
}
