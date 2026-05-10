# Slingshot

Browser-based 3D spaceship game about momentum and gravity. Mine asteroids,
ride gravity wells, fight scavengers, return to base, build a better ship,
go deeper.

Specs in `docs/spec/`:

- `gravity-game-vision.md` — what the game is and how it should feel.
- `slingshot-story-spec.md` — Dead Iron, the field, the working-class fiction.
- `ship-asset-pipeline.md` — kit-built / full-model / primitive ship visuals.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc + vite build
```

## Controls

### Xbox controller

| Input | Action |
|---|---|
| Left stick | Roll / pitch |
| Right stick | Look around (chase/cockpit cam) |
| RT | Forward thrust (full pull = boost stage) |
| LT | Brake / reverse |
| LB / RB | Yaw right / left |
| D-pad | Strafe (up/down/left/right) |
| A | Fire weapon |
| B | Boost (drains energy) |
| X | Cycle ship visual |
| Y | Toggle chase / cockpit camera |
| Back | Hangar (when docked at base) |

### Keyboard + mouse

| Input | Action |
|---|---|
| W / S | Thrust forward / brake |
| A / D | Roll left / right |
| Q / E | Yaw left / right |
| Space / Ctrl | Strafe up / down |
| Shift | Boost |
| F | Fire weapon |
| Tab | Hangar (when docked at base) |
| Mouse (click to capture) | Yaw / pitch |
| Arrow keys | Pitch + yaw (alt) |
| C | Camera toggle |
| V | Cycle ship visual |
| P | Tuning panel |
| G | Gamepad debug |
| H | Hide / show controls |

## Loop

1. Launch from base.
2. Fly into the field. Mine by orbiting close (closer = faster, riskier).
3. Watch energy. Boost only when it's worth it. Snag energy pickups.
4. Avoid hostile patrol ships, or shoot them down for a small bank reward.
5. Get back to base alive. Cargo deposits to your bank automatically.
6. Open the hangar (Tab / Back) to swap parts. Better engines, bigger cargo
   pods, real weapons. Parts cost from your bank; once owned, free to remount.
7. Go deeper.

## Ship parts (V1)

Ship visuals resolve in this order per spec
(`docs/spec/ship-asset-pipeline.md`):

1. **Kit-built** — current player manifest, assembled from procedural part
   primitives in `src/render/shipVisual/builtinParts.ts`. The hangar edits
   this manifest.
2. **Full-model GLB** — if a manifest's `fullModel` field points to a `.glb`
   under `public/assets/ships/full-models/`, it is loaded and wrapped. Mounts
   come from named empties (`mount.nose`, etc.) or from manifest coords.
3. **Primitive fallback** — the four hand-coded variants in
   `src/render/shipVisual/primitives.ts`. V key cycles between them.

To add a new built-in part, append a `BuiltinPartDef` to the array in
`src/render/shipVisual/builtinParts.ts`. The hangar UI picks it up
automatically based on its `slot`.

## Save data

`localStorage["slingshot.save.v1"]` holds bank, owned parts, the current
manifest, and run stats. Bumping `SAVE_VERSION` in
`src/game/persistence.ts` drops old saves on next boot.

## Hosting

Built with Vite to a static bundle. Deploy `dist/` to GitHub Pages or any
static host. The Rapier WASM file is bundled.
