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
