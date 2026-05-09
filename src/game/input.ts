// Unified input → ShipCommand. Reads gamepad + keyboard + (pointer-locked)
// mouse and produces a normalized command frame the ship + camera consume.

export interface ShipCommand {
  // Thrust along ship-local axes, each in [-1, 1].
  // x = right, y = up, z = forward (negative-Z in Three convention).
  thrust: { x: number; y: number; z: number };
  // Angular velocity targets in ship-local axes, each in [-1, 1].
  // pitch = around local X, yaw = around local Y, roll = around local Z.
  rotate: { pitch: number; yaw: number; roll: number };
  // Free-look orbit input for the camera. Rotates the chase-cam offset
  // around the ship; does NOT change ship orientation. [-1, 1].
  look: { yaw: number; pitch: number };
  // Edge events (true on the frame they fire, then auto-clear).
  toggleCameraMode: boolean;
}

const DEADZONE = 0.12;

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
  private mouseSensitivity = 0.0035;

  // Edge-triggered toggle requests, drained on each sample().
  private pendingCameraToggle = false;

  // Previous gamepad button states, for edge detection.
  private prevPadButtons: boolean[] = [];

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      // KeyC toggles camera; consume on first press only (no repeat fire).
      if (e.code === 'KeyC' && !e.repeat) this.pendingCameraToggle = true;
      this.keys.add(e.code);
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

    // Browsers expose connect/disconnect events for diagnostics. We log them
    // via console + dispatch a custom event the HUD can listen for.
    window.addEventListener('gamepadconnected', (e: Event) => {
      const ge = e as GamepadEvent;
      console.log('[gamepad] connected', {
        index: ge.gamepad.index,
        id: ge.gamepad.id,
        mapping: ge.gamepad.mapping,
        axes: ge.gamepad.axes.length,
        buttons: ge.gamepad.buttons.length,
      });
    });
    window.addEventListener('gamepaddisconnected', (e: Event) => {
      const ge = e as GamepadEvent;
      console.log('[gamepad] disconnected', { index: ge.gamepad.index, id: ge.gamepad.id });
    });
  }

  readGamepad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? [];
    // Prefer a connected pad with the standard mapping. Other devices (some
    // keyboards, mice, audio interfaces) register as HID gamepads with
    // non-standard mapping and would otherwise hijack pad slot 0.
    for (const p of pads) {
      if (p && p.connected && p.mapping === 'standard') return p;
    }
    // Fallback: any connected pad. Will hit if the user's controller exposes
    // a non-standard mapping (rare on Xbox/Playstation, common on flight HOTAS).
    for (const p of pads) {
      if (p && p.connected) return p;
    }
    return null;
  }

  // Build a ShipCommand for this tick.
  // Current gamepad feel target: left stick flies the ship (roll + pitch),
  // right stick looks around without steering, triggers handle thrust/brake.
  // Xbox standard mapping. Jet-pilot layout: L stick is the cockpit
  // flight stick (roll + pitch). R stick is dedicated camera. No strafe —
  // the ship goes where it points, like a jet.
  //
  //   L stick X (axis 0) → roll  (banking — primary turn input)
  //   L stick Y (axis 1) → pitch inverted: stick back (+) = nose up
  //   R stick X (axis 2) → camera yaw   (X inverted: push right = look right)
  //   R stick Y (axis 3) → camera pitch (inverted: stick back = look up)
  //   LT (button 6)      → reverse thrust
  //   RT (button 7)      → forward thrust
  //   LB (button 4)      → yaw left  (rudder)
  //   RB (button 5)      → yaw right (rudder)
  //   Y  (button 3)      → toggle camera mode (cockpit/chase)
  sample(): ShipCommand {
    const cmd: ShipCommand = {
      thrust: { x: 0, y: 0, z: 0 },
      rotate: { pitch: 0, yaw: 0, roll: 0 },
      look: { yaw: 0, pitch: 0 },
      toggleCameraMode: false,
    };

    const pad = this.readGamepad();
    if (pad) {
      const lx = applyDeadzone(pad.axes[0] ?? 0);
      const ly = applyDeadzone(pad.axes[1] ?? 0);
      const rx = applyDeadzone(pad.axes[2] ?? 0);
      const ry = applyDeadzone(pad.axes[3] ?? 0);

      // L stick: flight control. Right stick: camera look only.
      cmd.rotate.roll += lx;
      cmd.rotate.pitch += ly;
      cmd.look.yaw += -rx;
      cmd.look.pitch += -ry;

      // Triggers: forward (RT) / reverse (LT) thrust.
      const lt = pad.buttons[6]?.value ?? 0;
      const rt = pad.buttons[7]?.value ?? 0;
      cmd.thrust.z += -rt; // forward = -Z
      cmd.thrust.z += lt;  // reverse = +Z

      // Y button: camera mode toggle (edge-triggered).
      const yPressed = pad.buttons[3]?.pressed ?? false;
      if (yPressed && !this.prevPadButtons[3]) cmd.toggleCameraMode = true;

      // Snapshot button states for next frame.
      this.prevPadButtons = pad.buttons.map((b) => b.pressed);
    }

    // Keyboard, jet-pilot mapping. No strafe — point and thrust.
    //   W / S       — thrust forward / reverse
    //   A / D       — roll left / right (banking)
    //   Q / E       — yaw left / right (rudder)
    //   Arrow keys  — pitch + yaw (alt for mouse)
    //   Mouse       — yaw + pitch (pitch inverted: drag down = nose down)
    if (this.keys.has('KeyW')) cmd.thrust.z -= 1;
    if (this.keys.has('KeyS')) cmd.thrust.z += 1;

    if (this.keys.has('KeyA')) cmd.rotate.roll -= 1;
    if (this.keys.has('KeyD')) cmd.rotate.roll += 1;

    if (this.keys.has('Space')) cmd.thrust.y += 1;
    if (this.keys.has('ControlLeft') || this.keys.has('ControlRight')) cmd.thrust.y -= 1;

    if (this.keys.has('KeyQ')) cmd.rotate.yaw -= 1;
    if (this.keys.has('KeyE')) cmd.rotate.yaw += 1;

    if (this.keys.has('ArrowUp')) cmd.rotate.pitch += 1;
    if (this.keys.has('ArrowDown')) cmd.rotate.pitch -= 1;
    if (this.keys.has('ArrowLeft')) cmd.rotate.yaw -= 1;
    if (this.keys.has('ArrowRight')) cmd.rotate.yaw += 1;

    // Mouse aim (pointer-locked) → ship rotation.
    if (this.pointerLocked) {
      cmd.rotate.yaw   += this.mouseDx * this.mouseSensitivity;
      cmd.rotate.pitch += -this.mouseDy * this.mouseSensitivity;
    }
    this.mouseDx = 0;
    this.mouseDy = 0;

    // Drain edge events.
    if (this.pendingCameraToggle) {
      cmd.toggleCameraMode = true;
      this.pendingCameraToggle = false;
    }

    cmd.thrust.x = clamp1(cmd.thrust.x);
    cmd.thrust.y = clamp1(cmd.thrust.y);
    cmd.thrust.z = clamp1(cmd.thrust.z);
    cmd.rotate.pitch = clamp1(cmd.rotate.pitch);
    cmd.rotate.yaw = clamp1(cmd.rotate.yaw);
    cmd.rotate.roll = clamp1(cmd.rotate.roll);
    cmd.look.yaw = clamp1(cmd.look.yaw);
    cmd.look.pitch = clamp1(cmd.look.pitch);

    return cmd;
  }

  isPointerLocked(): boolean {
    return this.pointerLocked;
  }
}
