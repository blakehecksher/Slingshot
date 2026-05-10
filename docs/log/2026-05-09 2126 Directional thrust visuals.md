# 2026-05-09 2126 - Directional thrust visuals

## What was done

- Replaced the single boost-only plume list with named thruster groups on each procedural ship.
- Added rear main plumes for normal forward thrust, elongated rear plumes for boost, cool front reverse plumes, and side/top/bottom maneuvering plumes for strafe inputs.
- Kept the visuals driven from the existing `ShipCommand` values so input and physics remain unchanged.

## What worked

- `npm.cmd run build` passes.
- The existing build still reports only the known Vite chunk-size warning.

## What didn't and why

- No browser/gamepad live test was run in this pass.

## Decisions made

none

## Left unfinished

- Tune plume placement/length in live play if any variant reads poorly from chase camera.

## state.md updated: yes
