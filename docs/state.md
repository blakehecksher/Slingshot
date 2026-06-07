# State
_Last updated: 2026-06-06 0222_

## Current focus

`racing-time-trials` branch implemented. Current product direction is now focused tightly on fast course racing: get players into courses quickly, make gravity slingshot flight strong, and support the loop with timers, splits, ghosts, leaderboards, results, HUD readability, settings, and light player identity.

The active course direction has been reset away from labs/tutorials and toward claim-field racing. The visible course board now keeps Claim Shakedown, adds three Claim Shakedown-style variants, and includes four large point-to-point traverse-family courses.

The current working product spec is `docs/spec/slingshot-time-trials-product-outline.md`.

The active lore/aesthetic companion is `docs/spec/slingshot-lore-and-visual-direction.md`.

Friend Heat multiplayer first implementation has shipped on this branch (build-clean, untested with multiple live clients). Private invite-code lobbies, shared heat timer, lobby-best ghost on next-attempt, and dual submission to the global leaderboard are all wired against Supabase.

Controller flight feel has been rolled back to the fixed GitHub baseline and builds cleanly. The course/tutorial work, guide line, and other branch features remain in place.

## What's working

- Branch `racing-time-trials` exists and builds cleanly with `npm run build`.
- The app runs through Vite at `http://127.0.0.1:5173/Slingshot/` when `npm run dev -- --host 127.0.0.1 --clearScreen false` is active.
- The active racing entrypoint now has a streamlined scene flow for title/course board, countdown/race HUD, pause, settings, results, and crash auto-restart. The separate pre-race setup screen has been removed.
- Xbox-style controller navigation now has discrete menu events: D-pad/left-stick menu movement, A confirm, B back, and Start pause/resume.
- GitHub Pages workflow now targets pushes to `racing-time-trials` instead of `main`.
- The active course board now shows eight courses: Claim Shakedown, Claim Highline, Claim Crosswind, Claim Iron Hook, Claim Traverse, Far Wake Run, Iron Meridian, and Blackglass Crossing.
- Prior lab, tutorial, Dead Iron Sweep, and Black Core Run definitions are archived in source as `ARCHIVED_RACE_COURSES`; they are not exported through the active `RACE_COURSES` list.
- Each course applies deterministic asteroid generation from a course seed and asteroid tuning overrides.
- Authored gravity-anchor asteroids are supported per course, so tutorial maps can place deterministic Dead Iron wells instead of relying only on procedural field generation.
- Checkpoint gates are Rapier sensor colliders with holographic ring visuals; gates validate in strict order.
- Ship collision filtering includes checkpoint sensors, so gate pass-throughs can register.
- Race state covers select, countdown, racing, finished, and invalid/death states.
- Personal bests, recent runs, splits, and ghosts persist under `localStorage["slingshot.racing.save.v1"]`.
- If `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are configured, the game fetches and submits shared course bests/ghosts through Supabase.
- Supabase standings now fetch lightweight top-10 summary rows separately from the one top-run ghost payload.
- Live Supabase read with the configured publishable key showed multiple visible rows, so the table/RLS are not limited to one record.
- GitHub Pages build now fails loudly if the Supabase URL/key repository variable/secret is missing instead of silently deploying local-only leaderboard mode.
- Start screen now uses the Amber Iron claim-board design from `docs/spec/concept-images/Slingshot - Browser Based Space Racing Game/handoff_title_screen/`, with the provided Slingshot SVG logo, course list, callsign entry, selected-course leaderboard, personal-best bar, direct Start Race action, and footer Settings control.
- The leaderboard top run is treated as the public ghost source when Supabase rows are available; the UI does not label ghosts or times as local.
- Pilot name remains an editable input and finished runs submit with that name.
- Race start has a large 3-2-1-GO overlay.
- Debug/info panels start hidden. `P` still toggles tuning; `O` toggles the HUD/control panels.
- Gamepad flight is back to the shipped baseline mapping: left stick pitch/roll, right stick yaw/up-down, D-pad strafe, RT/LT thrust/reverse, and LB/RB boost.
- Start screen includes a compact standard-gamepad controller map under the course list.
- Ship visuals now include maneuver plumes for pitch, yaw, and roll.
- Checkpoint colors now use green for the required gate, amber for upcoming gates, and faint neutral for passed gates; the off-screen edge glow matches the required-gate green.
- Denser dead-iron asteroids are darker/metallic with stronger red-orange fissures/rings.
- Gravity rumble and hull creak are silenced when leaving active racing, wrecking, resetting, or finishing.
- The trajectory ribbon now visually starts ahead of the ship nose instead of directly at the center of mass.
- Ghosts replay as translucent hologram ships using fixed-interval transform samples.
- Race ghost playback now supports two simultaneous lines: the shared top-board ghost is blue, and the local personal-best ghost is orange.
- Personal-best ghosts remain localStorage-backed; Supabase top-board fetches no longer overwrite the local PB record.
- Ghosts now carry a distance-scaled glow aura so far-away blue/orange ghost positions are easier to track.
- The world-space green trajectory ribbon is hidden during normal play and appears only when debug/info panels are toggled on with `O`/`H`.
- HUD/status shows race time, current gate, best time, split delta, energy, hull, and state when panels are toggled on.
- Title/course board now includes a records comparison panel tied to the personal-best area, with per-gate deltas and a compact line graph for latest run, PB, and leader data when available.
- The in-race minimap has been removed to reduce HUD/render cost; route reading now relies on gates, the world-space course guide, ghosts, feedback, and the optional debug trajectory ribbon.
- Settings now persist under `localStorage["slingshot.uiSettings.v1"]` and include ship-feel, HUD, ghost, feedback, audio controls, and a return-to-defaults row.
- Settings opened from pause freeze the race again and use a compact standalone terminal card with a single scrollable settings column.
- The in-race Start/pause menu no longer includes `Change course`; course changes stay on the title/course board.
- Gamepad Y now toggles cockpit/chase camera, and Back/Select restarts the current run.
- First-pass audio now uses selected CC0 Kenney Interface Sounds samples for UI movement/confirm/back/error where available, with quieter filtered procedural fallback for flight/boost/impact/finish behavior.
- Kenney UI samples live under `public/sounds/ui/` with source and license notes.
- Optional soundtrack files can be dropped into `public/music/menu.mp3`, `public/music/race.mp3`, and `public/music/results.mp3`; missing files are handled silently.
- Missing soundtrack files no longer trigger a procedural low music drone, so there is no constant menu/race hum from the audio fallback.
- Crashing during a race now stays in the race scene, fades to black, and automatically starts a fresh run at the selected course gate instead of showing the invalid/retry/course-board menu.
- Settings focus now scrolls the selected row into view, and the settings list is constrained to its scroll column.
- Held D-pad/stick menu navigation now repeats after a short delay for faster movement through settings and course/menu lists.
- Results now match the title/course-board terminal language more closely, only offer Retry and Title Board, and show final time plus personal-best, player-board, and number-one board comparisons with deltas.
- Tutorial courses display Training labels, tutorial difficulty labels, and short non-pausing in-run tips until the player has a personal best on that course.
- Gamepad flight uses the shipped baseline mapping again: left stick pitch/roll, right stick yaw/up-down, D-pad strafe, RT/LT thrust/reverse, and LB/RB boost.
- Courses now render a faint world-space guide line through the course start and gate centers.
- Title/course board re-renders now scroll the selected course row into view.
- Dense asteroid fields use lower asteroid mesh detail and fewer decorative glints/rings at high procedural counts.
- Gravity sampling ignores very distant passive rocks while preserving nearby rocks and large landmarks, keeping large dense fields practical.
- Asteroid fields now support a visual-only instanced layer via `VISUAL_COUNT`; those rocks render as background density but do not create Rapier colliders and do not affect gravity or trajectory sampling.
- Claim Traverse now uses 900 real procedural asteroids plus 5,600 visual-only instanced asteroids, instead of 5,200 real procedural asteroids.
- Three additional traverse-family courses are implemented and build-checked: Far Wake Run, Iron Meridian, and Blackglass Crossing. They use 860-980 real procedural asteroids plus 5,400-6,400 visual-only instanced asteroids.
- The base/station is no longer spawned in the racing entrypoint.
- Mining, combat, cargo economy, hangar, and upgrades remain in the repo but are inactive in `src/main.ts` for this branch.

## In progress

Course catalog reset is implemented and build-checked. Claim Shakedown remains unchanged, Claim Highline/Crosswind/Iron Hook add near-Shakedown variations, and the traverse-family set now includes Claim Traverse, Far Wake Run, Iron Meridian, and Blackglass Crossing. These long maps use visual-only instanced asteroid density with 860-980 real procedural asteroids each. They still need browser/controller playtest and tuning for route readability, density, medal times, and long-course performance.

Controller flight feel is back on the fixed baseline and build-checked. It still needs physical controller playtest on the active Claim courses to tune the default sensitivity, turn rate, thrust feel, and gates.

Configurable controller map has been removed in favor of the fixed baseline control layout.

Cross-scene UI consistency pass landed. `src/render/theme.ts` now holds the design tokens (colors, typography, spacing, panel effects) as CSS variables, and an overlay at the bottom of `injectRaceStyles()` retunes pause/results/invalid/friend-heat/settings to match the start-screen claim-board look. Records-graph filled-triangle bug, friend-entry horizontal scrollbar, and the no-click heat-duration row are all fixed. Build-checked only - still needs browser/controller playtest.

Course guide line and course-board selected-row scrolling are implemented and build-checked. Vite returned HTTP 200 locally, but browser automation could not attach to `iab`, so both changes still need manual visual/controller verification on the active Claim courses.

UI/settings/audio/records polish has a first implementation and follow-up fixes for harsh sounds, settings layout, pause menu redundancy, gamepad mapping, constant music-drone hum, settings focus scrolling, held D-pad repeat, crash auto-restart, and simplified results/setup scene flow. It builds cleanly and still needs manual browser/audio/controller review.

First pass implementation for the full time-trial scene flow is complete and build-checked. The start screen has been redesigned and build-checked; it still needs manual visual/controller playtesting in browser, especially with a physical Xbox controller.

Dual-ghost implementation is build-checked and ready for browser playtesting against courses with both a Supabase top run and a local PB.

Trajectory ribbon debug gating is build-checked. It still needs quick browser confirmation that `O`/`H` hides/shows the world-space line with the panels.

Repository cleanup pass completed. Generated build/browser artifacts were removed, the Supabase setup SQL moved to `docs/database/`, and `.gitignore` now allows `docs/spec/archive/` to be tracked as historical context.

`AGENTS.md` now tells future sessions to read the active specs named in `state.md`, distinguishes root active specs from archived specs, and warns not to treat `docs/spec/archive/` as current truth unless explicitly asked.

The product outline now includes a `Screen and scene map` section that defines the primary user flow, required screens/states, deferred screens, and scene priorities for the fast time-trial loop.

Low-fidelity main screen wireframes now exist at `docs/wireframes/2026-05-15 0041 Main Screen Wireframes.md`. They cover boot/title, course select/race board, pre-race setup, countdown, race HUD, pause, wreck/invalid, results, records/ghosts, and settings with the current Dead Iron working-field visual direction.

Course definitions now have an authoring scaffold: `src/game/racing/courseAuthoring.ts` defines authored course shapes, `src/game/racing/courseCatalog.ts` holds the three current map definitions with design briefs/field recipes/gate beats, and `src/game/racing/courses.ts` remains the runtime compatibility layer.

Black Core Run has been eased from its first pass: lower asteroid count, lower gravity intensity, smaller radius range, reduced drift, wider gates, closer route positions, and looser medal targets.

Friend Heat multiplayer is now implemented in code. New Supabase tables (`friend_heat_lobbies`, `friend_heat_participants`, `friend_heat_runs`) live in `docs/database/supabase-racing.sql`. The client lives in `src/game/racing/friendHeat.ts`. `src/main.ts` adds `friend-entry`, `friend-lobby`, `friend-results` scenes, a Friend Heat title/course action, heat attempt gating via `canStartAttempt`, dual leaderboard + heat submission, and a lobby-best-only ghost swap during active heats. Plan `docs/plans/2026-05-17 2127 Plan - Friend Heat Multiplayer.md` is marked complete.

## Known issues

- Build chunk > 500 kB warning remains (Three + Rapier WASM). Defer.
- Favicon 404 remains cosmetic.
- Browser automation reported the `iab` browser unavailable during the tutorial onboarding session. The latest tutorial maps and UI/HUD/settings/crash/results-flow changes have not been visually inspected by automation. They were build-checked; manual browser/controller/audio playtest remains needed.
- Browser automation again reported the `iab` browser unavailable during the course guide line session. The guide line and course-list scroll fix have not been visually inspected by automation.
- Browser automation again reported the `iab` browser unavailable during the controller flight overhaul session. The controller overhaul and trajectory guidance changes are build-checked but not visually inspected in browser automation.
- Browser automation reported `iab` unavailable during the 2026-06-06 course catalog reset. A hidden Vite process printed `http://127.0.0.1:5173/Slingshot/`, but exited before an HTTP smoke check could connect.
- Vite reached ready state when started in a hidden background process for the tutorial onboarding session, but the process exited before an HTTP smoke check could connect.
- Vite again reached ready state on `http://127.0.0.1:5174/Slingshot/` from a hidden process during the controller overhaul session, but the later HTTP smoke check could not connect.
- Dual ghost visibility and overlap behavior still needs manual browser inspection, especially when the player's PB is also the top-board run.
- Running `npm.cmd run dev -- --host 127.0.0.1 --clearScreen false` in the foreground reported `http://127.0.0.1:5175/Slingshot/` because 5173/5174 were unavailable, but the tool timeout ended that foreground process. Restart Vite manually if needed.
- Supabase remote read is verified from `.env.local`; deployed GitHub Pages also needs `VITE_SUPABASE_URL` as a repository variable and `VITE_SUPABASE_PUBLISHABLE_KEY` as a repository variable or secret before the workflow can build.
- Existing mining/combat/hangar systems are not removed, only inactive in `src/main.ts` for this branch.
- Archived specs still describe mining/collecting/extraction, ship-building, and broader story context. Treat them as historical/future context, not current scope. Current lore/aesthetic guidance has been distilled into `docs/spec/slingshot-lore-and-visual-direction.md`.
- Course field recipes currently document intended clearance, corridor width, and hazard bias, but the asteroid generator does not yet enforce gate clearances or route corridors.
- The traverse-family maps avoid thousands of real physics/gravity rocks, but their visual-only instanced density has not been live browser performance tested.
- `public/ships/` contains tracked draft ship binaries that are not referenced by the active racing entrypoint. They are candidates for later removal or relocation after explicit asset-retention decision.
- `Blake/config-values/` remains an ignored local tuning scratch folder. `03.json` was already promoted into source defaults; delete or archive the scratch folder after confirming it has no personal value.

