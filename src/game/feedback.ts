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

export class GravityFeedback {
  private intensity = 0;
  private rumbleCooldown = 0;
  private time = 0;
  private offset = new THREE.Vector3();

  update(gravityPull: number, dt: number, pad: Gamepad | null): void {
    this.time += dt;
    const target = Math.max(0, Math.min(1, (gravityPull - 0.7) / 5.5));
    const follow = 1 - Math.exp(-dt * 8);
    this.intensity += (target - this.intensity) * follow;

    this.rumbleCooldown -= dt;
    if (pad && this.intensity > 0.08 && this.rumbleCooldown <= 0) {
      this.rumbleCooldown = 0.18;
      const haptic = pad as HapticGamepad;
      void haptic.vibrationActuator?.playEffect?.('dual-rumble', {
        startDelay: 0,
        duration: 140,
        weakMagnitude: Math.min(0.75, this.intensity * 0.7),
        strongMagnitude: Math.min(1, this.intensity),
      });
    }
  }

  apply(camera: THREE.Camera): void {
    if (this.intensity <= 0.001) return;

    const amp = this.intensity * 0.12;
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
