status: complete

# Plan — Phase 2: The Run Loop
_Created: 2026-05-09 1047_

## Context

Phase 1 shipped (M0–M6 in `docs/plans/2026-05-08 2251 Plan - Phase 1 Gravity.md`). Flying a Newtonian gravity field feels good. User verdict on Phase 1: "liking this game and where it's headed." Remaining ship-feel and gravity tweaks are small constants — easier to tune in context with more game on screen, not in isolation.

Vision loop (`docs/spec/gravity-game-vision.md`): launch → navigate → **mine → survive → return** → upgrade → go further. Phase 1 covered *navigate*. Phase 2 closes the smallest possible end-to-end loop: stakes (collisions + death), goal (mining + cargo), constraint (energy), and resolution (return to base + deposit). Without these, the field has no purpose. With them, the question becomes *is the loop fun?* — the next signal worth spending dev time on.

Concept art in `docs/concept-images/` informs the ship art direction (Sparrow LS-17a: cream/orange/teal interceptor, deliberate silhouette) but full art pipeline is deferred. HUD stays minimal per vision; cockpit-HUD aesthetic is deferred to a later polish phase.

## Out of scope

- Combat / enemies / projectiles (Phase 4)
- Persistent upgrade system + base hangar UI (Phase 3)
- Authored 3D ship/base models (later)
- Authored sound + music (later polish phase)
- Multiplayer (architectural layer; much later)
- Asteroid resource depletion / regeneration (Phase 2 treats mining as stateless proximity)
- Save/load (no persistence yet — refresh resets)

## Stack additions

No new deps. Continue Three.js + Rapier + TS + Vite. Reuse existing fixed-timestep loop in `src/main.ts`.

## Milestones

### M1 — Collisions + death + respawn

1. Replace asteroid sensor/phase-through with solid Rapier colliders (`ColliderDesc.ball(radius)` keyed to each asteroid; kinematic-position rigid body since they drift).
2. Add `lifecycle.ts` state machine: `ALIVE → DYING → RESPAWNING → ALIVE`.
3. Detect ship death via Rapier contact event on any asteroid contact. Threshold: any contact above ~3 m/s relative speed = death. Below = soft graze (clamp velocity, no death).
4. Death: 600 ms fade-to-black, simple particle puff at death pos, then teleport to base position with zeroed velocity.
5. **Gate:** Slamming a rock kills you. Brushing one at low speed survives. Respawn is instant enough not to be punishing.

### M2 — Mining by proximity + cargo

1. New `src/game/economy.ts`. Per fixed step, sum mining rate from each asteroid: `rate = MINE_COEF × asteroidMass / (clearance² + ε²)`, capped per-asteroid + total.
2. Cargo accumulates in `kg`. HUD adds one line: `CARGO: 1248 kg / 5000 kg`.
3. **Gate:** Orbiting a big rock fills cargo. Slingshotting still mines but less per pass. Empty space mines nothing.

### M3 — Energy + reserve crawl

1. New `src/game/energy.ts`. Energy scalar [0, ENERGY_MAX]. Thrust drain: `drain = THRUST_COST × |thrustVector| × dt`. No passive regen.
2. Above reserve threshold: full thrust. At/below: thrust scaled to ~25%.
3. HUD energy bar (DOM element).
4. Floating energy pickups scattered through field (~15–25), sensor collider, on intersect → +ENERGY_PICKUP_AMOUNT.
5. **Gate:** Aggressive flying empties tank. Slingshot pass barely costs energy. Reserve crawl is recognizable.

### M4 — Base + return + deposit

1. New `src/game/base.ts`. Base mesh: procedural blocky station at origin, ~30 m diameter, cream/orange palette.
2. Trigger sensor (~50 m) around base. On player intersection: deposit cargo into `bank`, refill energy, brief HUD pulse.
3. HUD adds `BANK` line.
4. Base position is the respawn point.
5. **Gate:** Full loop playable: launch → mine → return → deposit → repeat.

