# 2026-05-10 2333 - Gamepad help and bumper boost

## What was done

- Removed the RB-held right-stick strafe mode.
- Mapped both LB and RB to boost.
- Kept right-stick X as yaw at all times.
- Left D-pad strafing in place.
- Added a compact standard-gamepad controller map to the start/course-select screen.
- Updated hidden panel help text to match the new bumper mapping.
- Ran `npm run build` successfully.

## What worked

- Production build passes.

## What didn't and why

- Existing large bundle warning remains from Three/Rapier.

## Decisions made

none

## Left unfinished

- Hands-on controller playtest for both-bumper boost and D-pad strafing.
- Visual pass on the new controller help at small viewport sizes.

## state.md updated: yes
