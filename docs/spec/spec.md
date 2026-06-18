# Slingshot - Current Game Specification

**Status:** authoritative current product specification  
**Source of truth:** active repo behavior and committed direction as of 2026-06-18  
**One-line concept:** A browser-based 3D asteroid time-trial racer where the player flies a standardized racing ship through ordered gates, using Dead Iron gravity wells for speed while avoiding wrecks.

---

## 0. Concept Ladder

**One sentence:** Fly through asteroid-field checkpoint courses as fast as possible by using gravity wells, boost, and precise 6DOF control.

**Two sentences:** Slingshot is currently a focused single-player time-trial racing game. The player picks a course from a field timing board, launches into a countdown, threads ordered gates and asteroid checkpoints, finishes, compares splits/ghosts/records, and retries.

**Paragraph:** The current build has narrowed around Dead Iron racing. Mining, cargo, economy, hangar, upgrades, weapons, enemies, pickups, Friend Heat, ship building, and active ship selection have been removed from the active path. The playable product is now a fast racing loop with one procedural racing ship, authored asteroid courses, fixed-step physics, readable ordinary/weak/strong asteroid classes, collisions, clean-run crash/restart handling, local records, fixed-sample ghosts, optional Supabase leaderboards, settings, debug/tuning tools, and a Flight Test Lab sandbox.

---

## 1. Experience Walkthrough

### 1.1 Boot / Title

- The app boots into a live field-terminal style start screen over the 3D asteroid scene.
- Branding reads as Slingshot / Dead Iron Racing League.
- The title screen and course board are closely related: both prioritize quick course selection and launch.
- The pilot callsign/name is editable directly on the board.
- The UI shows controller state such as controller standby or linked.
- Primary actions are Start Race and Settings.

### 1.2 Course Board

- The course board is the main menu.
- It shows the active course list, course count, selected course, leaderboard preview, personal best, split graph, and launch controls.
- Course rows show course name, summary, difficulty/biome/gravity signals, and best-time context where available.
- Player can switch courses with controller, keyboard, or pointer interaction.
- All active courses are available immediately; there is no unlock progression in current code.
- The board stores the selected course in `localStorage["slingshot.racing.save.v1"]`.

### 1.3 Launch / Retry

- A fresh launch from the course board regenerates/prepares the selected course, resets the ship, resets energy/hull, clears the recorder, syncs ghosts, and enters a 3 second countdown.
- Ship input is locked while the fresh-entry countdown is active.
- On GO, the ship unfreezes, race time starts, audio plays a start cue, and the HUD/race scene becomes active.
- Retry, manual restart, crash recovery, and out-of-bounds recovery enter a frozen ready state with no countdown.
- In the ready state, the timer and ship start on the first meaningful thrust input.
- Tutorial-style toasts can exist for courses that define tutorial metadata and have no prior record, but the current active course catalog does not define the older onboarding set.

### 1.4 Racing

- The player flies a 6DOF ship through gates in strict order.
- HUD/status feedback includes race time, gate progress, speed, energy, hull, split deltas, ghost status, and state when panels are visible.
- Active gate guidance is in-world through gate visuals, a course guide line, and off-screen green edge glow.
- Personal-best ghost and top-board ghost replay visually when data is available.
- Gravity, audio, haptics, camera shake, dust, and collision feedback communicate danger and speed.
- Restart is available during the race.
- Pause can hold the current race and open settings.

### 1.5 Crash / Restart

- Asteroid contacts above the death-speed threshold destroy the ship.
- Low-speed contacts are treated as grazes and damp velocity rather than instantly killing the run.
- On death, the race is discarded and the ship returns to the course start after the lifecycle fade/respawn sequence.
- Crash recovery enters the no-countdown ready state. The player launches the new attempt with thrust.
- The behavior is not a checkpoint penalty respawn. Slingshot remains a clean-run time trial.

### 1.6 Finish / Results

- Passing the final gate stops the race and freezes the ship.
- The run is completed into a ghost recording, then submitted to the active leaderboard provider.
- Local personal bests, splits, recent runs, and ghosts are updated immediately.
- Supabase submission is attempted only when environment config is present.
- Results show final time, personal best, PB delta, player board time, board delta, #1 board time, #1 delta, and split breakdown.
- Result actions are Retry and Title board.

### 1.7 Settings

- Settings are reachable from title/course board and pause.
- Settings persist to `localStorage["slingshot.uiSettings.v1"]`.
- Current settings include stick sensitivity, turn rate, thrust feel, strafe strength, boost feel, invert pitch, invert yaw, HUD scale, ghost opacity, camera shake, rumble, master/SFX/music volume, reduced motion, color-safe danger, graphics quality, and reset.

