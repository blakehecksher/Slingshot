# Plan — Rest of Slingshot (single shippable pass)

_Created: 2026-05-10_
_Scope: single-player only, light combat, primitives + kit-built ships (no AI GLBs yet)._

---

## Context

Phase 1 (gravity feel) and Phase 2 (run loop: mining, energy, base, scatter, boost, audio, tuning) shipped and feel fun. State.md confirms loop is fun, Phase 3 earned. User wants the rest of the game implemented in one comprehensive pass — no more phase-gates. Vision (`docs/spec/gravity-game-vision.md`), story (`docs/spec/slingshot-story-spec.md`), and ship-asset pipeline (`docs/spec/ship-asset-pipeline.md`) define the target. This plan covers everything from current state to a complete shippable single-player game.

User confirmed: single-player only, light combat, kit-built ship-builder is core, AI GLBs deferred until cleaned.

---

## Goal

Complete game with:
1. Persistent bank + upgrade economy
2. Visible upgrade attachments on ship
3. Ship visual resolver (kit → full GLB → primitive fallback)
4. Kit-built ship-builder hangar UI at base
5. Light combat: enemy AI, gravity-curving projectiles, weapons, salvage
6. Cargo-mass effects (vision §6: ship becomes part of gravity problem)
7. Field zoning (open / mid / deep) reflected in spawn density
8. Polish: cargo HUD pulse, base entry sequence, win/loss arc, sound expansion

End state: player launches → mines deep field → fights/dodges enemies → returns to base → buys/builds ship parts → goes deeper. Loop closes.

---

## Architecture decisions

- Keep `Ship` gameplay API stable. Visual swap is a `ShipVisualResolver` injected at construction + cycle. `Ship` exposes `attachments` keyed by `AttachmentName` regardless of visual source.
- Manifest format = JSON in `public/assets/ships/kits/*.ship.json` with `parts[]` referencing `public/assets/ships/kits/parts/...glb`. Schema per `docs/spec/ship-asset-pipeline.md` §"Ship Definition Shape".
- Persistence = `localStorage` key `slingshot.save.v1`. Versioned. Reset on schema bump.
- Combat shares the same `physics.world`; projectiles are dynamic Rapier bodies with kinematic contact filtering and gravity-acceleration applied each tick (curves in wells naturally).
- Upgrades are data-driven (`UPGRADE_DEFS`) and mount via `Ship.attachments[name]`. Each upgrade has a primitive procedural visual until kit parts replace it.
- AI uses simple state machine (idle → mine → flee/engage → return). Same physics integration as player; no aimbots. Vision §"Enemies": "not clever pilots".

---

## Work units

### 1. Persistence (foundation for upgrades)

- **New `src/game/persistence.ts`** — `Save` type with bank, owned upgrades, ship manifest id, run stats. `load()` / `save()` / `reset()` with versioning.
- Wire in `main.ts`: load on boot, save on bank change + upgrade purchase.
- `Economy.bank` becomes the persisted value; rehydrate on boot.

### 2. Upgrade system

