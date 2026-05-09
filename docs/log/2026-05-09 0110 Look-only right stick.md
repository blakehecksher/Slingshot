# 2026-05-09 0110 - Look-only right stick

## What was done

- Changed controller right stick to camera look only.
- Mapped controller left stick to ship flight: left/right roll, up/down pitch.
- Removed bumper flight controls from the controller mapping.
- Updated the visible controls panel.

## What worked

- `npm run build` passes.
- Local dev server still responds at `http://127.0.0.1:5173/Slingshot/`.

## What didn't and why

- Still needs hands-on controller feel testing. This pass intentionally changes only mapping, not underlying physics.

## Decisions made

none

## Left unfinished

- Human tuning pass for exact roll/pitch rates and brake feel.
- M6 verdict log.

## state.md updated: yes
