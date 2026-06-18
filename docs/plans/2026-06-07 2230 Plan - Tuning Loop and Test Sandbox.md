status: active

# Plan - Tuning Loop and Test Sandbox
_Created: 2026-06-07 2230_

## Goal

Make game-feel tuning a tight in-game loop. The developer should be able to adjust
every meaningful parameter live, see its effect immediately (including visual debug
overlays), save tweaks so they become the next-launch defaults, and recover to a
known-good baseline when values drift too far. Plus a dedicated flight sandbox that
strips the course/menu/results flow down to: spawn, fly, crash, instant respawn.

Flight and controller feel are considered good as of this plan. The bottleneck is the
edit-test cycle, not the game design.

## Pain being solved

1. Tuning panel is visual noise — too many already-dialed params with no grouping.
2. No persistence — tweaks die on reload; no way to promote them to defaults.
3. No clear recover-to-baseline when a value gets fiddled too far off.
4. Some params (asteroid count/distribution) can't be adjusted live — they need a regen.
5. No visual representation of what a parameter is doing (hitboxes, gravity field).
6. Can't tune from the controller without dropping it to reach mouse/keyboard.
7. Course restart after a crash runs a full 3-2-1 countdown — too slow for feel testing.

## Approach

### 1. Persistence layer — `src/debug/tuningStore.ts`
- `CODE_BASELINE`: snapshot of all `*_TUNING` objects taken at boot AFTER the in-source
  override block in `main.ts` applies, BEFORE any saved overrides. This is the recovery
  point that "Reset to baseline" returns to.
- `loadSavedTuning()` / `saveTuning(current)` / `clearSavedTuning()` against
  `localStorage["slingshot.tuning.v1"]`.
- Boot order in `main.ts`: source defaults -> in-source override block -> capture
  CODE_BASELINE -> apply saved overrides on top.

### 2. Panel reorg + controls — `src/debug/tuningPanel.ts`
- Group folders by what the developer cares about: **Sling Feel** (gravity G,
  core-boost, speed-assist suppression) open by default; **Asteroids**, **Ship**,
  **Boost/Energy**, **Crash/Respawn**, **Feedback**, **Audio**; **Advanced** closed.
- Per-value reset button always visible (not hover-only), disabled when at baseline.
- Actions: Save as defaults / Reset to baseline (all) / Clear saved / Copy JSON / Regen.
- Asteroid params auto-regen the field on change (debounced) so they read as "live."

### 3. Debug visualization — `src/debug/debugViz.ts`
- Hitbox overlay: wireframe sphere at each asteroid `hitRadius` (the true collider),
  exposing the visual-vs-collider gap.
- Gravity gradient: cheap sampled grid of points/segments near the ship, colored by
  `sampleGravityAt` pull magnitude. Kept lightweight (toggle, sparse grid).
- Wireframe mode: strip materials toward wireframe so the scene reads as its sim.
- Toggles live in the panel and are gamepad-reachable in the sandbox.

### 4. Test sandbox — `test.html` + `src/test-main.ts` + vite multi-entry
- Boots straight into open space: one ship, asteroid field, gravity, no race/menu/HUD-chrome.
- Instant respawn: sandbox sets `LIFECYCLE_TUNING` fade/invuln low; no countdown.
- Tuning panel + debug viz always available. Served at `/Slingshot/test.html` under `npm run dev`.
- Real courses untouched.

### 5. Gamepad quick-tune overlay
- Curated subset of the params that matter for feel, same live `*_TUNING` objects.
- D-pad/stick select row, triggers/bumpers adjust, button to save. So feel can be
  dialed without dropping the controller.

## Sequence (highest leverage first)
1. tuningStore (persistence + baseline)  ← unblocks the whole loop
2. Panel reorg + save/reset/clear + always-visible reset + asteroid auto-regen
3. Debug viz (hitboxes first — attacks asteroid trust directly)
4. Test sandbox + instant respawn
5. Gamepad quick-tune overlay

## Verify
- `npm run build` passes.
- Tweak a value, reload -> persists. Reset to baseline -> known-good. Clear saved -> reload uses baseline.
- Asteroid count change updates the field without a manual regen.
- Hitbox toggle shows collider spheres vs visual rock; wireframe + gravity grid toggle cleanly.
- `/test.html` flies, crashes, respawns near-instantly.
- Quick-tune overlay adjusts feel from the pad and saves.

## Notes
- `Asteroid.hitRadius` is `0.9 × mean vertex radius` — tighter than the visual mesh.
  This gap is the likely root of the "asteroid trust" complaint; the hitbox overlay
  is the tool to confirm and re-tune `ASTEROID_COLLIDER_VISUAL_MULT`.
</content>
</invoke>
