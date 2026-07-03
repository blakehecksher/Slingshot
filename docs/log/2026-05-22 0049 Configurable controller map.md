# 2026-05-22 0049 - Configurable controller map

## What was done

- Added configurable gamepad flight-axis mapping for left stick X/Y, right stick X/Y, LT, and RT.
- Settings can now cycle each axis through pitch, yaw, roll, lateral/vertical strafe, thrust, inverted variants, or disabled.
- Default yaw is fixed from the prior trial by mapping right-stick X to inverted yaw.
- Updated controller help to point players to Settings instead of presenting the current layout as hardcoded.

## What worked

- The remap layer keeps existing radial stick shaping, trigger curves, angular velocity ramping, gravity-aware braking, well-exit assist, and trajectory prediction intact.
- `npm run build` passes.

## What didn't and why

- Not physically playtested yet after adding Settings mapping.

## Decisions made

- Controller flight axes should be player-configurable in Settings while the default remains left stick thrust/strafe, right stick pitch/yaw, LT/RT roll, and LB/RB boost.

## Left unfinished

- Hands-on controller playtest and tuning of defaults after using the new mapping UI.

## state.md updated: yes
