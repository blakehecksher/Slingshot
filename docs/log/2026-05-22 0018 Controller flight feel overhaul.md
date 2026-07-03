# 2026-05-22 0018 - Controller flight feel overhaul

## What was done

- Changed controller flight to arcade-racing defaults: left stick pitch/roll, right stick camera look, triggers thrust/brake, bumpers boost, and D-pad secondary strafe.
- Added radial gamepad stick shaping, trigger curves, input debug readouts, grouped Ship Feel settings, and updated controller help text.
- Replaced instant angular-velocity assignment with target angular velocity ramping, light auto-level, gravity-aware braking, and subtle well-exit assist.
- Added commanded-burn trajectory prediction plus a faint pure-drift minimap line.
- Added five lab courses for controller tuning: Thrust Brake, Offset Slalom, Soft Bend, Hook Exit, and Speed Recover.

## What worked

- `npm run build` passes.
- The fixed-step Rapier/custom-gravity stack stayed intact; changes are concentrated in input shaping, ship control response, trajectory prediction, minimap display, and course authoring.

## What didn't and why

- In-app browser automation reported `Browser is not available: iab`, so visual browser smoke testing could not run.
- A background Vite process reached ready state on port 5174 but was not reachable by the later HTTP check, matching the prior session pattern where hidden dev processes exit before smoke checks.
- Physical controller feel still needs hands-on playtesting; automation cannot validate stick feel, braking feel, rumble comfort, or gravity readability.

## Decisions made

- Default controller flight is arcade-racing oriented: right stick is camera look, not yaw/vertical strafe.
- The first pass keeps leaderboard sharing unchanged because the baseline control model changed globally rather than adding optional per-player assists.

## Left unfinished

- Manual physical-controller playtest on the five lab courses, Clear Line, Drift Yard, Soft Pull, Hook Pass, and Claim Shakedown.
- Tune radial deadzones, angular ramp rates, brake gravity blend, exit assist strength, and course medals/gates from playtest results.

## state.md updated: yes
