# 2026-05-22 0038 - Stick throttle controller trial

## What was done

- Remapped controller flight to a new trial layout: left stick Y forward/reverse thrust, left stick X lateral strafe, right stick pitch/roll, LT/RT analog yaw, LB/RB boost, and D-pad secondary strafe.
- Updated in-game controller help, pad debug trigger label, and lab/tutorial copy that still referred to RT/LT thrust or left-stick steering.

## What worked

- The remap is small and stays within the existing shaped-input and angular-ramp controller stack.
- `npm run build` passes.

## What didn't and why

- Not playtested by automation or physical controller yet; this is intentionally a feel trial.

## Decisions made

- Trial the stick-throttle controller layout and treat it as superseding the previous right-stick-camera default unless hands-on testing rejects it.

## Left unfinished

- Physical controller playtest on Lab: Thrust Brake, Lab: Offset Slalom, Lab: Soft Bend, Lab: Hook Exit, and a normal training course.
- Tune thrust/strafe/rotation/yaw sensitivity after hands-on feel testing.

## state.md updated: yes