- **New `src/game/upgrades.ts`** — `UPGRADE_DEFS` data: thrust tier, hull, cargo cap, energy max, weapon hardpoint slots, mining-rate booster, brake/agility. Each entry: `{ id, name, category, tier, cost, mount?: AttachmentName, build: (host: Object3D) => void }`.
- Apply effects by mutating tuning constants on a per-ship "effective tuning" overlay (don't mutate the global `SHIP_TUNING`/`ECONOMY_TUNING` — wrap in `EffectiveTuning` accessor).
- **`Ship.applyUpgrade(id)`** mounts visual into the named attachment Object3D.
- Visuals: procedural primitives (engine cluster cones, armor plate boxes, antenna cyls). Match palette in `ship.ts`.

### 3. Ship visual resolver (Phase A from pipeline spec)

- **New `src/render/shipVisual/`**:
  - `resolver.ts` — `resolveShipVisual(variantId, manifests, options): Promise<BuiltShip>`. Tries kit → full-model → primitive. Returns same `BuiltShip` interface from `ship.ts`.
  - `manifestLoader.ts` — fetch + validate `*.ship.json`, returns typed `ShipManifest`.
  - `gltfLoader.ts` — wraps `THREE.GLTFLoader`. Caches part GLBs.
  - `kitAssembler.ts` — instantiate parts at manifest transforms; resolve mount empties; expose `attachments` map.
  - `mountPoints.ts` — read named empties (`mount.nose`, etc.) from a GLTF scene; fall back to manifest coords; fall back to primitive defaults.
- Refactor `src/game/ship.ts`:
  - Move primitive builders to `src/render/shipVisual/primitives.ts` (no behavior change).
  - `Ship` constructor accepts an async-ready resolver; primitive is sync default while resolver loads.
- TypeScript types: `ShipManifest`, `ShipPart`, `MountName` mirroring spec.

### 4. Ship-builder hangar (UI at base)

- **New `src/game/hangar.ts`** — opens when ship enters base trigger _and_ player presses `B` (gamepad)/`Tab` (keyboard). Pauses physics + freezes ship.
- **New `src/render/hangarUI.ts`** — DOM overlay panel:
  - Left: parts catalog grouped by mount slot (hull, cockpit, engine-l/r, wing-l/r, topspine, cargo-bay, weapon-l/r).
  - Center: live 3D preview of current manifest using same `ShipVisualResolver`. Free orbit camera. Lit with same scene rig.
  - Right: stats projection (mass, thrust, cargo cap, energy, agility) computed from selected parts.
  - Bottom: bank balance, total cost, "Apply" / "Cancel" / "Reset to default".
- Builder writes the manifest to localStorage under `slingshot.save.v1.shipManifest`. Resolver loads it on next launch from base.
- For first version, parts catalog is procedural-primitive parts (cones/cylinders/boxes) authored in code under `src/render/shipVisual/builtinParts.ts`. Each part has `{ id, slot, displayName, cost, statsDelta, build }`. Spec-compliant: same system extends to GLB parts later — `build` becomes "load GLB by path".
- Validation: required slots (hull, cockpit, ≥1 engine) must be filled. Missing → disable Apply.

### 5. Combat

- **New `src/game/weapons.ts`** — projectile system:
  - `Projectile` rigid body (small dynamic sphere collider, mass 0.05 kg) with TTL.
  - Spawned at hardpoint world transform with inherited ship velocity + muzzle velocity.
  - Each tick: apply gravity acceleration from `sampleGravityAt` (curves in wells per vision).
  - Collision groups: `COL_PROJECTILE` (new) hits `COL_ASTEROID | COL_SHIP | COL_ENEMY`.
- **New `src/game/enemies.ts`** — enemy ship registry + AI:
  - `Enemy` extends ship pattern: rigid body + visual (one primitive variant for V1) + tunable params.
  - State machine: `idle` (drift) → `mine` (orbit nearest non-claimed asteroid) → `engage` (chase player if armed and player has cargo) → `flee` (low health/energy, head to map edge) → `dead` (scatter cargo + wreck).
  - 4–8 enemies world-wide, respawned at field edges over time.
  - Use existing `gravity.ts` for trajectory; no special handling.
  - AI uses same `ShipCommand` shape as player → call same `Ship.applyCommand`. Reuses physics, visuals, upgrades pathway.
- **Hardpoints**: `weapon-l` / `weapon-r` mount points already exist in spec. Add procedural turret primitives.
- **Player firing**: `RB`/`LB` already used for yaw — remap fire to `RT` long-pull or new buttons. Use **gamepad A button (b0)** + keyboard `Space-when-not-strafing`/`F` to fire. (Space currently strafes up — switch keyboard fire to `F` and add to controls panel.)
- Damage: ships gain `health` field. Projectile contact = HP damage. HP 0 = death (player flow already exists; enemies scatter ore + small bank reward).

### 6. Cargo-mass effects (story §6.2)

- `Ship` already has `setAmbientPull`. Add `_cargoMass` derived from `economy.cargo`.
- Sluggishness: scale `FORWARD_THRUST`/strafe by `1 / (1 + cargo/cap × 0.4)` via effective tuning.
- Audio: pod hum pitch in `audio.ts` rises with cargo fraction. Add new sample or reuse rumble at modulated playbackRate.
- Visual: faint emissive pulse on `cargo-bay` attachment when full.

### 7. Field zoning + UX

- Add `FieldZone` overlay readout in HUD: open/mid/deep based on distance from base (≤1200 / 1200–3000 / >3000).
- Density already varies via `BAND_RANGE`. Tune so deep-field count is sparser-but-bigger.
- Toast on first-time zone transitions.

### 8. Audio expansion

- Add files (or synthesize via WebAudio oscillators if no sample): laser zap, hit, ship destroyed (different from rumble), pickup chime, deposit ka-chunk.
- Use `audio.ts` `unlock()` flow already in place.
- For V1 prefer WebAudio synth (no new asset deps).

### 9. Polish + closeout

- Win/loss readback: "Run #N — deposited X kg, peak speed Y m/s, deaths Z" toast on dock.
- Death cinematic: brief pull-out chase cam + slow fade (already partial via `lifecycle`).
- Persistent stats: total deposited, ships lost, deepest run distance.
- Rebalance pass: walk through complete loop with the tuning panel and tune costs/rates.
- README/docs: short readme on controls + how to add ship parts. Update `docs/state.md` + log entry. Append decisions for resolver and hangar choices.

---

## Critical files

| Path | Purpose | New/Edit |
|---|---|---|
| `src/game/persistence.ts` | Save/load localStorage | New |
| `src/game/upgrades.ts` | Upgrade defs + EffectiveTuning | New |
| `src/game/hangar.ts` | Hangar lifecycle, manifest writes | New |
| `src/render/hangarUI.ts` | DOM hangar overlay + live preview | New |
| `src/render/shipVisual/resolver.ts` | kit→glb→primitive resolver | New |
| `src/render/shipVisual/manifestLoader.ts` | JSON manifest validation | New |
| `src/render/shipVisual/gltfLoader.ts` | GLTF cache | New |
| `src/render/shipVisual/kitAssembler.ts` | Build from parts list | New |
| `src/render/shipVisual/mountPoints.ts` | Empty-resolution + fallback | New |
| `src/render/shipVisual/primitives.ts` | Move existing primitive builders here | Move |
| `src/render/shipVisual/builtinParts.ts` | Procedural kit parts catalog | New |
| `src/game/ship.ts` | Take resolver, expose health, manifest accessor | Edit |
| `src/game/weapons.ts` | Projectile system + curving in gravity | New |
| `src/game/enemies.ts` | AI ships + lifecycle | New |
| `src/game/collision.ts` | Add `COL_PROJECTILE`, `COL_ENEMY` groups + kinds | Edit |
| `src/game/economy.ts` | Cargo-mass coupling, persisted bank | Edit |
| `src/game/input.ts` | Fire button, hangar-open, mass-aware bindings | Edit |
| `src/game/feedback.ts` | Cargo-bloom hum hook | Edit |
| `src/audio/audio.ts` | Cargo-fraction pod hum + new SFX | Edit |
| `src/main.ts` | Wire persistence/upgrades/hangar/enemies/projectiles | Edit |
| `src/debug/tuningPanel.ts` | New tuning sections (combat, cargo mass) | Edit |
| `public/assets/ships/kits/parts/*` | Empty dirs; placeholder until art lands | New |
| `docs/state.md` | Current focus + new plan reference | Edit |
| `docs/decisions.md` | Append new decisions | Edit |
| `docs/log/2026-05-10 HHMM Rest-of-game.md` | Session log | New |
| `docs/plans/2026-05-10 HHMM Plan - Rest of game.md` | Copy of this plan per AGENTS.md memory rule | New |

---

## Reuse (don't reinvent)

- `sampleGravityAt(pos, asteroids)` from `src/game/gravity.ts` — reuse for projectile curving and enemy AI gravity awareness.
- `ContactRegistry` from `src/game/collision.ts` — extend with new `ContactKind` variants (`projectile`, `enemy`, `wreck`).
- `interactionGroups()` helper — same pattern, two new bits.
- `Ship.applyCommand(cmd, dt)` — enemies issue `ShipCommand` and reuse it.
- `pickups.spawnCargo(...)` — reuse for enemy death scatter.
- `predictTrajectory(...)` from `src/game/trajectory.ts` — same predictor for enemy AI lookahead.
- `TuningPanel` (lil-gui) — add sections rather than rebuilding.
- Audio gating pattern in `audio.ts` — extend, don't replace.
- `BuiltShip` interface in `ship.ts` — keep stable; resolver returns same shape.
- `attachPoints()` mount layout — already canonical; spec mirrors it.

---

## Verification

End-to-end smoke test:
1. `npm run dev`, open http://localhost:5173.
2. Boot: bank reads 0 (or persisted value if reload).
3. Launch from base, mine to ~2000kg, return → deposit toast → bank persists across reload.
4. Open hangar (Tab/B at base): UI overlays, 3D preview shows current ship; swap engine part; stats panel updates; Apply; flight scene reloads with new visual + new effective thrust.
5. Field: enemies spawn in deep field, mine asteroids, scatter on death.
6. Combat: fire weapon, projectile curves visibly in a deep-field well. Player takes damage from enemy fire, dies, scatters cargo, respawns at base.
7. Cargo coupling: full-cargo run feels measurably sluggish; pod hum pitches up.
8. Resolver fallback: rename a kit part path → game logs warning + falls back to primitive. No crash.
9. `npm run build` → tsc + vite build clean.
10. Tuning panel still works for all original knobs + new ones.

Manual feel check: complete one full loop (launch → deep run → enemy fight → return → upgrade → relaunch) and confirm it reads as a coherent game, not a tech demo.

---

## Out of scope

- Multiplayer (any flavor)
- AI-generated GLB integration (deferred until Blender cleanup)
- LOD / damage-state ship variants (manifest leaves the door open)
- Faction / corporate-claim systems (story alludes to but not load-bearing for V1)
- Dogfighting depth — combat stays light per vision
- Achievements / leaderboards
- Mobile / touch controls
