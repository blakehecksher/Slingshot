# 2026-05-15 0102 - Course authoring scaffold

## What was done

- Split runtime race-course definitions into a course authoring scaffold:
  - `src/game/racing/courseAuthoring.ts` defines authored course data, runtime course data, vector conversion, design briefs, field recipes, and gate beat notes.
  - `src/game/racing/courseCatalog.ts` holds the three current course definitions in the authored format.
  - `src/game/racing/courses.ts` remains the compatibility export for `RACE_COURSES`, `RaceCourse`, `RaceGate`, medal logic, and shared asteroid defaults.
- Converted Claim Shakedown, Dead Iron Sweep, and Black Core Run into the authored catalog.
- Eased Black Core Run by lowering field density/gravity intensity, widening gates, pulling the deepest gates closer, reducing drift, and loosening medal targets.
- Ran `npm run build`.

## What worked

- The rest of the game can still import `RACE_COURSES` from `src/game/racing/courses.ts`.
- Build passes after the refactor.

## What didn't and why

- The new field recipe values are scaffold metadata for now. The asteroid generator does not yet enforce gate clearances, route corridors, or authored gravity anchors.

## Decisions made

none

## Left unfinished

- Add generator support for route corridors, gate clearance, and authored gravity-anchor rocks.
- Add a course lab/debug view for route lines, gate labels, field safety volumes, and gravity checks.
- Playtest the eased Black Core Run in browser.

## state.md updated: yes
