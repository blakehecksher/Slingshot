# Decisions

Append-only. One entry per decision. Before adding, scan for conflicts with existing entries.

---

<!-- entries go below this line -->

## 2026-05-08 2251 — Language: TypeScript

Decision: Use TypeScript (strict mode) for all game code.
Reason: Physics, vector math, and gameplay tuning are math-heavy. Type safety catches dimensional and shape errors early. Three.js and Rapier both ship strong types.

## 2026-05-08 2251 — Renderer: Three.js

Decision: Three.js (latest, ESM) as renderer.
Reason: Most well-trodden path for browser 3D. Abundant references when stuck. No need for the engine-y abstractions of Babylon for this game.

## 2026-05-08 2251 — Physics: @dimforge/rapier3d-compat

Decision: Use `@dimforge/rapier3d-compat` over raw `@dimforge/rapier3d`.
Reason: WASM auto-init avoids async bootstrap plumbing. Perf cost is negligible at Phase 1 body counts. Switch to raw `rapier3d` if/when profiling shows the integrator is the bottleneck.

## 2026-05-08 2251 — Bundler: Vite

Decision: Vite as the build tool.
Reason: Fast HMR, native ESM, zero-config TypeScript, smallest config surface for a single-page WebGL app.

## 2026-05-08 2251 — Hosting: GitHub Pages via official Actions

Decision: Deploy via `actions/upload-pages-artifact` + `actions/deploy-pages` on push to `main`. Wire in M0.
Reason: Static-only hosting is sufficient (single-player, no backend). Official Pages actions keep the deploy native to the product and avoid `gh-pages` branch pollution. Wiring early catches asset path and Rapier WASM issues before gameplay code complicates debugging.

## 2026-05-08 2251 — Custom gravity, Rapier integrator

Decision: Set Rapier `world.gravity = (0,0,0)` and apply per-body gravitational force ourselves each tick using `F = G * m1 * m2 / (r^2 + ε^2)`. No N-body — only asteroid → ship.
Reason: Slingshot feel requires control over the gravity model (G, masses, softening) decoupled from any default planetary-gravity assumptions. Using Rapier's rigid bodies means Phase 2 (collisions, projectiles) inherits the integrator without rewrite.

## 2026-05-08 2251 — Fixed-timestep physics

Decision: Physics steps at fixed dt (1/120s). Renderer interpolates between physics states.
Reason: Variable-timestep gravity sims are unstable and produce framerate-dependent feel — unacceptable for a game whose entire point is the precise feel of a slingshot.

## 2026-05-08 2251 — Camera shake on camera node only

Decision: All shake/rumble noise is applied to the camera node, never to the ship rigid body.
Reason: Players need to trust the trajectory minimap and predicted path line. Shaking the body would corrupt the actual sim and the prediction. Shake is feedback, not physics.

## 2026-05-08 2251 — No tests in Phase 1

Decision: No automated tests for Phase 1. Game-feel is the test.
Reason: The questions Phase 1 answers ("does this feel good?") cannot be tested in code. Adding test infrastructure now would be premature and would slow iteration. Add Vitest later when pure-logic modules emerge.

## 2026-05-08 2318 — Apply ship thrust as per-tick impulse

Decision: Ship thrust is applied via `RigidBody.applyImpulse(force × dt)` once per physics tick, not via `addForce`.
Reason: First M1 pass with `addForce` produced quadratic speed growth — the force buffer was effectively not being cleared between steps in this `@dimforge/rapier3d-compat` build (or our call pattern stacked it). Per-tick impulses are explicit one-shots, never accumulate, and reproduce exactly the same physics as a constant force when called each tick. Less footgun surface across future Rapier upgrades.

## 2026-05-08 2318 — Ship has a real collider for mass

Decision: The ship rigid body has a cuboid collider sized to the hull (1.5×0.8×2.5 m) with density tuned so mass = 1 kg. Collision groups are zeroed so it never participates in contacts in Phase 1.
Reason: First M1 pass used `setAdditionalMass(1.0)` with no collider. Without a collider Rapier did not derive a real mass + inertia, and forces produced ~5 million× expected acceleration. A collider gives a proper mass tensor; opting out of collisions via groups is one line and reversible per-collider when M2 lands.

## 2026-05-08 2318 — Rotation: direct angular velocity, not torque

Decision: Ship rotation is set via `setAngvel` from input each tick, with input directly mapping to a target angular velocity in ship-local axes.
Reason: Direct angular velocity gives snappy, predictable controls that match an arcade-flight feel. Torque + integrator-driven rotation tends to feel sluggish and adds a tuning axis we don't need yet. Revisit if M2 (gravity in the picture) reveals that direct-angvel rotation makes slingshot orientation handling feel wrong.

## 2026-05-09 1907 - Ship visual asset fallback order

Decision: Ship visuals should resolve in this order per variant: kit-built manifest, full GLB/GLTF model, procedural primitive fallback.
Reason: Kit-built ships support future ship construction and visible upgrades; full models support AI-generated or commissioned assets; primitive fallbacks keep the game playable while assets are missing or in progress.
Supersedes: none

## 2026-05-10 0057 - Kit parts ARE upgrades (no separate UPGRADE_DEFS)

