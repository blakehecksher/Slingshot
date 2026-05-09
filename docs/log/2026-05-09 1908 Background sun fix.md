# 2026-05-09 1908 - Background sun fix

## What was done

- Removed the finite sun disc mesh from the navigable world.
- Added sun core/glow bands to the nebula dome shader using the same direction as the warm key light.

## What worked

- The visible sun now reads as distant background lighting and cannot be flown through.
- `npm run build` passes.

## What didn't and why

- No runtime screenshot review was completed.

## Decisions made

- Keep the sun as art-direction/background context only, with scene lighting handled by directional lights.

## Left unfinished

- Bloom/exposure can still be tuned after another hands-on play pass.

## state.md updated: yes
