# 2026-05-22 0043 - Trigger roll controller trial

## What was done

- Revised the stick-throttle controller trial so left stick Y is forward/reverse thrust, left stick X is lateral strafe, right stick is pitch/yaw, LT/RT are analog roll, LB/RB remain boost, and D-pad remains secondary strafe.
- Updated in-game controller help and pad debug labels from the prior LT/RT yaw trial.

## What worked

- The change is a narrow input remap and keeps the shaped-input, angular-ramp, gravity braking, and trajectory work intact.
- `npm run build` passes.

## What didn't and why

- Not physically playtested yet after the remap.

## Decisions made

- RT/LT should be roll and the right stick should control pitch/yaw for the next controller-feel trial.

## Left unfinished

- Hands-on controller playtest.

## state.md updated: yes
