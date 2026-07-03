# 2026-06-06 0204 - Traverse visual asteroid split

## What was done

- Added visual-only asteroid tuning keys: `VISUAL_COUNT`, `VISUAL_RADIUS_MIN`, `VISUAL_RADIUS_RANGE`, and `VISUAL_RADIUS_POWER`.
- Added a visual-only `THREE.InstancedMesh` layer inside `AsteroidField`.
- Kept `AsteroidField.asteroids` as the gameplay-only list used by Rapier, gravity, trajectory prediction, and minimap sampling.
- Added visual-layer disposal/regeneration so visual instances are removed when courses change.
- Added visual defaults to `RACE_ASTEROID_DEFAULTS` so visual density does not leak from Traverse into other courses.
- Reduced Claim Traverse from 5,200 real procedural asteroids to 900 real procedural asteroids.
- Added 5,600 visual-only instanced asteroids to Claim Traverse.

## What worked

- `npm.cmd run build` completed successfully.
- The large Traverse field now preserves background asteroid density without creating thousands of extra colliders or gravity bodies.

## What didn't and why

- Live browser/controller playtest was not performed in this session. The performance improvement is build-checked, but runtime frame rate and the visual density feel still need hands-on verification.

## Decisions made

- Dense course fields should separate gameplay asteroids from visual-only background asteroids.

## Left unfinished

- Playtest Claim Traverse in browser for frame rate and readability.
- Tune the 900 real / 5,600 visual split if the field feels too empty, too noisy, or still too expensive.
- Consider route-biased gameplay asteroid generation later if Traverse needs more real hazards near the intended line.

## state.md updated

yes