Decision: Drop the originally-planned separate `UPGRADE_DEFS` system. The kit-built ship parts in `src/render/shipVisual/builtinParts.ts` carry their own `PartStatDelta`. Mounting a part = applying its mods.
Reason: Two parallel catalogs (parts + upgrades) duplicated data and forced reconciliation in the hangar UI. Single source of truth (`computeModsFromParts`) is simpler and matches the long-term ship-builder direction in `docs/spec/ship-asset-pipeline.md`.
Supersedes: plan §2 ("UPGRADE_DEFS") in `docs/plans/2026-05-10 0057 Plan - Rest of game.md`.

## 2026-05-10 0057 - Save format: localStorage v1, drop on version mismatch

Decision: Save data lives at `localStorage["slingshot.save.v1"]`. On version mismatch the old save is dropped silently rather than migrated.
Reason: Pre-release single-player; no users to migrate. Simpler than half-finished migration code that drifts. Bump `SAVE_VERSION` to invalidate.
Supersedes: none

## 2026-05-10 0057 - Combat is gravity-curving projectiles

Decision: Projectiles are full Rapier dynamic bodies that receive gravity acceleration from `sampleGravityAt` each tick.
Reason: Vision §"Enemies": "Combat is a gravity problem. Projectiles curve in gravity wells." Sharing the same gravity sampler the player uses guarantees the visual matches the prediction. Cost is a few dynamic bodies — negligible at expected projectile counts.
Supersedes: none

## 2026-05-10 0057 - Hangar pauses physics; B/Tab opens at base only

Decision: Hangar UI is a DOM overlay. Opening it freezes the player ship and short-circuits `tickPhysics`. Only valid while inside the base trigger sensor.
Reason: A ship-builder mid-flight invites accidental triggers. Coupling it to docking matches the fiction ("dock at base"). DOM overlay avoids spinning a second 3D scene; a small Three.js renderer inside the overlay handles only the live preview.
Supersedes: none

## 2026-05-10 1755 - Racing branch uses standardized ordered circuits

Decision: The `racing-time-trials` branch makes ordered checkpoint circuits the primary mode and keeps mining, combat, hangar upgrades, and cargo economy inactive in the entrypoint.
Reason: Comparable time-trial runs need the same objective order, same ship baseline, and no economy or combat interruptions.
Supersedes: none

## 2026-05-10 1755 - Race leaderboards are local-first

Decision: Store race bests, recent runs, splits, and ghosts in `localStorage["slingshot.racing.save.v1"]`, with a `LeaderboardProvider` interface and Supabase stub for later shared leaderboards.
Reason: Local persistence makes the branch playable immediately without backend setup while preserving a clear remote-adapter boundary.
Supersedes: none

## 2026-05-10 1755 - Ghosts are fixed-interval transform samples

Decision: Record previous-best ghosts as fixed-interval ship transform samples: race time, position, quaternion, speed, and checkpoint index.
Reason: Transform playback is deterministic enough for visual racing, compact enough for localStorage, and does not touch physics or require input re-simulation.
Supersedes: none

## 2026-05-10 2131 - Deploy racing branch to GitHub Pages

Decision: GitHub Pages deploys from pushes to `racing-time-trials` instead of `main`.
Reason: `main` should remain available as its own development branch while the racing time-trials version is the public deployed build.
Supersedes: 2026-05-08 2251 - Hosting: GitHub Pages via official Actions

## 2026-05-14 2347 - Time-trial product outline is current scope

Decision: Use `docs/spec/slingshot-time-trials-product-outline.md` as the current product outline. Focus the game on fast course entry, gravity racing, timers/splits, ghosts, leaderboards, results, HUD readability, settings, and light player identity. Defer ship selection, hangar hub, upgrades, mining, economy, combat, and story progression as active product pillars.
Reason: The strongest near-term game is the replayable gravity time-trial loop. Ship/hangar/economy systems add design weight before the core racing loop is proven and polished.
Supersedes: none

## 2026-05-14 2355 - Lore and aesthetics stay active

Decision: Keep `docs/spec/slingshot-lore-and-visual-direction.md` in the root spec folder as the active lore and aesthetic companion to the time-trial product outline.
Reason: The racing loop should be developed with clear tone, visual language, naming, and Dead Iron fiction in mind, while keeping mining/economy/story systems deferred as gameplay pillars.
Supersedes: none

## 2026-05-17 2127 - Friend Heat mode shape

Decision: Future Friend Heat multiplayer should use invite-code private lobbies, a shared heat timer, and a lobby-best ghost that starts with the first valid completed lobby run and updates only at the start of a player's next attempt. The first version should not show personal-best ghosts or global top-board ghosts inside the heat. Once the heat timer expires, existing attempts may finish and count, but no new attempts can start. Valid Friend Heat completions still submit to personal records and the global leaderboard.
Reason: This preserves the feeling of a private friend race without discouraging players with an outside global top ghost, avoids confusing mid-attempt ghost swaps, and still lets excellent heat runs become public leaderboard records.
Supersedes: none

## 2026-05-18 2124 - No separate race setup or ghost results branch

Decision: Remove the separate race setup screen from the active flow and keep results limited to Retry and Title Board actions. Results should show final time, personal-best time and delta, player leaderboard time and delta, number-one leaderboard time and delta, plus split details.
Reason: The active loop should be fast and visually consistent with the title/course board. Separate ghost/result branches and setup overlays slow the loop and create confusing screens.
Supersedes: none
