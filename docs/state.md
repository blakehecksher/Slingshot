# State
_Last updated: 2026-05-10 2150_

## Current focus

`racing-time-trials` branch implemented. Current focus is deploying this racing branch through GitHub Pages while leaving `main` as a separate development branch, plus playtesting checkpoint guidance readability.

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
- Course select includes an editable pilot name, Supabase connection/error status, per-course global standings, and the current ghost target.
- Course select has a cleaner racing-game start screen layout with a focused course list, leaderboard panel, ghost target, medal times, and stable footer actions.
- `.env.local` Supabase URL/key were verified with a read-only REST request: HTTP 200, existing `claim-shakedown` row returned.
- Ghosts replay as translucent hologram ships using fixed-interval transform samples.
- HUD/status now shows race time, current gate, best time, split delta, energy, hull, speed, pull, clearance, and restart/course hints.
- Minimap shows next checkpoint, finish, and ghost marker.
- The base/station is no longer spawned in the racing entrypoint.
- Boost visuals are confined to rear engine plumes; default weapon parts no longer add nose plumes to the main thruster set.
- Checkpoint rings use a blue opacity ladder: active is nearly full blue, the next gate is half blue, later gates are dim blue, and passed gates remain red/orange.
- A soft blue edge glow appears when the required next checkpoint is outside the camera view, biased toward the screen edge closest to the target direction.
- Gamepad can drive the course screen: D-pad selects, A starts, Start restarts.
- Gamepad flight controls now use left stick for pitch/roll, right stick for corrected yaw plus vertical strafe, LB/RB for lateral strafe, triggers for forward/reverse, and D-pad strafe remains available.
- Tuning panel starts hidden and remains available with `P`.
- Chase camera is ship-relative again and preserves ship roll/pitch instead of using world-up `lookAt`.
- Mining, combat, cargo economy, hangar, and upgrades remain in the repo but are inactive in the racing branch entrypoint.

## In progress

Pages deployment branch is configured for `racing-time-trials`. After the branch is pushed, verify the GitHub Actions Pages run completes and publishes the racing build.

Right-stick controls and checkpoint guidance UI are implemented and build-clean. Needs hands-on playtest to confirm the corrected yaw direction, bumper strafe feel, vertical strafe feel, and edge-glow readability at racing speed.

Start screen visual pass is implemented, build-clean, and Playwright-checked at desktop and mobile widths. Needs hands-on keyboard/gamepad menu pass.

Racing cleanup pass is implemented and build-clean. Needs hands-on playtest to confirm the removed station, rear-only boost plumes, and checkpoint opacity ladder read clearly in motion.

## Known issues

- Build chunk > 500 kB warning remains (Three + Rapier WASM). Defer.
- Favicon 404 remains cosmetic.
- Supabase remote read is verified from `.env.local`; if another machine sees no entries, check that it has the same env vars and that Vite was restarted after editing `.env.local`.
- Existing mining/combat/hangar systems are not removed, only inactive in `src/main.ts` for this branch.

## Next actions
1. Verify the GitHub Actions Pages run completes for `racing-time-trials`.
2. Playtest the redesigned start screen with keyboard and gamepad course selection.
3. Playtest corrected right-stick yaw, right-stick vertical strafe, and LB/RB lateral strafe on a physical controller.
4. Playtest checkpoint ring opacity and edge glow in cockpit and chase cameras; tune if guidance is too subtle or too loud.
5. Run the dev server and finish a course to verify Supabase insert, standings refresh, and ghost replay in-browser.
6. Play all three courses end-to-end and tune gate placement / medal times from real runs.

## Active plan
none

## Recent logs
- docs/log/2026-05-10 2150 Racing cleanup.md - removed station spawn, confined boost plumes to rear engines, changed gate guidance to blue opacity steps, and build-checked
- docs/log/2026-05-10 2138 Bumper strafe and yaw invert.md - inverted right-stick yaw, remapped LB/RB to lateral strafe, updated controls text, and build-checked
- docs/log/2026-05-10 2133 Racing start screen UI.md - redesigned the racing start/course select screen and verified with Playwright screenshots plus build
- docs/log/2026-05-10 2132 Ring tracker.md - added blue active gates, green following gates, and an off-screen edge glow tracker for the next checkpoint
- docs/log/2026-05-10 2131 Deploy racing branch.md - switched GitHub Pages workflow from `main` to `racing-time-trials`
- docs/log/2026-05-10 2124 Right stick controls.md - mapped right stick to yaw and vertical strafe, updated controls text, and build-checked
- docs/log/2026-05-10 1850 Multiplayer leaderboard.md - added pilot-name UI, shared standings, Supabase status, and verified remote read
- docs/log/2026-05-10 1755 Racing time trials.md - implemented racing branch with deterministic courses, checkpoint gates, local bests, and ghosts
- docs/log/2026-05-10 0057 Rest of game.md - comprehensive plan + session 2 polish (asteroid fix, enemy tuning, lock-on, skybox, camera toggle)
- docs/log/2026-05-09 2136 Browser thrust and creak pass.md - verified boost plumes with Playwright, anchored plume geometry, gated creak by pull, and mapped gamepad X to ship cycling