### 1.8 Flight Test Lab

- `test.html` and `src/test-main.ts` define a separate Vite entry for a tuning sandbox.
- The lab strips course/menu/results flow and focuses on spawn, fly, crash, and instant respawn.
- It reuses the real ship, asteroid, gravity, tuning, and feedback systems.
- It includes a gamepad quick-tune overlay for feel parameters.

---

## 2. System Spec

### 2.1 Flight Model

- The player controls one standardized procedural racing ship.
- The ship is a Rapier dynamic body with a cuboid hull collider and CCD enabled.
- Rapier world gravity is zero. All gravity is applied by custom game code.
- Physics steps at a fixed 1/120 second timestep.
- Thrust is applied as per-tick impulses.
- Rotation is arcade-direct: input maps to ship-local angular velocity targets, not torque accumulation.
- Linear damping and angular damping are currently zero.
- Reverse thrust also acts as braking through speed damping.
- A speed-assist damping model limits runaway speed outside real wells while suppressing that damping inside strong pulls so slingshots still matter.

### 2.2 Current Controls

Controller mapping:

- Left stick X: roll.
- Left stick Y: pitch.
- Right stick X: yaw/rudder.
- Right stick Y: vertical strafe.
- RT: forward thrust.
- LT: reverse/brake thrust.
- D-pad: lateral/vertical strafe.
- LB/RB: boost.
- Y: toggle chase/cockpit camera.
- A/Start: confirm/start.
- Back/Select: restart current run.
- Start: pause when racing.
- B: back in menus.

Keyboard/mouse fallback:

- W/S: forward/reverse thrust.
- A/D: roll.
- Q/E: yaw.
- Space/Ctrl: vertical thrust.
- Arrow keys: pitch/yaw.
- Shift: boost.
- Mouse while pointer-locked: pitch/yaw.
- C: camera toggle.
- R: restart.
- Enter: confirm/start.
- Escape: back.
- Arrow keys: menu navigation.
- Number keys 1-3: quick course selection for first courses.

### 2.3 Energy And Boost

- Energy starts full and refills on race preparation/respawn.
- Boost only drains energy when boost input is held with thrust demand.
- Energy drain is scaled by boost and thrust demand.
- If energy falls into reserve, ship thrust scales down to limp-home power.
- Boost is a thrust multiplier, not a discrete charge system.

### 2.4 Gravity

- Gravity is sampled from weak and strong Dead Iron asteroids only.
- Every gameplay asteroid has radius, hit radius, gravity class, mass, core density, position, drift velocity, and rotation.
- Ordinary asteroids are collidable field obstacles with zero gravity.
- Weak Dead Iron asteroids have reduced mass and subdued blue-black metallic cues.
- Strong Dead Iron asteroids use full tuned mass, dark metallic bodies, brighter exposed seams, and strong-well screen/audio feedback.
- Authored course gravity anchors are always strong.
- Gravity uses a softened inverse-square pull:
  - pull = `G * asteroid.mass / (distanceSq + softeningSq)`
  - softening is based on asteroid radius and minimum softening.
- Pull is boosted near the surface by a Dead Iron core ramp.
- Only asteroid-to-ship gravity is simulated. Asteroids do not gravitationally affect each other.
- Asteroids are kinematic bodies with small authored/procedural drift.
- Gravity sampling ignores bodies beyond the passive effect distance unless large-body range extends it.

### 2.5 Asteroids And Collision

- Current active asteroids are real gameplay asteroids: visible meshes, Rapier colliders, and collision events.
- Their gravity class determines trajectory influence: ordinary has none, weak has reduced pull, and strong has full pull.
- Procedural asteroids are generated from course seed and course asteroid tuning.
- Authored gravity anchors are added as deliberate course landmarks and checkpoint rocks.
- Procedural real asteroids reject start-clearance and gate-clearance violations.
- Despite older state notes, visual-only instanced asteroids are not present in the currently inspected active `src/game/asteroids.ts`.
- Asteroid collision uses spherical Rapier colliders based on the visible rock's mean vertex radius, slightly biased inward for trust.
- Ship CCD is enabled to reduce high-speed tunneling.

### 2.6 Gates And Course Progression

- A course is an ordered list of gates.
- Gate kinds are `ring` and `asteroid`.
- Ring gates use swept plane-crossing within radius.
- Asteroid gates use swept segment distance against an asteroid-centered checkpoint sphere.
- Gate detection compares the ship's pre-step and post-step positions, so gate passes are robust at high speed.
- Only the next expected gate can be accepted.
- Passing a gate records a split.
- Passing the final gate finishes the race.
- Gate visual states:
  - Active: green, full strength.
  - Next upcoming: brighter amber.
  - Other upcoming: dim amber.
  - Passed: faint neutral.

