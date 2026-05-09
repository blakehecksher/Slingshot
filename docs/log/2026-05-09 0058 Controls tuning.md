# 2026-05-09 0058 - Controls tuning

## What was done

- Switched gamepad controls from jet-style bank/pitch to arcade 6DOF.
- Gamepad left stick now strafes horizontally and vertically.
- Gamepad right stick now yaws/pitches the ship.
- Gamepad bumpers now roll.
- Keyboard A/D now strafes, Q/E rolls, and Space/Ctrl thrust vertically.
- LT/S braking now damps current velocity, not just reverse-thrusts along the nose.
- Reduced effective forward thrust, increased reverse/brake authority, reduced strafe thrust slightly, and softened rotation rates.
- Added light overspeed damping above ~95 m/s so speed can still build but is less likely to run away.
- Updated the on-screen controls panel.

## What worked

- `npm run build` passes.
- Local dev server still responds at `http://127.0.0.1:5173/Slingshot/`.
- The changes preserve the gravity/minimap/trajectory work and only tune the control surface.

## What didn't and why

- The pass still needs hands-on feel testing with keyboard/mouse and controller. Build success can only catch syntax/API mistakes, not whether the ship feels right.

## Decisions made

none

## Left unfinished

- Human tuning pass for exact thrust/brake/rotation constants.
- M6 verdict log.

## state.md updated: yes
