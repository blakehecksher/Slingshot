status: complete

# Plan - Controller Flight Feel Overhaul
_Created: 2026-05-22 0018_

## Goal

Make controller flight feel more arcade-racing focused, recoverable, and readable around gravity without replacing the fixed-step Rapier/custom-gravity stack.

## Steps
1. Remap controller flight so left stick controls pitch/roll, right stick controls camera free-look, triggers control thrust/brake, bumpers boost, and D-pad remains secondary strafe.
2. Replace per-axis gamepad deadzones with radial stick shaping, trigger curves, and debug visibility for raw/curved inputs.
3. Replace instant angular-velocity assignment with a target angular controller using acceleration/deceleration limits and light auto-level behavior.
4. Add gravity-aware braking, subtle well-exit assist, and commanded-burn trajectory prediction alongside pure drift.
5. Add flight-lab courses for thrust/brake, offset slalom, soft bend, hook exit, and high-speed recovery tuning.
6. Build-check and document remaining hands-on controller/browser verification needs.

## Notes

- Build passes with the existing Vite large-chunk warning.
- In-app browser automation was unavailable, so visual/controller playtest remains manual.
