# State
_Last updated: 2026-05-10_

## Current focus

Comprehensive "rest of game" pass implemented. Game now closes the full loop: launch → mine → fight scavengers → return → hangar (build/upgrade) → relaunch. Persistence, ship visual resolver (kit→glb→primitive), kit-built hangar UI with live preview, light combat (enemies + curving projectiles), cargo-mass coupling, field zoning, audio expansion, run stats. Build clean.

## What's working

- Vite + strict TS, Three.js, Rapier compat, fixed timestep at 1/120s. `tsc --noEmit` + `vite build` clean.
- Run loop:
  - Asteroids: spherical-shell distribution (uniform by volume), 900 rocks from 520 m to 8200 m. Size-by-radius bias (`SIZE_INNER_MAX: 0.32`) keeps giants in deep field only. Mineral glints. Slingshots intact.
  - Death threshold + graze damping unchanged. Cargo scatters on death into pickup chunks.
  - Mining by proximity. Cargo cap base 2000 kg, raised by parts.
  - Energy as shaping constraint, reserve-crawl below 5%. Energy pickups seeded.
  - Boost = 2.5× forward thrust at 4× drain.
  - Procedural base at origin with 80 m sensor trigger. Deposit + energy refill + run readback toast.
- Ship visual pipeline (`src/render/shipVisual/`): kit assembler, GLTF loader (cached), mount-point resolver, primitive fallback. Resolver returns the same `BuiltShip` shape regardless of source. `Ship.setVisual(...)` swaps without touching the physics body.
- Persistence: `localStorage["slingshot.save.v1"]` holds bank, owned parts, current manifest, and run stats. Versioned. Drops on schema bump.
- Upgrade system = kit parts. Each `BuiltinPartDef` carries a `PartStatDelta`; `computeModsFromParts` turns the manifest into a `ShipMods` overlay (thrust mult, agility mult, cargo cap +, energy max +, hull HP, weapon stats, mining bonus). No separate UPGRADE_DEFS list.
- Hangar: docks at base, `Tab` (keyboard) / `Y` (gamepad) toggles. DOM overlay with two-mode gamepad nav (rows ↔ options), live 3D preview canvas, stats projection, bank/cost summary. Apply commits the manifest, re-resolves the visual, and saves.
- Light combat: `WeaponSystem` with curving Rapier projectiles (720 m/s light cutter, 480 m/s heavy slug). Player fires from `weapon-l`/`weapon-r` mounts. `EnemyManager` runs up to 32 (tunable) patrol ships with patrol → engage → flee state machine; highly visible (emissive cockpit, additive halo, point light); ghost through asteroids; scatter ore + bank reward on death; lazy-fill keeps count at target.
- Lock-on targeting: R3 acquires nearest enemy in 35° forward cone (1800 m max). `ReticleHUD` shows red lockBox at enemy screen position + gold lead circle at quadratic intercept point.
- First-person / third-person camera: `Back`/`b8` cycles. Reticle visible only in first-person.
- Cargo-mass coupling: thrust/agility scale down with cargo fraction; subsonic pod hum rises with cargo via WebAudio synth.
- Skybox feels infinite: dome + starfield Group copies `camera.position` each frame; parallax never reveals boundary.
- Field zones: open / mid / deep based on distance from base. HUD shows current zone; toasts on first transition.
- Expanded audio: rumble + creak (samples) plus synthesized SFX (laser, hit, destroy, pickup chime, deposit ka-chunk) and persistent cargo pod hum.
- HUD: hull bar (red below 30%), cargo bar, bank, energy bar with reserve flash, zone label, run readback on dock, hangar hint when docked.
- Tuning panel: existing knobs preserved + new sections for Weapons / Combat, Zones, cargo penalties, cargo hum, SFX volumes. Enemy count tunable via `ENEMY_TUNING.COUNT`.
- README at repo root with controls, loop description, and "how to add a ship part" notes.

## Known issues

- Build chunk > 500 kB warning (Three + Rapier WASM). Defer.
- Favicon 404 (cosmetic).
- Cargo chunks can spawn inside an asteroid sphere on glancing high-speed deaths. Mitigated, not eliminated.
- AI-generated GLBs in `public/ships/` are not wired in. Pipeline supports them but Blender cleanup is deferred.
- `In progress` is empty; the Phase 2 in-progress marker has been retired.

## Next actions

Plan from `docs/plans/2026-05-10 0057 Plan - Rest of game.md` is implemented end-to-end. Remaining backlog (defer-ables, not blockers):
1. Live-test full loop in browser; rebalance part costs + enemy difficulty after feel pass.
2. Wire AI GLBs once cleaned up in Blender (manifest path + mount empties).
3. Damage-state ship visuals at low HP.
4. Code-split the bundle (dynamic-import Rapier WASM) to silence the 500 kB warning.

## Active plan

docs/plans/2026-05-10 0057 Plan - Rest of game.md

## Recent logs
- docs/log/2026-05-10 0057 Rest of game.md - comprehensive plan + session 2 polish (asteroid fix, enemy tuning, lock-on, skybox, camera toggle)
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
