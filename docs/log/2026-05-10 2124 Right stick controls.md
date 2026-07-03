# 2026-05-10 2124 - Right stick controls

## What was done

- Remapped gamepad right stick X from camera look to ship yaw.
- Remapped gamepad right stick Y to vertical strafe for gate correction.
- Kept LB/RB yaw and D-pad strafe as backup controls.
- Updated the in-game controls panel to describe the new gamepad mapping.
- Ran `npm run build`.

## What worked

- Build passed.
- The input command model already supported yaw and vertical strafe, so no ship physics changes were needed.

## What didn't and why

- Physical controller feel was not verified in-browser during this pass.
- Vite still reports the known large chunk warning.

## Decisions made

none

## Left unfinished

- Playtest right-stick yaw direction and vertical strafe feel with a real controller.
- Invert or scale the axes if hands-on testing shows the mapping is backwards or too strong.

## state.md updated: yes
