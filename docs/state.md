# State
_Last updated: 2026-05-09 1730_

## Current focus

Phase 2 complete. Full run loop shipped and feel-tested. Phase 3 (upgrades + persistence) is next.

## What's working

- Phase 1 stack still green: Vite + strict TS, Three.js, Rapier compat, fixed timestep at 1/120s.
- `tsc --noEmit` + `vite build` both pass clean.
- Full Phase 2 run loop:
  - Asteroids have solid kinematic-position colliders. Drift tracks the collider.
  - Ship-asteroid contact above 14 m/s = death + 600 ms fade + teleport to base + 1.2 s invuln. Below threshold = velocity-damped graze.
  - Mining-by-proximity ticks cargo (kg) up to a 5000 kg cap, with `MAX_RATE_PER_AST` and `MAX_TOTAL_RATE` ceilings.
  - Energy drains **only** when boost held (B button / Shift). Normal thrust and strafe are free. Below 5% threshold thrust throttled to 25% (reserve crawl). 22 floating energy pickups seeded across the field.
  - Boost (B/Shift): 2.5× forward thrust, 4× energy drain rate while held.
  - Procedural base at world origin with 80 m sensor trigger. On entry: deposit cargo into bank + refill energy + toast.
  - On death, cargo splits into 250 kg chunks scattered backward from impact direction. Chunks persist as collectable cargo pickups.
  - Sparrow-style ship (cream/orange/teal) with named attachment-point Object3Ds: `nose`, `wing-l`, `wing-r`, `engine-l`, `engine-r`, `topspine`, `cargo-bay`.
- HUD: bottom-center status (CARGO bar, BANK, ENERGY bar with reserve flash). Toast for events. Fade overlay driven by lifecycle.
- Audio: gravity rumble (tracks pull) + hull creak (tracks proximity). Unlocks on first gesture.
- In-game lil-gui tuning panel (P): live readouts, sliders for all TUNING objects, clipboard copy, reset to defaults, field regenerate.
- Gamepad: L-stick = pitch/roll, LB/RB = yaw right/left, RT/LT = forward/reverse, D-pad = strafe, B = boost, Y = camera toggle.

## Known issues

- Build chunk > 500 kB warning (Three + Rapier WASM). Defer.
- Favicon 404 (cosmetic).
- Cargo chunks can spawn inside an asteroid sphere on glancing high-speed deaths. Mitigated, not eliminated. Accepted Phase 2 behavior.

## Next actions

Phase 3: upgrades + persistence.
- Persistent bank across sessions (localStorage).
- Upgrade shop at base: cargo cap, thrust, energy max, etc.
- Attachment-point visual upgrades mount on existing Object3D hooks in ship.

## Active plan

None. Phase 2 plan marked complete.

## Recent logs
- docs/log/2026-05-09 1730 Phase 2 feel-test.md — Phase 2 verdict: loop is fun, Phase 3 earned
- docs/log/2026-05-09 1059 Phase 2 M1-M5 implementation.md — M1-M5 implemented; ship art + attachment points
- docs/log/2026-05-09 1047 Phase 2 kickoff.md — Phase 2 plan written, implementation begun
- docs/log/2026-05-09 0110 Look-only right stick.md — controller right stick is camera-only
- docs/log/2026-05-09 0106 Ship-relative camera controls.md — chase camera inherits ship orientation
- docs/log/2026-05-09 0058 Controls tuning.md — 6DOF controls + brake damping + overspeed assist
- docs/log/2026-05-09 0054 M2-M5 gravity field.md — Phase 1 M2-M5 features
- docs/log/2026-05-08 2318 M1 free flight.md — Phase 1 M1 ship rigid body + camera + input
- docs/log/2026-05-08 2251 Kickoff.md — project kickoff + Phase 1 plan