### 2.7 Courses

Courses are authored in `src/game/racing/courseCatalog.ts`, then built into runtime courses by `courseAuthoring.ts`.

Current active courses:

- Wake Primer: shorter Dead Iron Belt warm-up route, difficulty 2, 5 gates.
- Needle Wake: vertical Dead Iron Belt route, difficulty 3, 6 gates.
- Blackglass Thread: expert Black Core route, difficulty 4, 9 gates.
- Iron Switchback: technical Dead Iron Belt switchback route, difficulty 3, 7 gates.
- Core Spiral: elite Black Core spiral route, difficulty 5, 10 gates.

Each authored course defines:

- id, name, summary, seed, start position.
- Medal times.
- Biome, difficulty, skill focus, rhythm, generation pattern.
- Field recipe: asteroid tuning, gate clearance, route corridor, gravity anchor count, hazard bias, gravity anchors.
- Lore text: field note, launch callout, result note, codex entry.
- Gates, some anchored to gravity-anchor asteroids.

### 2.8 Records, Runs, And Ghosts

- Local racing save key: `localStorage["slingshot.racing.save.v1"]`.
- Player name key: `localStorage["slingshot.racing.playerName"]`.
- UI settings key: `localStorage["slingshot.uiSettings.v1"]`.
- Each completed run records course id, final time, splits, completion timestamp, player name, and source.
- Personal best records include best time, best splits, best ghost, and recent runs.
- Recent runs are capped at 12.
- Ghosts are fixed-interval transform samples at 15 Hz.
- Ghost sample data includes time, position, quaternion, speed, and checkpoint index.
- Ghost sample count is capped at 3600 by downsampling.
- Personal ghost is rendered orange.
- Top-board ghost is rendered blue.
- Ghosts are visual only and never interact with physics.

### 2.9 Leaderboard

- The default provider is local-only.
- Supabase activates only when `VITE_SUPABASE_URL` and a publishable/anon key are configured.
- Remote leaderboard table/view currently expected by code: `race_leaderboard`.
- Remote fetches top 10 entries by course, ordered by time then created date.
- Remote top run can include ghost data and becomes the blue ghost.
- Remote submit inserts course id, player name, time, splits, and full ghost.
- Remote errors do not block local records or results.

### 2.10 Audio, Feedback, And Camera

- Gravity rumble and hull creak loops are loaded from public audio assets.
- Rumble volume follows gravity pull magnitude.
- Creak follows nearby clearance plus pull strength.
- Close-well warning tones can fire when strongest pull and clearance thresholds are met.
- Strong wells tint and tighten the post-processing response as pull rises.
- A successful strong-well pass that produces meaningful speed gain triggers a dedicated whoosh, a short edge pulse, and a `HOT PASS` speed-gain callout.
- Haptics are driven by gravity jerk and thrust opposing gravity, not just raw pull.
- Camera shake is applied to the camera only, preserving simulation trust.
- Camera modes are chase and cockpit.
- Chase camera has look/recenter behavior, speed/FOV feel, and feedback offsets.
- Music states exist for menu, race, results, and silent, with optional loop assets.

### 2.11 Debug And Tuning

- `src/debug/tuningPanel.ts` exposes racing-focused tuning groups.
- `src/debug/tuningStore.ts` captures an in-source baseline, loads saved overrides, and supports saving/resetting tuning.
- Tuning save key: `localStorage["slingshot.tuning.v1"]`.
- Debug visualizations include asteroid hitbox wireframes, sampled gravity-gradient point grid, and whole-scene wireframe.
- Normal game debug panels can expose trajectory ribbon and technical HUD.
- Flight Test Lab includes gamepad quick tuning for selected feel parameters.

---

## 3. State Machine And Edge Cases

### 3.1 Top-Level App Scenes

```text
title -> course -> race -> results
          ^        |       |
          |        v       v
        settings <- pause  title/course board
```

Implementation scene ids:

- `title`
- `course`
- `race`
- `pause`
- `results`
- `settings`

### 3.2 Race States

Implementation race states:

- `select`
- `countdown`
- `ready`
- `racing`
- `finished`
- `invalid`

Current flow:

```text
select -> countdown -> racing -> finished
             retry -> ready -> racing
```

### 3.3 Lifecycle States

Ship lifecycle states:

- `alive`
- `dying`
- `respawning`
- `invuln`

