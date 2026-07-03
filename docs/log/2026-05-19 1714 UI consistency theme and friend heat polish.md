# 2026-05-19 1714 - UI consistency theme and friend heat polish

## What was done

- Added a shared theme module at `src/render/theme.ts` that emits CSS
  variables on `:root` for colors, typography, spacing, borders and the
  scanline / panel-shadow effects. Imported and injected before the scene
  stylesheet in `src/main.ts` so the rest of the menu styles can read tokens
  via `var(--c-*)`, `var(--fs-*)`, `var(--font-*)`, etc.
- Appended an "Aesthetic consistency overlay" to the bottom of
  `injectRaceStyles()` so the pause / invalid / results / friend-heat /
  settings scenes inherit the same dark monochrome Amber Iron palette,
  typography (IBM Plex Mono everywhere with Orbitron for big numerics),
  selection treatment (left amber bar, `var(--c-bg-4)` highlight),
  scrollbar styling, and section-title eyebrow pattern that the start
  screen already uses. Primary scene action (Retry, Mark ready, Resume,
  etc) now renders as a filled amber pill, secondary actions stay
  monochrome. Friend Heat invite/timer cards, join input, and participant
  lists were retuned to match.
- Polished the start screen itself: tightened header / board / hint
  spacing, calmer leaderboard typography, neutral course-meta chips, and
  primary `Start Race` is now visibly larger and the only filled button on
  the screen. Personal-best `b` uses the Orbitron numeric face from the
  theme.
- Fixed the records comparison graph drawing as a filled triangle: gave
  `polyline` an `!important` `fill: none` and split the `.you-line /
  .you-dot` etc rules into separate `polyline.*-line` and `circle.*-dot`
  selectors so the dot fill never bleeds onto the line. Lines now render
  as a standard non-filling line graph in the start-screen records panel.
- Friend Heat bug fixes:
  - Added `overflow-x: hidden` on `.course-card` so the friend-entry
    layout no longer triggers the rogue horizontal scrollbar shown in the
    screenshot.
  - Made the heat-duration and course rows obvious cycling controls:
    `friendCycleRow` renders `‹ value ›` chevrons that go bright when
    focused or hovered, and clicking the row now cycles forward through
    `HEAT_DURATION_OPTIONS` (right-click cycles backward). Keyboard /
    gamepad left-right still works as before.
  - When the Supabase request fails with the `PGRST205` "schema cache"
    error (Friend Heat tables not applied yet), `withFriendBusy` now
    surfaces a clear "Friend Heat tables missing. Apply
    docs/database/supabase-racing.sql in Supabase." message instead of
    dumping the raw PostgREST payload.
- `npm run build` passes.

## What worked

- The consistency overlay only needed CSS overrides; no scene HTML had to
  change to bring the older `course-card` shell in line with the
  start-screen claim-board.
- Splitting the SVG `polyline` / `circle` selectors fully removed the
  filled wedge in the records graph.

## What didn't and why

- I did not manually playtest in a browser this session - only
  build-checked. The Friend Heat schema cache error path was reasoned
  about from the screenshot but not exercised live against Supabase.

## Decisions made

- Theme tokens live in `src/render/theme.ts` and are emitted as a CSS
  variable block. Existing styles continue to use raw hex values where
  they already matched the palette; new and overlay styles use the
  variables so future tuning is centralized.
- Hard-edge zero-radius panel chrome and `IBM Plex Mono` are the canonical
  menu typography for every scene now.

## Left unfinished

- The Supabase `friend_heat_*` tables still need to be applied in the
  live project before two-browser playtest. (Pre-existing known issue.)
- No manual browser or controller playtest of the new look across pause /
  results / friend-lobby scenes yet.

## state.md updated: yes
