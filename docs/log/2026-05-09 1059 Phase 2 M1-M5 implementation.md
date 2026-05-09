# 2026-05-09 1059 — Phase 2 M1-M5 implementation

## What was done

Implemented all of Phase 2 M1–M5 in a single autonomous pass while user was stepped away. M6 art pass (ship redesign) was folded into M1 since it had to ship with the new collider work anyway. M6 tuning + verdict still pending — that's the user's feel-test.

**New files:**
- `src/game/collision.ts` — interaction-group bitfield (`COL_SHIP`, `COL_ASTEROID`, `COL_PICKUP`, `COL_BASE`) + `ContactRegistry` mapping collider handles to typed payloads
- `src/game/lifecycle.ts` — `alive → dying → respawning → invuln → alive` state machine with fade timing + hooks for death/respawn
- `src/game/economy.ts` — proximity mining, cargo cap, bank, scatter math
- `src/game/energy.ts` — energy scalar, thrust drain, reserve crawl gate, pickup add
- `src/game/pickups.ts` — pooled pickup system handling both energy cubes and cargo chunks (sensor colliders, kinematic-position bodies)
- `src/game/base.ts` — procedural base mesh + sensor trigger at world origin

**Modified files:**
- `src/game/asteroids.ts` — each asteroid now has a kinematic-position rigid body + sphere collider (radius). Drift is applied via `setNextKinematicTranslation` each tick. Registered with ContactRegistry.
- `src/game/ship.ts` — ship redesigned (Sparrow palette: cream hull, orange accents, teal canopy, swept wings, twin rear engines). Added named `attachments` Object3Ds (`nose`, `wing-l`, `wing-r`, `engine-l`, `engine-r`, `topspine`, `cargo-bay`). Collision groups now opt in to `COL_ASTEROID|COL_PICKUP|COL_BASE`. New methods: `teleport`, `setFrozen`, `setThrustScale`, `setInvulnerable`.
- `src/main.ts` — wired Economy / Energy / Lifecycle / PickupSystem / Base. Drains `eventQueue.collisionEvents` after each step and dispatches via ContactRegistry. Status bar HUD shows CARGO bar, BANK, ENERGY bar with reserve flash. Toast banner shows pickups / deposits / death events. Fade overlay driven from lifecycle.
- `index.html` — added `#status` (bottom-center HUD), `#toast`, `#fade-overlay` divs and styles.

## What worked

- TS strict + `tsc --noEmit` + `vite build` both pass cleanly.
- ContactRegistry pattern keeps event dispatch in one place — adding pickup types is just a new `ContactKind` variant + a case in the dispatch switch.
- Kinematic-position bodies for asteroids + pickups + base were the right call: gravity stays custom (no Rapier integration), but colliders track movement automatically.
- Ship art pass landed with the attachment-point scaffolding the plan wanted, so Phase 3 upgrades can mount nose/wing/engine bits without rewriting the ship.
- Lifecycle state machine is small and reads straight through — fade overlay alpha is driven by `lifecycle.fadeAlpha` which encodes the current state.

## What didn't and why

- **Sound is still rumble-only.** Vision doc calls sound "load-bearing" but it's deferred to a polish phase.
- **No verdict.** I implemented but didn't fly. M6's whole job is the human pass.
- **Cargo chunks may spawn inside asteroids on death.** Mitigated by pushing scatter offsets backward along the death-velocity vector + 26m cubic random spread, so chunks tend to land in the open. Not perfect — a glancing high-speed kill might still leave a chunk inside the rock. Acceptable Phase 2 behavior.
- **Trajectory ribbon during dying state collapses to a point** (frozen ship has zero velocity). Cosmetic only. Acceptable.

## Decisions made

- **Death threshold = 14 m/s.** Below that, contact dampens velocity (×0.55) instead of dying. Tunable; first guess. Phase 1 cruise speeds were 50–150 m/s, so any collision at flight speed still kills.
- **1.2s post-respawn invuln** with COL_ASTEROID removed from ship's filter so player can't get pinned in a respawn-into-rock loop.
- **Spawn offset +180 z forward of base** so player doesn't trigger an immediate "deposit 0 kg" event on launch and so the base reads as something to fly back to.
- **22 energy pickups** seeded across the asteroid field bounds at startup. Random placement; some may sit inside asteroids — accepted as a Phase 2 cost.
- **Ship art included with M1**, not held for M6 — having the new collider + new ship together avoided two separate art passes.

## Decisions made (in decisions.md)

(not appended yet — none of these are large-enough commitments to log there. M6 verdict will decide if any need promoting.)

## Left unfinished

- **M6 verdict feel-test.** User needs to play the build with controller (or keyboard), validate the loop is fun, and write `docs/log/<timestamp> Phase 2 feel-test.md` with the honest verdict.
- **Loop economy tuning.** Numbers in `ECONOMY_TUNING`, `ENERGY_TUNING`, `LIFECYCLE_TUNING`, `PICKUP_TUNING`, `BASE_TUNING` are first guesses. Whole-system tuning needs hands on the ship.
- **Phase 1 ship-feel tweaks** still deferred to in-context polish.

## state.md updated: yes
