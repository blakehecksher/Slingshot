# 2026-05-10 2138 - Bumper strafe and yaw invert

## What was done

- Inverted right-stick X yaw so left/right match hands-on expectation.
- Remapped LB/RB from yaw to lateral strafe.
- Updated the in-game controls panel to show bumper strafe.
- Ran `npm run build`.

## What worked

- Build passed.
- The existing normalized command model made this a small input-only change.

## What didn't and why

- Physical controller feel still needs final hands-on confirmation.
- Vite still reports the known large chunk warning.

## Decisions made

none

## Left unfinished

- Playtest corrected right-stick yaw and LB/RB strafe during a real racing run.

## state.md updated: yes
