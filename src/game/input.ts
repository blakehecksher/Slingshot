// Unified input → ShipCommand. Reads gamepad + keyboard + mouse and produces
// a normalized command frame that the ship layer consumes without caring
// where the bits came from.

export interface ShipCommand {
  // Thrust along ship-local axes, each in [-1, 1].
  // x = right, y = up, z = forward (negative-Z in Three convention).
  thrust: { x: number; y: number; z: number };
  // Angular velocity targets in ship-local axes, each in [-1, 1].
  // pitch = around local X, yaw = around local Y, roll = around local Z.
  rotate: { pitch: number; yaw: number; roll: number };
}

const DEADZONE = 0.15;

function applyDeadzone(v: number): number {
  if (Math.abs(v) < DEADZONE) return 0;
  const sign = Math.sign(v);
  return sign * (Math.abs(v) - DEADZONE) / (1 - DEADZONE);
}

function clamp1(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

export class Input {
  private keys = new Set<string>();
  private mouseDx = 0;
  private mouseDy = 0;
  private pointerLocked = false;

  // Mouse sensitivity: how many "input units" per pixel. Tuned by feel.
  private mouseSensitivity = 0.0035;

  // Whether mouse should drive yaw/pitch when pointer is locked.
  private mouseAimEnabled = true;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      // Prevent space scrolling, etc.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('click', () => {
      if (!this.pointerLocked) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDx += e.movementX;
        this.mouseDy += e.movementY;
      }
    });
  }

  readGamepad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (p && p.connected) return p;
    }
    return null;
  }

  // Build a ShipCommand from the current frame's input state.
  // Gamepad takes precedence on each axis; keyboard fills any axis the
  // gamepad isn't asserting. Both can contribute (additive then clamped).
  sample(): ShipCommand {
    const cmd: ShipCommand = {
      thrust: { x: 0, y: 0, z: 0 },
      rotate: { pitch: 0, yaw: 0, roll: 0 },
    };

    const pad = this.readGamepad();
    if (pad) {
      // Standard mapping: axes [LX, LY, RX, RY], buttons indexed.
      const lx = applyDeadzone(pad.axes[0] ?? 0);
      const ly = applyDeadzone(pad.axes[1] ?? 0);
      const rx = applyDeadzone(pad.axes[2] ?? 0);
      const ry = applyDeadzone(pad.axes[3] ?? 0);

      // Left stick aims (yaw + pitch). Stick down = pitch up (flight-sim style).
      cmd.rotate.yaw += lx;
      cmd.rotate.pitch += -ly;

      // Right stick: roll (X) + vertical strafe (Y).
      cmd.rotate.roll += rx;
      cmd.thrust.y += -ry;

      // Triggers: forward / backward thrust. Buttons 6=LT, 7=RT.
      const lt = pad.buttons[6]?.value ?? 0;
      const rt = pad.buttons[7]?.value ?? 0;
      cmd.thrust.z += -rt; // forward = -Z in Three convention
      cmd.thrust.z += lt;  // backward = +Z

      // Bumpers: lateral strafe. 4=LB, 5=RB.
      if (pad.buttons[4]?.pressed) cmd.thrust.x -= 1;
      if (pad.buttons[5]?.pressed) cmd.thrust.x += 1;
    }

    // Keyboard fallback / dual control.
    // Translation:
    if (this.keys.has('KeyW')) cmd.thrust.z -= 1;
    if (this.keys.has('KeyS')) cmd.thrust.z += 1;
    if (this.keys.has('KeyA')) cmd.thrust.x -= 1;
    if (this.keys.has('KeyD')) cmd.thrust.x += 1;
    if (this.keys.has('Space')) cmd.thrust.y += 1;
    if (this.keys.has('ShiftLeft') || this.keys.has('ControlLeft')) cmd.thrust.y -= 1;
    // Roll:
    if (this.keys.has('KeyQ')) cmd.rotate.roll -= 1;
    if (this.keys.has('KeyE')) cmd.rotate.roll += 1;
    // Pitch / yaw via arrow keys (when no mouse).
    if (this.keys.has('ArrowUp')) cmd.rotate.pitch += 1;
    if (this.keys.has('ArrowDown')) cmd.rotate.pitch -= 1;
    if (this.keys.has('ArrowLeft')) cmd.rotate.yaw -= 1;
    if (this.keys.has('ArrowRight')) cmd.rotate.yaw += 1;

    // Mouse aim contribution. Convert accumulated pixel deltas into a
    // per-frame normalized rotation rate, then drain the accumulator so the
    // next frame starts at zero.
    if (this.pointerLocked && this.mouseAimEnabled) {
      cmd.rotate.yaw += this.mouseDx * this.mouseSensitivity;
      cmd.rotate.pitch += -this.mouseDy * this.mouseSensitivity;
    }
    this.mouseDx = 0;
    this.mouseDy = 0;

    cmd.thrust.x = clamp1(cmd.thrust.x);
    cmd.thrust.y = clamp1(cmd.thrust.y);
    cmd.thrust.z = clamp1(cmd.thrust.z);
    cmd.rotate.pitch = clamp1(cmd.rotate.pitch);
    cmd.rotate.yaw = clamp1(cmd.rotate.yaw);
    cmd.rotate.roll = clamp1(cmd.rotate.roll);

    return cmd;
  }

  isPointerLocked(): boolean {
    return this.pointerLocked;
  }
}
