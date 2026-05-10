# State
_Last updated: 2026-05-09 2136_

## Current focus

Phase 2.5 feel/polish pass: gravity wells sharpened, slingshot restored, ship thrust has readable directional visual feedback, and boost plumes are nozzle-anchored after browser inspection. Ready for live tuning via P panel before Phase 3.

## What's working

- Phase 1 stack still green: Vite + strict TS, Three.js, Rapier compat, fixed timestep at 1/120s.
- `tsc --noEmit` + `vite build` both pass clean.
- Full Phase 2 run loop:
  - Asteroids have solid kinematic-position colliders. Drift tracks the collider.
  - Ship-asteroid contact above 14 m/s = death + 600 ms fade + teleport to base + 1.2 s invuln. Below threshold = velocity-damped graze.
  - Mining-by-proximity ticks cargo (kg) up to a 5000 kg cap, with `MAX_RATE_PER_AST` and `MAX_TOTAL_RATE` ceilings.
  - Energy drains only when boost is adding forward thrust. Normal thrust and strafe are free. Below 5% threshold thrust throttled to 25% (reserve crawl). 22 larger floating energy pickups seeded across the field.
  - Boost (B/Shift or top end of RT): 2.5x forward thrust, visible booster plumes, 4x energy drain scalar while boosting forward.
  - Procedural base at world origin with 80 m sensor trigger. On entry: deposit cargo into bank + refill energy + toast.
  - On death, cargo splits into 250 kg chunks scattered backward from impact direction. Chunks persist as collectable cargo pickups.
  - Selectable procedural ships inspired by concept images: Scrapper Mk-I, Tamarack-07, Veteran gravity-runner/courier, plus original Sparrow prototype. All keep named attachment-point Object3Ds: `nose`, `wing-l`, `wing-r`, `engine-l`, `engine-r`, `topspine`, `cargo-bay`.
- HUD: bottom-center status (CARGO bar, BANK, ENERGY bar with reserve flash). Toast for events. Fade overlay driven by lifecycle.
- Audio: gravity rumble (tracks pull) + hull creak (tracks proximity). Unlocks on first gesture.
- In-game lil-gui tuning panel (P): live readouts, sliders for all TUNING objects, clipboard copy, reset to defaults, per-value hover reset for modified sliders, field regenerate.
- Ship visual selection is available in the tuning panel and via V hotkey.
- Ship asset pipeline spec exists at `docs/spec/ship-asset-pipeline.md`: kit-built manifests first, full GLB/GLTF models second, primitive procedural ships as fallback.
- Gamepad: L-stick = pitch/roll, LB/RB = yaw right/left, RT/LT = forward/reverse, D-pad = strafe, B = boost, Y = camera toggle.
- Gamepad X now cycles ship visual, matching keyboard V.
- Visual polish pass:
  - ACES tone mapping + bloom render pipeline.
  - Deep-field nebula dome with background-only sun glow, richer star colors, and subtle distance fog.
  - Warm key, cyan rim, violet kicker, and hemisphere fill lights.
  - Ship/base/pickups use stronger emissive accents and local glow lights.
  - Medium/large asteroids have lightweight blue/orange mineral glints inspired by the setting concepts.
  - Ship thrusters now visibly indicate normal forward thrust, boosted thrust, reverse thrust, and lateral/vertical strafe inputs.
  - Boost plumes are anchored at nozzle bases so scaling extends outward rather than clipping through the hull.
- Audio creak is now gated by meaningful gravity pull as well as clearance, reducing lingering metal creak outside active wells.

## Known issues

- Build chunk > 500 kB warning (Three + Rapier WASM). Defer.
- Favicon 404 (cosmetic).
- Cargo chunks can spawn inside an asteroid sphere on glancing high-speed deaths. Mitigated, not eliminated. Accepted Phase 2 behavior.

## Next actions

Phase 3: upgrades + persistence.
- Persistent bank across sessions (localStorage).
- Upgrade shop at base: cargo cap, thrust, energy max, etc.
- Attachment-point visual upgrades mount on existing Object3D hooks in ship.
- Later visual pipeline: implement `ShipVisualResolver`, GLTF full-model loading, and kit manifest loading.

## Active plan

docs/plans/2026-05-09 1921 Plan - Slingshot feel.md

## Recent logs
- docs/log/2026-05-09 2136 Browser thrust and creak pass.md - verified boost plumes with Playwright, anchored plume geometry, gated creak by pull, and mapped gamepad X to ship cycling
- docs/log/2026-05-09 2126 Directional thrust visuals.md - added directional ship plume feedback for forward, boost, reverse, and strafe thrust
- docs/plans/2026-05-09 1921 Plan - Slingshot feel.md - sharpened wells, cube-scaled mass, core ramp, well-aware speed assist
- docs/log/2026-05-09 1907 Ship asset pipeline.md - documented kit/full-model/primitive ship visual pipeline and future ship-builder direction
- docs/log/2026-05-09 1908 Background sun fix.md - moved visible sun from reachable world mesh into the sky dome shader
- docs/log/2026-05-09 1854 Lighting polish.md - added concept-inspired deep-field lighting, bloom, local emissive accents, and asteroid glints
- docs/log/2026-05-09 1840 Ship variants and boost.md - added concept-inspired ship variants, ship selector, and thrust-mapped boost visuals
- docs/log/2026-05-09 1831 Apply 03 defaults.md - promoted `Blake/config-values/03.json` tuning values into source defaults
- docs/log/2026-05-09 1820 Tuning per-value reset.md - added hover-only per-value default reset buttons to modified tuning controls
- docs/log/2026-05-09 1730 Phase 2 feel-test.md - Phase 2 verdict: loop is fun, Phase 3 earned
- docs/log/2026-05-09 1059 Phase 2 M1-M5 implementation.md - M1-M5 implemented; ship art + attachment points
- docs/log/2026-05-09 1047 Phase 2 kickoff.md - Phase 2 plan written, implementation begun
- docs/log/2026-05-09 0110 Look-only right stick.md - controller right stick is camera-only
- docs/log/2026-05-09 0106 Ship-relative camera controls.md - chase camera inherits ship orientation
- docs/log/2026-05-09 0058 Controls tuning.md - 6DOF controls + brake damping + overspeed assist
- docs/log/2026-05-09 0054 M2-M5 gravity field.md - Phase 1 M2-M5 features
- docs/log/2026-05-08 2318 M1 free flight.md - Phase 1 M1 ship rigid body + camera + input
- docs/log/2026-05-08 2251 Kickoff.md - project kickoff + Phase 1 plan
