status: active

# Plan — Phase 1: Gravity Feels Good
_Created: 2026-05-08 2251_

## Goal

Build the smallest possible vertical slice that answers the central question of [docs/spec/gravity-game-vision.md](../spec/gravity-game-vision.md): does flying a ship through a Newtonian-gravity asteroid field feel good? If yes, Phase 2 earns the right to exist. If no, tune or rethink the core before building anything else.

Out of scope for Phase 1: mining, resources, energy, enemies, combat, base, upgrades, hull damage, death/respawn, multiplayer, save/persist. Sound is rumble-only.

## Stack

- TypeScript (strict), Three.js, `@dimforge/rapier3d-compat`, Vite.
- Chrome desktop only. Web Gamepad API for Xbox controller, keyboard fallback.
- ESLint + Prettier (minimal). No tests in Phase 1 — game-feel is the test.
- Hosted on GitHub Pages, auto-deployed from `main` via GitHub Actions.

## Repo layout

```
/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── .github/workflows/deploy.yml
├── src/
│   ├── main.ts
│   ├── game/{world,ship,gravity,input,trajectory,feedback}.ts
│   ├── render/{scene,minimap,debug}.ts
│   └── physics/world.ts
└── docs/
```

Module shape is a starting guess; refactor freely as Phase 1 reveals what wants to live where.

## Steps

### M0 — Bootstrap + Pages deploy
1. `npm create vite@latest` (TS template), add `three`, `@types/three`, `@dimforge/rapier3d-compat`.
2. Render starfield + placeholder ship cube. 60fps in Chrome.
3. Fixed-timestep loop: physics at 1/120s, render interpolates.
4. `vite.config.ts` with `base: '/Slingshot/'`.
5. `.github/workflows/deploy.yml` using `actions/upload-pages-artifact` + `actions/deploy-pages`.
6. Repo Settings → Pages → Source = "GitHub Actions" (manual, one-time).
7. **Gate:** local 60fps, clean console, live Pages URL renders the same scene, Rapier WASM loads (no 404).

### M1 — Free flight, empty space
1. Ship as Rapier rigid body. `world.gravity = {0,0,0}`.
2. First-person camera mounted at cockpit; rolls/pitches/yaws with ship.
3. Gamepad: left stick + triggers → thrust on ship-local axes; right stick → rotation. Try torque vs direct angular velocity.
4. Keyboard fallback: WASD + mouse.
5. **Gate:** flying empty starfield feels like flying. No nausea. Axes feel right.

### M2 — Static asteroids, real gravity
1. Procedural irregular sphere via displaced icosahedron. 3–5 hand-placed asteroids of varying mass.
2. Each tick: sum `F = G * m1 * m2 / (r^2 + ε^2)` from each asteroid to ship, apply as force on ship rigid body.
3. Tune G and masses by feel, not realism.
4. **Gate:** path visibly bends past a big rock. Coming in fast → clean arc out the other side. *Central gate. If this isn't compelling, stop and figure out why.*

### M3 — Trajectory prediction line
1. Each tick, fork ship state, forward-simulate 5–10s with same gravity, no future thrust.
2. Render as `THREE.Line` color-graded green→yellow→red by predicted min-distance to any asteroid.
3. Two views: faint cockpit ribbon + top-right inset minimap (separate camera or render-target).
4. **Gate:** setting up a slingshot is legible. The line teaches the technique.

### M4 — Hull shake & feedback
1. Screen shake intensity = f(total gravitational force on ship), with deadband.
2. Shake on camera node only — ship body trajectory stays pristine.
3. Controller rumble via `vibrationActuator.playEffect`, same intensity signal.
4. **Gate:** brushing past a big rock feels physical. Shake amplifies tension without obscuring control.

### M5 — Real-ish field
1. Procedurally generate ~50–200 asteroids in a bounded volume. Power-law-ish size distribution: many small, few medium, handful of massive.
2. Slow per-asteroid rotation (visual) and linear drift (drift << ship speed).
3. No collisions yet — phase through on contact.
4. **Gate:** flying through populated field and slinging from small wells toward big ones is compelling.

### M6 — Phase 1 feel-test
1. Sit with the build. Tune G, masses, thrust, drag, prediction length.
2. No new features.
3. **Gate:** honest verdict written to `docs/log/`. Phase 2 plan only if verdict is yes.

## Critical implementation notes

- Fixed-timestep physics. Variable dt → unreproducible feel across framerates.
- Gravity softening: `r^2 + ε^2`. Without ε, near-misses explode integration.
- Force order each tick: zero → gravity → thrust → step → read.
- Coordinate scale: 1 unit = 1m, asteroids 10–500m, gameplay 100–10,000m. Stay inside ~100km of origin (float precision).
- Camera shake on camera only, never on ship body.
- Rapier with `gravity = 0`, apply forces via `rigidBody.addForce(...)` (force × dt is correct for impulse semantics).
- No premature Three↔Rapier abstraction layer.

## Pages deployment specifics

- `vite.config.ts` → `base: '/Slingshot/'`. Switch to `'/'` if custom domain later.
- Only relative asset paths in code/HTML.
- Rapier WASM is auto-bundled by Vite via `-compat`'s ESM imports — verify 200 not 404 on first deploy.
- Use official Pages actions (`upload-pages-artifact`, `deploy-pages`), not third-party `gh-pages` branch scripts.
- Static-only — no SSR, no API routes.

## Verification (end of Phase 1)

`npm run dev`, plug in Xbox controller. Fly the field. Confirm sustained 60fps, gamepad responsive, gravity bends path visibly, slingshot arc legible via trajectory line, hull shake near big wells, no NaN/inf in console. Write verdict to `docs/log/<timestamp> Phase 1 feel-test.md`.

## Notes

Authoritative working copy of this plan also lives at `C:\Users\blake\.claude\plans\i-m-starting-a-new-robust-kettle.md` (harness path); this file is the AGENTS.md-tracked copy.

2026-05-09 0054: M2-M5 are implemented in code. M6 remains active because the feel-test gate requires a human pass with the running build, ideally with an Xbox controller.
