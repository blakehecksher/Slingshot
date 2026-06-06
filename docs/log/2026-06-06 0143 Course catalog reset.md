# 2026-06-06 0143 - Course catalog reset

## What was done

- Changed `src/game/racing/courseCatalog.ts` so the old authored course list is retained as `LEGACY_RACE_COURSES`, with non-Claim courses exported as `ARCHIVED_RACE_COURSES`.
- Reset the active `AUTHORED_RACE_COURSES` export to Claim Shakedown, Claim Highline, Claim Crosswind, Claim Iron Hook, and Claim Traverse.
- Added three Claim Shakedown-style variants focused on vertical routing, lateral sweeping, and one gentle Dead Iron hook.
- Added Claim Traverse as a large point-to-point prototype across a much larger field, with 5,200 procedural asteroids and four authored Dead Iron landmarks.
- Added high-density asteroid rendering safeguards: lower mesh detail and fewer glints/rings when procedural counts are very high.
- Added a broad gravity influence cutoff so distant passive rocks do not dominate performance or muddy the feel in dense fields.
- Expanded minimap range and changed minimap asteroid display to use nearby visible asteroids instead of the first generated asteroids.
- Updated `docs/state.md` and appended a durable course-direction decision to `docs/decisions.md`.

## What worked

- `npm.cmd run build` completed successfully.
- The active course board is now driven by the new five-course active catalog while the previous courses remain recoverable from source.
- Vite printed a ready URL at `http://127.0.0.1:5173/Slingshot/` when started in a hidden background process.

## What didn't and why

- Browser/controller playtest was not performed in this session. The in-app browser reported `iab` unavailable, and the hidden background Vite process exited before an HTTP smoke check could connect. The course shapes, traversal length, dense-field performance, and medal times still need hands-on tuning.

## Decisions made

- Active courses should move away from lab/tutorial exercise progression and toward claim-field racing: Claim Shakedown, three Shakedown-like variants, and a large point-to-point traverse prototype.

## Left unfinished

- Playtest all five active courses with keyboard and controller.
- Tune Claim Traverse performance, density, beacon readability, gravity landmark strength, gate spacing, and medal targets.
- Decide whether archived lab/tutorial courses should remain source-only archives or move to a separate historical file later.

## state.md updated

yes
