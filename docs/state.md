# State
_Last updated: 2026-05-08 2318_

## Current focus

Phase 1, M1 — **mechanically complete**, awaiting human feel-check with a real Xbox controller. Free flight in empty space behaves as designed: thrust accelerates linearly, momentum is preserved on release, reverse thrust slows. Cockpit camera tracks ship orientation. Gamepad + keyboard + mouse all wired.

## What's working

- M0 stack still good: Vite + TS strict, Three.js, Rapier-compat, Pages auto-deploy.
- Modules split: `src/physics/world.ts`, `src/render/scene.ts`, `src/game/{input,ship}.ts`, `src/main.ts`.
- Ship is a Rapier dynamic body with a cuboid collider tuned for mass = 1 kg. Collision groups zeroed (no contacts in Phase 1).
- Thrust: `applyImpulse(force × dt)` per tick. Rotation: direct `setAngvel` per tick from input.
- Free-flight verification (headless Chrome via Playwright):
  - Forward thrust 1s → ~30 m/s (matches FORWARD_THRUST = 30 m/s²).
  - 2s drift after release → speed unchanged (inertia preserved, no drag).
  - Reverse thrust 1s → ~13 m/s deceleration (matches REVERSE_THRUST = 18 m/s²).
- Cockpit camera mounted at body origin, inherits ship orientation. Ship mesh hidden in cockpit view.
- HUD: fps, physics dt, live speed, gamepad-detected indicator, mouse-capture hint.

## In progress

Nothing in code. Waiting for the user's IRL controller test before declaring M1 closed and moving to M2.

## Known issues

- Build chunk > 500kB warning (expected: Three + Rapier + inlined WASM). Defer.
- Favicon 404 in console (cosmetic).

## Next actions
1. Push M1 → live deploy → user tests with real Xbox controller. Confirm gates: feels like flying, no nausea, axes correct.
2. If feel is off, tune `FORWARD_THRUST`, `STRAFE_THRUST`, `MAX_*_RATE`, mouse sensitivity, deadzone, key/axis mappings before moving on.
3. Begin M2 — static asteroids with custom Newtonian gravity. (Central gate of Phase 1.)

## Active plan
docs/plans/2026-05-08 2251 Plan - Phase 1 Gravity.md

## Recent logs
- docs/log/2026-05-08 2251 Kickoff.md — project kickoff, Phase 1 plan written, M0 scaffold + local verification
- docs/log/2026-05-08 2318 M1 free flight.md — modules split, ship rigid body + thrust + rotation + cockpit camera + input wired and verified
