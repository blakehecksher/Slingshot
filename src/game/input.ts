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
  // Boost intensity [0, 1]. Multiplies forward thrust and energy drain.
  // Gamepad can trigger this with B, or by pulling RT into its top range.
  boost: number;
  // Hold-fire weapon trigger.
  fire: boolean;
  // Edge events (true on the frame they fire, then auto-clear).
  toggleCameraMode: boolean;
  cycleShipVisual: boolean;
  toggleHangar: boolean;
  toggleLock: boolean;
  restartRace: boolean;
  startRace: boolean;
  courseIndex: number | null;
  courseDelta: number;
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
  private pendingShipCycle = false;
  private pendingHangarToggle = false;
  private pendingLockToggle = false;
  private pendingRaceRestart = false;
  private pendingRaceStart = false;
  private pendingCourseIndex: number | null = null;

  // Previous gamepad button states, for edge detection.
  private prevPadButtons: boolean[] = [];

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (isTextInputTarget(e.target)) return;
      // KeyC toggles camera; consume on first press only (no repeat fire).
      if (e.code === 'KeyC' && !e.repeat) this.pendingCameraToggle = true;
      if (e.code === 'KeyV' && !e.repeat) this.pendingShipCycle = true;
      if ((e.code === 'Tab' || e.code === 'KeyT' || e.code === 'KeyY') && !e.repeat) {
        this.pendingHangarToggle = true;
        if (e.code === 'Tab') e.preventDefault();
      }
      if (e.code === 'KeyL' && !e.repeat) this.pendingLockToggle = true;
      if (e.code === 'KeyR' && !e.repeat) this.pendingRaceRestart = true;
      if (e.code === 'Enter' && !e.repeat) this.pendingRaceStart = true;
      if (e.code === 'Digit1' && !e.repeat) this.pendingCourseIndex = 0;
      if (e.code === 'Digit2' && !e.repeat) this.pendingCourseIndex = 1;
      if (e.code === 'Digit3' && !e.repeat) this.pendingCourseIndex = 2;
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
  // Xbox standard mapping:
  //   L stick X (axis 0)         → roll
  //   L stick Y (axis 1)         → pitch (inverted: back = nose up)
  //   R stick X (axis 2)         → yaw / rudder
  //   R stick Y (axis 3)         → vertical strafe
  //   LT (button 6, analog)      → reverse / brake
  //   RT (button 7, analog)      → forward thrust
  //   LB (button 4)              → strafe left
  //   RB (button 5)              → strafe right
  //   B  (button 1)              → boost (drains energy faster, more thrust)
  //   Y  (button 3)              → toggle camera mode
  //   D-pad up (12)              → strafe up
  //   D-pad down (13)            → strafe down
  //   D-pad left (14)            → strafe left
  //   D-pad right (15)           → strafe right
  sample(): ShipCommand {
    const cmd: ShipCommand = {
      thrust: { x: 0, y: 0, z: 0 },
      rotate: { pitch: 0, yaw: 0, roll: 0 },
      look: { yaw: 0, pitch: 0 },
      boost: 0,
      fire: false,
      toggleCameraMode: false,
      cycleShipVisual: false,
      toggleHangar: false,
      toggleLock: false,
      restartRace: false,
      startRace: false,
      courseIndex: null,
      courseDelta: 0,
    };

    const pad = this.readGamepad();
    if (pad) {
      const lx = applyDeadzone(pad.axes[0] ?? 0);
      const ly = applyDeadzone(pad.axes[1] ?? 0);
      const rx = applyDeadzone(pad.axes[2] ?? 0);
      const ry = applyDeadzone(pad.axes[3] ?? 0);

      // L stick: primary attitude. Right stick: rudder + lift trim for
      // threading gates without taking pitch/roll off the left thumb.
      cmd.rotate.roll += lx;
      cmd.rotate.pitch += ly;
      cmd.rotate.yaw += -rx;
      cmd.thrust.y += -ry;

      // Triggers: forward (RT) / reverse (LT) thrust.
      const lt = pad.buttons[6]?.value ?? 0;
      const rt = pad.buttons[7]?.value ?? 0;
      cmd.thrust.z += -rt; // forward = -Z
      cmd.thrust.z += lt;  // reverse = +Z

      // LB / RB: lateral thrusters for quick gate correction.
      if (pad.buttons[4]?.pressed) cmd.thrust.x -= 1;  // LB = strafe left
      if (pad.buttons[5]?.pressed) cmd.thrust.x += 1;  // RB = strafe right

      // D-pad: strafe (lateral + vertical thrust).
      if (pad.buttons[12]?.pressed) cmd.thrust.y += 1;  // up
      if (pad.buttons[13]?.pressed) cmd.thrust.y -= 1;  // down
      if (pad.buttons[14]?.pressed) cmd.thrust.x -= 1;  // left
      if (pad.buttons[15]?.pressed) cmd.thrust.x += 1;  // right

      // Boost: B button only. (RT is forward thrust and never drains energy.)
      cmd.boost = Math.max(
        cmd.boost,
        pad.buttons[1]?.value ?? (pad.buttons[1]?.pressed ? 1 : 0),
      );

      // Y button (b3): hangar open/close (edge-triggered). Inside the
      // hangar this is read by HangarUI.pollGamepad and ignored here.
      const yPressed = pad.buttons[3]?.pressed ?? false;
      if (yPressed && !this.prevPadButtons[3]) cmd.toggleHangar = true;

      // X button: cycle ship visual.
      const xPressed = pad.buttons[2]?.pressed ?? false;
      if (xPressed && !this.prevPadButtons[2]) cmd.cycleShipVisual = true;

      // A button (b0): fire weapon (held) and menu confirm on edge.
      const aPressed = pad.buttons[0]?.pressed ?? false;
      if (aPressed) cmd.fire = true;
      if (aPressed && !this.prevPadButtons[0]) cmd.startRace = true;

      // Back/Select (b8): camera toggle.
      const backPressed = pad.buttons[8]?.pressed ?? false;
      if (backPressed && !this.prevPadButtons[8]) cmd.toggleCameraMode = true;

      // R3 click (b11 in standard mapping; some pads expose it as b10):
      // toggle target lock-on.
      const r3Pressed = (pad.buttons[11]?.pressed ?? false) || (pad.buttons[10]?.pressed ?? false);
      const r3Prev = (this.prevPadButtons[11] ?? false) || (this.prevPadButtons[10] ?? false);
      if (r3Pressed && !r3Prev) cmd.toggleLock = true;

      const startPressed = pad.buttons[9]?.pressed ?? false;
      if (startPressed && !this.prevPadButtons[9]) {
        cmd.restartRace = true;
        cmd.startRace = true;
      }

      const dUpPressed = pad.buttons[12]?.pressed ?? false;
      const dDownPressed = pad.buttons[13]?.pressed ?? false;
      const dLeftPressed = pad.buttons[14]?.pressed ?? false;
      const dRightPressed = pad.buttons[15]?.pressed ?? false;
      if ((dUpPressed && !this.prevPadButtons[12]) || (dLeftPressed && !this.prevPadButtons[14])) {
        cmd.courseDelta -= 1;
      }
      if ((dDownPressed && !this.prevPadButtons[13]) || (dRightPressed && !this.prevPadButtons[15])) {
        cmd.courseDelta += 1;
      }

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

    // Shift = boost (keyboard).
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) cmd.boost = 1;

    // F = fire weapon (held).
    if (this.keys.has('KeyF')) cmd.fire = true;

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
    if (this.pendingShipCycle) {
      cmd.cycleShipVisual = true;
      this.pendingShipCycle = false;
    }
    if (this.pendingHangarToggle) {
      cmd.toggleHangar = true;
      this.pendingHangarToggle = false;
    }
    if (this.pendingLockToggle) {
      cmd.toggleLock = true;
      this.pendingLockToggle = false;
    }
    if (this.pendingRaceRestart) {
      cmd.restartRace = true;
      this.pendingRaceRestart = false;
    }
    if (this.pendingRaceStart) {
      cmd.startRace = true;
      this.pendingRaceStart = false;
    }
    if (this.pendingCourseIndex !== null) {
      cmd.courseIndex = this.pendingCourseIndex;
      this.pendingCourseIndex = null;
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

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}