### M5 — Death scatter + recovery missions

1. On death, spawn N pickups at death pos from cargo. Each = `cargoChunk` value, sensor collider, slow drift inheriting ship velocity.
2. Pickups persist for session.
3. Player respawns with zero cargo. Returning to scatter zone restores by proximity.
4. **Gate:** Dying with full cargo creates real "go get it back" mission.

### M6 — Ship art pass + loop tuning + verdict

1. Modest procedural ship redesign per Sparrow concept: cream hull, orange accents, teal cockpit, swept wings, twin rear engines. Add named **attachment points** (`Object3D` children: `nose`, `wing-l`, `wing-r`, `engine-l`, `engine-r`, `topspine`, `cargo-bay`).
2. Tune loop economy: cargo cap, mine rate, energy max, thrust cost, pickup amount, base refill, scatter chunks. Goal: good run ~3–6 min, mines ~half cap, returns comfortable. Greedy run risks running out.
3. Phase 2 verdict logged to `docs/log/<timestamp> Phase 2 feel-test.md`.
4. **Gate:** Loop is fun on own merits. Phase 3 (upgrades + persistence) earns right to exist.

## Files

**New:**
- `src/game/economy.ts` — mining accumulation, cargo, deposit, scatter
- `src/game/energy.ts` — energy state, drain, reserve gate
- `src/game/lifecycle.ts` — alive/dying/respawning state machine
- `src/game/base.ts` — base mesh + trigger sensor + deposit logic
- `src/game/pickups.ts` — generic pickup system (energy + cargo chunks)

**Modified:**
- `src/game/asteroids.ts` — solid sphere colliders (kinematic-position bodies)
- `src/game/ship.ts` — energy gate on thrust; collider opt-in to collisions; ship art redesign + attachment points
- `src/main.ts` — wire new systems into fixed-step loop, HUD updates
- `src/render/scene.ts` — base mesh + pickup meshes
- `src/physics/world.ts` — expose contact event accessor
- `index.html` — HUD lines: CARGO, BANK, ENERGY

## Critical implementation notes

- **Contact detection**: Rapier `eventQueue.drainCollisionEvents` after step. Compare relative velocity at contact for death threshold.
- **Sensor vs solid colliders**: Asteroids = solid (kinematic-position). Pickups + base trigger = sensor. Distinct collision groups so contact handler doesn't mistake a pickup for a death.
- **Drifting asteroids + colliders**: Need kinematic-position-based bodies so colliders track movement.
- **Tunables centralized**: Each new module exports a `TUNING` const at top.
- **No persistence**: Bank, cargo, energy reset on refresh.
- **Ship art**: Stay procedural. No glTF loader. `MeshStandardMaterial` with palette consts.

## Verification

Run `npm run dev`, plug Xbox controller (or keyboard). Walk through:

1. Launch → fly forward → orbit small asteroid → confirm `CARGO` ticks up
2. Burn thrust hard → confirm `ENERGY` drains, clamps to reserve crawl
3. Pick up energy cube → confirm `ENERGY` jumps + cube vanishes
4. Slam big rock at speed → confirm fade + respawn at base
5. Mine with cargo, ram a rock → confirm scatter pickups appear
6. Respawn, fly back to scatter → confirm cargo restored on proximity
7. Return to base full-cargo → confirm `BANK` increments, energy refills, cargo resets
8. Repeat full loop 3–5 times → write verdict log

Sustained 60fps with ~100 asteroid colliders + ~25 pickups. No NaN/inf in console.

## Notes

- M6 is tuning + verdict checkpoint, not features.
- If M2 mining feels boring, structural signal — pause + rethink before M3.
- If M1 collisions feel unfair, tune speed threshold + add brief invuln post-respawn.
- Authoritative working copy mirror: `C:\Users\blake\.claude\plans\okay-uh-phase-one-quiet-deer.md`.