## Next actions
1. Browser/controller playtest the active eight-course lineup: Claim Shakedown, Claim Highline, Claim Crosswind, Claim Iron Hook, Claim Traverse, Far Wake Run, Iron Meridian, and Blackglass Crossing.
2. Tune Claim Highline/Crosswind/Iron Hook gate positions, gate radii, asteroid counts, and medal times against Claim Shakedown.
3. Playtest the traverse-family maps specifically for frame rate, asteroid readability, route length, and whether the real/visual asteroid splits feel dense enough without becoming noisy.
4. Tune traverse-family medal times, gate spacing, authored Dead Iron massScale values, and procedural/visual density after hands-on runs.
5. Manually inspect the faint course guide line and trajectory/debug cues in live races; tune opacity/color if they compete with gates, ghosts, or asteroid readability.
6. Manually verify the course board scrolls the selected course row into view with keyboard/controller navigation.
7. Apply the updated `docs/database/supabase-racing.sql` to the live Supabase project so the `friend_heat_*` tables and RLS exist before testing.
8. Two-browser Friend Heat smoke test: create a lobby, share invite code, both pilots mark ready, host starts heat, both submit runs, verify lobby-best ghost appears on the next attempt only, and that finished runs also land on the global leaderboard.
9. Manually inspect and playtest the UI/settings/audio/records/crash-restart/results pass in browser at desktop and mobile widths with controller navigation.
10. Verify records comparison with courses that have local PB and Supabase top-run split data.
11. Add course-generation helpers that enforce gate clearance/corridor rules and support authored gravity-anchor asteroids from the field recipes.
12. Add a course debug/lab view for route lines, gate labels, gate-clearance volumes, and gravity-readability checks.
13. Ensure GitHub config exists for `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and optional `VITE_SLINGSHOT_PLAYER_NAME`.
14. Push `racing-time-trials` and verify the Pages workflow builds/deploys with Supabase enabled.
15. Finish a course in browser to verify Supabase standings refresh and that the top leaderboard run becomes the ghost.
16. Add anti-cheat / authoritative validation for Friend Heat (still deferred; trust-based v1 is shipped).
17. Consider replacing Friend Heat polling with Supabase Realtime channels once Realtime is configured.

## Active plan
No active implementation plan. The course catalog reset was implemented directly from the user's request.

Controller flight feel overhaul plan at `docs/plans/2026-05-22 0018 Plan - Controller Flight Feel Overhaul.md` is complete; future work is hands-on controller tuning and browser/controller verification.

Tutorial onboarding plan at `docs/plans/2026-05-21 2335 Plan - Tutorial Course Onboarding.md` is complete historically, but its courses are currently archived out of the active course board.

Friend Heat plan at `docs/plans/2026-05-17 2127 Plan - Friend Heat Multiplayer.md` is complete; future work is anti-cheat and Realtime polish.

## Recent logs
- docs/log/2026-06-06 0222 Traverse variants.md - added Far Wake Run, Iron Meridian, and Blackglass Crossing as additional large point-to-point maps using the visual/gameplay asteroid split; build-checked
- docs/log/2026-06-06 0204 Traverse visual asteroid split.md - reduced Traverse real asteroids to 900, added visual-only instanced asteroid density, reset visual defaults per course, and build-checked
- docs/log/2026-06-06 0143 Course catalog reset.md - archived prior lab/tutorial/old race courses out of the active board, added three Claim Shakedown variants plus Claim Traverse, added dense-field performance/readability support, and build-checked
- docs/log/2026-05-22 0049 Configurable controller map.md - added Settings rows to remap controller flight axes and fixed default yaw inversion; build-checked, playtest pending
- docs/log/2026-05-22 0043 Trigger roll controller trial.md - revised the trial layout so right stick controls pitch/yaw and LT/RT control roll; build-checked, playtest pending
- docs/log/2026-05-22 0038 Stick throttle controller trial.md - remapped controller flight to left-stick thrust/strafe, right-stick pitch/roll, LT/RT yaw, and LB/RB boost; build-checked, playtest pending
- docs/log/2026-05-22 0018 Controller flight feel overhaul.md - remapped controller flight, added radial input shaping, angular velocity ramping, gravity-aware braking, well-exit assist, commanded/drift trajectory lines, five flight-lab courses, and build-checked; browser/controller playtest remains
- docs/log/2026-05-22 0016 Course guide line.md - added faint world-space course guide lines, fixed selected course row scroll-on-render, build-checked, and HTTP-checked local Vite; browser automation unavailable
- docs/log/2026-05-21 2335 Tutorial course onboarding.md - added five tutorial maps, tutorial metadata/tips, authored gravity anchors, course-board Training labels, and build-checked; browser/controller playtest remains
- docs/log/2026-05-19 1714 UI consistency theme and friend heat polish.md - added src/render/theme.ts CSS-variable design system, applied a consistency overlay so pause/results/invalid/friend-heat/settings adopt the start-screen look, polished start-screen layout, fixed the records graph filling as a triangle, killed the friend-entry horizontal scrollbar, made heat-duration/course rows clickable cycle controls, and surfaced a friendly schema-cache message when Friend Heat tables are missing
- docs/log/2026-05-18 2345 Friend Heat implementation.md - implemented Supabase friend_heat_* tables, FriendHeatClient, lobby/entry/results scenes, heat-attempt gating, lobby-best ghost swap, and dual leaderboard submission; build-checked
- docs/log/2026-05-18 2124 Results and setup scene simplification.md - removed the separate race setup scene and Race Ghosts result branch, simplified result metrics/actions, updated the active spec/decision log, and build-checked
- docs/log/2026-05-18 2112 Crash restart settings scroll audio hum.md - removed procedural music-drone hum, made crashes auto-restart after fade, fixed settings focus scroll, added held menu navigation repeat, and build-checked
- docs/log/2026-05-18 2102 Settings menu fix.md - rebuilt settings as a compact standalone terminal card with one scrollable column and build-checked
- docs/log/2026-05-18 2050 Settings audio controls followup.md - added CC0 Kenney UI samples, softened procedural audio, changed settings to a single paused column with defaults reset, removed pause-menu Change Course, remapped gamepad Y/Select, and build-checked
- docs/log/2026-05-18 1907 UI settings audio records minimap.md - implemented records comparison, holographic minimap, live persisted settings, HUD polish, procedural audio, and optional soundtrack hooks; build-checked
- docs/log/2026-05-18 1901 UI settings audio polish plan.md - converted UI consistency, cockpit HUD, live settings, and audio notes into the active implementation plan
- docs/log/2026-05-17 2304 Start screen followup.md - removed visible Records navigation, moved Settings to the footer controls, enlarged start-screen typography, centered the league label under the logo, and build-checked
- docs/log/2026-05-17 2243 Start screen redesign.md - replaced the start/course board with the Amber Iron claim-board layout, added the Slingshot SVG logo asset, build-checked, and HTTP-checked local serving
- docs/log/2026-05-17 2127 Friend Heat multiplayer plan.md - documented the future invite-code Friend Heat mode, lobby-best ghost rules, final-run timing rule, and deferred implementation plan
- docs/log/2026-05-17 2018 Trajectory ribbon debug toggle.md - hid the world-space trajectory ribbon by default and tied it to the debug/info panel toggle
- docs/log/2026-05-17 2015 Dual ghosts.md - split local PB ghosts from Supabase top-board ghosts, added blue/orange simultaneous replay and distance glow, and build-checked
- docs/log/2026-05-15 0115 Game scenes and controller navigation.md - implemented the product-outline scene flow and Xbox-style controller navigation, build-checked, and started local dev server
- docs/log/2026-05-15 0102 Course authoring scaffold.md - split racing maps into authored course definitions, preserved runtime course exports, and eased Black Core Run
- docs/log/2026-05-15 0041 Main screen wireframes.md - drafted low-fidelity layouts for the main time-trial screens using the active lore/aesthetic direction
- docs/log/2026-05-15 0017 Screen and scene map.md - added required game screens, race states, deferred screens, and scene priorities to the product outline
- docs/log/2026-05-15 0008 Agents spec orientation.md - updated AGENTS.md to reflect active root specs and archive handling
- docs/log/2026-05-15 0004 Repository cleanup.md - removed generated artifacts, moved Supabase SQL under docs/database, refreshed README, and fixed archive tracking
- docs/log/2026-05-14 2347 Product outline cleanup.md - created the focused time-trial product outline and archived superseded spec docs
- docs/log/2026-05-14 2355 Lore and visual direction.md - restored current lore/aesthetic guidance as an active companion spec and distilled visual direction into the product outline
- docs/log/2026-05-14 0048 Time trials design brief.md - documented the holistic time-trial product direction and Claude Design prompt
- docs/log/2026-05-10 2351 Supabase leaderboard repair.md - verified live rows, split standings/ghost Supabase reads, required Pages Supabase env, and build-checked
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