Current crash behavior:

- High-speed asteroid collision triggers `dying`.
- Death freezes the ship and plays feedback.
- Respawn teleports to the course respawn/start position and applies brief invulnerability.
- Main game queues a no-countdown ready state after ship loss.

### 3.4 Edge Cases

| Case | Current behavior |
| --- | --- |
| Gamepad unavailable | Keyboard/mouse fallback remains active. |
| Non-standard HID devices | Standard-mapping gamepads are preferred before falling back to any connected pad. |
| Browser loses focus/visibility | Held keys are cleared to avoid stuck inputs. |
| Controller disconnect mid-race | Automatically pauses with a reconnect/keyboard message. |
| Browser tab becomes hidden | Automatically pauses; held inputs are cleared. |
| Player leaves the course envelope | Shows a return warning and countdown, then resets the run into the ready state. |
| Out-of-order gate pass | Ignored. |
| High-speed gate pass | Swept gate test handles it. |
| High-speed asteroid collision | Ship collider has CCD enabled. |
| Low-speed asteroid touch | Graze dampens velocity. |
| High-speed asteroid touch | Ship destroyed and run restarts. |
| Supabase missing | Local leaderboard provider is used. |
| Supabase error | Local result still saves; UI reports board issue/update failure. |
| Invalid race state | Type exists, but active code path mostly uses crash restart/results rather than a full invalid-run screen. |

---

## 4. Data And Persistence

### 4.1 Local Racing Save

Storage key:

```text
slingshot.racing.save.v1
```

Shape:

- `version`
- `selectedCourseId`
- `records` keyed by course id

Course record:

- `courseId`
- `bestTimeSec`
- `bestSplits`
- `bestGhost`
- `recentRuns`
- optional `playerName`
- optional `source`

### 4.2 Player Identity

Storage key:

```text
slingshot.racing.playerName
```

Behavior:

- If no local or env name exists, generate `Pilot-###`.
- Names are sanitized, trimmed, whitespace-normalized, and capped at 40 characters.
- The course board exposes inline editing.

### 4.3 UI Settings

Storage key:

```text
slingshot.uiSettings.v1
```

Settings persist independently from race records.

### 4.4 Tuning Overrides

Storage key:

```text
slingshot.tuning.v1
```

Saved tuning overrides are developer/tester-facing and load on top of the in-source baseline.

### 4.5 Supabase Boundary

Environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY`
- optional `VITE_SLINGSHOT_PLAYER_NAME`

Expected remote row fields:

- `course_id`
- `player_name`
- `time_sec`
- `splits`
- `ghost`
- `created_at`

The client uses the Supabase REST endpoint directly with the publishable key. No service key belongs in the client.

---

## 5. Feel And Presentation

### 5.1 Core Feel

- The ship should feel like a precise working-field craft, not a luxury racer or fighter.
- The racing line is about commitment, gravity reading, boost timing, and recovery.
- Close passes should feel risky through sound, haptics, camera stress, and speed.
- Successful strong-well slingshots should produce a distinct release response and show the speed gained.
- Failure should be fast and clear.

### 5.2 Visual Direction

- The active aesthetic is a worn Dead Iron racing field: salvage culture, industrial timing boards, patched ships, rugged race hardware, amber/green terminal cues, and dangerous black-core rocks.
- Avoid clean chrome sci-fi, neon cyberpunk, generic space opera, luxury racing, and decorative UI that does not imply function.

### 5.3 Asteroid Readability

- Ordinary, weak, and strong rocks must be distinguishable before the HUD explains them.
- Ordinary rock reads warm, rough, and inert.
- Weak Dead Iron reads cooler, darker, and lightly metallic with restrained seams.
- Strong Dead Iron reads blue-black, highly metallic, and visibly veined.
- Larger and denser strong rocks should read as more important gravity objects.
- Dead Iron-rich asteroids should imply weight and danger before the HUD explains them.
- Current code supports surface shape variation, warm rock material, authored massScale, visualIntensity inputs, and gravity core boost.
- Stronger future visual distinction for Dead Iron seams/cores remains a major art/readability opportunity.

### 5.4 Gates And Guidance

- Gates should read as rugged race equipment with holographic readability.
- Active target must always be unmistakable.
- Upcoming gates should preview route without competing with the active gate.
- Passed gates fade and mostly leave the player's attention.
- The guide line and off-screen edge glow are current primary navigation assists.
- Persistent minimap is not part of current active scope.

### 5.5 Sound

- Sound is part of the racing HUD.
- Rumble and creak communicate pull and closeness.
- Menu sounds use field-terminal UI buffers when available.
- Boost, gate pass, crash, start, finish, and personal-best cues are implemented.

---

## 6. Tech Stack

- Language: TypeScript.
- Build: Vite.
- Renderer: Three.js.
- Physics: `@dimforge/rapier3d-compat`.
- Audio: Web Audio API plus public audio assets.
- Persistence: browser localStorage.
- Optional remote records: Supabase REST.
- Hosting target: static browser build, previously oriented around GitHub Pages.

Important implementation constraints:

- Rapier world gravity remains zero.
- Game physics uses fixed timestep.
- Camera shake is visual only.
- Ship collision filtering targets asteroid and checkpoint categories.
- Active build keeps one standardized racing ship for comparable times.

---

## 7. Current Content Spine

### 7.1 Active Biomes

- Dead Iron Belt: moderate gravity, readable asteroid gates, vertical and lateral route-reading.
- Black Core Field: extreme gravity, long routes, high commitment, deep-field landmark reading.

Open Claim Space remains defined as a biome type but no currently active authored course uses it.

### 7.2 Active Course List

| Course | Biome | Difficulty | Gates | Current role |
| --- | --- | ---: | ---: | --- |
| Wake Primer | Dead Iron Belt | 2 | 5 | Short warm-up for asteroid checkpoint reading. |
| Needle Wake | Dead Iron Belt | 3 | 6 | Vertical wake route with lift/drop transitions. |
| Blackglass Thread | Black Core Field | 4 | 9 | Long expert line through seven strong wells. |
| Iron Switchback | Dead Iron Belt | 3 | 7 | Technical lateral reversals and braking before hooks. |
| Core Spiral | Black Core Field | 5 | 10 | Elite long-route spiral around eight heavy wells. |

### 7.3 Medal Targets

Each course defines gold, silver, and bronze target times. The helper exists in code, and the board CSS includes medal styling, but medals should be verified in the rendered UI before treating them as fully player-facing.

---

## 8. Hard Constraints

- Current game is single-player time trial only.
- The active race has no enemies, combat, pickups, mining, cargo, economy, upgrades, hangar, ship builder, or live multiplayer.
- One standardized ship is active for comparable racing.
- Race progress is ordered gates only.
- Ranked attempts require a clean start-to-finish run; crashes and course loss reset the attempt.
- Local records must work without Supabase.
- Remote failures must not block finish/results.
- Physics must remain fixed-step.
- Camera shake must not affect physics.
- Ghosts must remain non-colliding visual replays.
- No service-role secrets in client code.

---

## 9. Known Gaps / Spec-Relevant Mismatches

- State docs still mention visual-only instanced asteroids, but the active asteroid code contains only gameplay asteroids.
- State docs still mention route-corridor clearance for visual-only rocks; current asteroid generation checks start and gate clearance, not a full route corridor rejection pass.
- The new ordinary/weak/strong distribution and visual language need hands-on tuning across all courses.
- The course-envelope margin and warning duration need controller playtest on the longest routes.
- The `invalid` race state exists but does not appear to have a complete player-facing invalid-run flow.
- `Energy` still has old pickup/base comments, but active pickups/base systems are removed.
- Supabase SQL/docs may still mention removed systems and should be checked before public leaderboard setup.
- Build has historically warned about large chunks due to Three/Rapier WASM.
- Browser/controller playtest is still needed after the cleanup and course changes.

---

## 10. Deferred / Not Current Scope

These are deliberately out of the current active game unless revived by a new decision:

- Mining.
- Cargo.
- Economy.
- Hangar hub.
- Ship upgrades.
- Modular ship builder.
- Ship selection as a performance-affecting loop.
- Weapons.
- Combat.
- Enemies or AI pilots.
- Pickups.
- Friend Heat multiplayer.
- Live networked racing.
- Story/career progression.
- Persistent minimap.
- Deep profile/account system.

---

## 11. Near-Term Product Priorities

1. Playtest the current active courses with controller.
2. Verify crash/restart, results, settings, ghosts, and leaderboard fallback in browser.
3. Tune ordinary/weak/strong class ratios, weak mass scaling, and strong-well readability.
4. Reconcile state references to visual-only asteroid density with the actual active source.
5. Tune asteroid trust: collider size, visual size, route clearance, and gate clearance.
6. Validate retry-ready timing, out-of-bounds recovery, and automatic pause behavior with controller.
7. Trim inactive CSS and stale comments from removed systems.
8. Clean Supabase SQL/docs to match the retained `race_leaderboard` path.
9. Decide whether medal targets should become first-class UI.
10. Preserve the focused racing scope unless a new explicit product decision expands it.
