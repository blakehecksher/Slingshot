# State
_Last updated: 2026-05-09 0110_

## Current focus

Phase 1 is implemented through the M5 feature set and is now in M6 feel tuning. The latest pass makes controller right stick look-only and maps ship flight back onto the left stick.

## What's working

- M0/M1 stack still builds: Vite + strict TypeScript, Three.js, Rapier compat, fixed timestep.
- Rapier timestep is explicitly set to 1/120s to match the game loop.
- Ship thrust and gravity both apply as per-tick impulses, matching the existing M1 force decision.
- Static and drifting procedural asteroids render as irregular displaced icosahedrons with warm/desaturated materials.
- Custom gravity samples all asteroids with softening and is shared by live physics and trajectory prediction.
- World-space trajectory ribbon predicts roughly 8s ahead and color-grades green/yellow/red by asteroid clearance.
- Top-right minimap shows nearby asteroids, ship orientation, and predicted path.
- Camera-only shake and gamepad rumble intensity scale with gravity pull.
- Chase camera position and orientation both inherit ship rotation, so roll stays attached to the hull instead of being rebuilt against world-up.
- Controller controls now avoid lateral strafe and bumper flight controls: left stick rolls/pitches the ship, right stick only looks around, triggers thrust/brake.
- LT/S braking applies velocity damping, and a light overspeed assist begins above ~95 m/s.
- `npm run build` passes. The known large bundle warning remains.
- Local dev server is running at `http://127.0.0.1:5173/Slingshot/`.

## In progress

M6 feel-test/tuning. Needs real flying with keyboard/mouse and preferably Xbox controller to judge whether the ship-relative camera, left-stick roll/pitch, right-stick look, braking, gravity strength, prediction usefulness, shake intensity, and populated-field performance feel right.

## Known issues

- Build chunk > 500kB warning (expected: Three + Rapier + inlined WASM). Defer.
- Favicon 404 in console (cosmetic).
- Browser screenshot automation was not completed in this session; Chrome headless returned without writing a screenshot. Build and HTTP smoke checks passed.
- M6 verdict is not written yet because it requires an actual feel-test.

## Next actions
1. Play the local build and tune control constants: forward/reverse thrust, brake damping, overspeed thresholds, and pitch/yaw/roll rates.
2. Test with an Xbox controller for axis feel, braking, rumble intensity, and nausea.
3. Write `docs/log/<timestamp> Phase 1 feel-test.md` with the honest M6 verdict.

## Active plan
docs/plans/2026-05-08 2251 Plan - Phase 1 Gravity.md

## Recent logs
- docs/log/2026-05-09 0110 Look-only right stick.md - mapped controller right stick to camera look only and left stick to roll/pitch flight
- docs/log/2026-05-09 0106 Ship-relative camera controls.md - made chase camera inherit ship orientation and removed lateral strafe from default controls
- docs/log/2026-05-09 0058 Controls tuning.md - switched to 6DOF controls, added real brake damping and light overspeed assist
- docs/log/2026-05-09 0054 M2-M5 gravity field.md - implemented gravity asteroids, trajectory/minimap, feedback, populated field; M6 needs feel-test
- docs/log/2026-05-08 2318 M1 free flight.md - modules split, ship rigid body + thrust + rotation + cockpit camera + input wired and verified
- docs/log/2026-05-08 2251 Kickoff.md - project kickoff, Phase 1 plan written, M0 scaffold + local verification
