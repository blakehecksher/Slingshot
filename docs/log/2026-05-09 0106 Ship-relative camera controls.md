# 2026-05-09 0106 - Ship-relative camera controls

## What was done

- Changed chase camera from a world-up `lookAt` camera to a true ship-relative camera mount.
- Camera position and orientation now both inherit ship rotation, with optional look offset applied in ship space.
- Removed lateral left/right strafe from the default control mapping.
- Gamepad left stick now rolls; right stick yaws/pitches; triggers thrust/brake.
- Keyboard A/D now rolls; Q/E yaws; W/S remains thrust/brake.
- Updated the on-screen controls panel.

## What worked

- `npm run build` passes.
- Local dev server still responds at `http://127.0.0.1:5173/Slingshot/`.
- The change directly addresses the world-relative camera feel without touching gravity, asteroid generation, trajectory prediction, or minimap.

## What didn't and why

- Still needs hands-on feel testing; camera attachment and control mapping are feel questions.

## Decisions made

none

## Left unfinished

- Human tuning pass for exact thrust/brake/rotation constants.
- M6 verdict log.

## state.md updated: yes
