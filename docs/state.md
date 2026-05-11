# State
_Last updated: 2026-05-10 2333_

## Current focus

`racing-time-trials` branch implemented. Current focus is playtesting the racing cleanup/bug-kill pass in browser and on a physical controller.

## What's working

- Branch `racing-time-trials` exists and builds cleanly with `npm run build`.
- GitHub Pages workflow now targets pushes to `racing-time-trials` instead of `main`.
- Three starter courses exist: Claim Shakedown, Dead Iron Sweep, and Black Core Run.
- Each course applies deterministic asteroid generation from a course seed and asteroid tuning overrides.
- Checkpoint gates are Rapier sensor colliders with holographic ring visuals; gates validate in strict order.
- Ship collision filtering includes checkpoint sensors, so gate pass-throughs can register.
- Race state covers select, countdown, racing, finished, and invalid/death states.
- Personal bests, recent runs, splits, and ghosts persist under `localStorage["slingshot.racing.save.v1"]`.
- If `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are configured, the game fetches and submits shared course bests/ghosts through Supabase.
- Start screen now presents courses plus a fixed-height top-10 leaderboard, with no local/Supabase setup language, medal targets, split chips, ghost-target block, or command footer.
- The leaderboard top run is treated as the public ghost source when Supabase rows are available; the UI does not label ghosts or times as local.
- Pilot name remains an editable input and finished runs submit with that name.
- Race start has a large 3-2-1-GO overlay.
- Debug/info panels start hidden. `P` still toggles tuning; `O` toggles the HUD/control panels.
- Gamepad mapping now uses either bumper for boost. Right-stick X always yaws; D-pad remains the lateral/vertical strafe control.
- Start screen includes a compact standard-gamepad controller map under the course list.
- RT and LT are full forward/reverse thrust; lateral/vertical strafe is 75% of forward thrust; boost multiplies every thrust axis.
- Ship visuals now include maneuver plumes for pitch, yaw, and roll.
- Checkpoint colors now use green for the required gate, amber for upcoming gates, and faint neutral for passed gates; the off-screen edge glow matches the required-gate green.
- Denser dead-iron asteroids are darker/metallic with stronger red-orange fissures/rings.
- Gravity rumble and hull creak are silenced when leaving active racing, wrecking, resetting, or finishing.
- The trajectory ribbon now visually starts ahead of the ship nose instead of directly at the center of mass.
- Ghosts replay as translucent hologram ships using fixed-interval transform samples.
- HUD/status shows race time, current gate, best time, split delta, energy, hull, and state when panels are toggled on.
- Minimap shows next checkpoint, finish, and ghost marker.
- The base/station is no longer spawned in the racing entrypoint.
- Mining, combat, cargo economy, hangar, and upgrades remain in the repo but are inactive in `src/main.ts` for this branch.

## In progress

Racing cleanup bug-kill pass is implemented and build-clean. Local dev server is running at `http://127.0.0.1:5173/` for playtest.

## Known issues

- Build chunk > 500 kB warning remains (Three + Rapier WASM). Defer.
- Favicon 404 remains cosmetic.
- Supabase remote read is verified from `.env.local`; if another machine sees no entries, check that it has the same env vars and that Vite was restarted after editing `.env.local`.
- Existing mining/combat/hangar systems are not removed, only inactive in `src/main.ts` for this branch.

## Next actions
1. Playtest start screen sizing and controller-help readability across all courses.
2. Playtest LB/RB boost and D-pad strafing on a physical controller.
3. Finish a course in browser to verify Supabase standings refresh and that the top leaderboard run becomes the ghost.
4. Playtest gate colors, dead-iron asteroid readability, countdown, and audio cutoff after wreck/reset/finish.

## Active plan
docs/plans/2026-05-10 2251 Plan - Racing cleanup bug kill.md

## Recent logs
- docs/log/2026-05-10 2333 Gamepad help and bumper boost.md - reverted RB strafe mode, mapped both bumpers to boost, added start-screen controller help, and build-checked
- docs/log/2026-05-10 2258 Racing cleanup bug kill.md - simplified public racing UI, remapped controls, updated gates/asteroids/audio/countdown/thrust visuals, and build-checked
- docs/log/2026-05-10 2150 Racing cleanup.md - removed station spawn, confined boost plumes to rear engines, changed gate guidance to blue opacity steps, and build-checked
- docs/log/2026-05-10 2138 Bumper strafe and yaw invert.md - inverted right-stick yaw, remapped LB/RB to lateral strafe, updated controls text, and build-checked
- docs/log/2026-05-10 2133 Racing start screen UI.md - redesigned the racing start/course select screen and verified with Playwright screenshots plus build
- docs/log/2026-05-10 2132 Ring tracker.md - added blue active gates, green following gates, and an off-screen edge glow tracker for the next checkpoint
- docs/log/2026-05-10 2131 Deploy racing branch.md - switched GitHub Pages workflow from `main` to `racing-time-trials`
- docs/log/2026-05-10 2124 Right stick controls.md - mapped right stick to yaw and vertical strafe, updated controls text, and build-checked
- docs/log/2026-05-10 1850 Multiplayer leaderboard.md - added pilot-name UI, shared standings, Supabase status, and verified remote read
- docs/log/2026-05-10 1755 Racing time trials.md - implemented racing branch with deterministic courses, checkpoint gates, local bests, and ghosts
- docs/log/2026-05-10 0057 Rest of game.md - comprehensive plan + session 2 polish (asteroid fix, enemy tuning, lock-on, skybox, camera toggle)
