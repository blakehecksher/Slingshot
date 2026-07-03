# 2026-05-18 2102 - Settings menu fix

## What was done

- Rebuilt the settings screen as its own compact terminal card instead of using the generic scene shell.
- Removed the oversized header/callsign layout from settings.
- Kept settings as a single-column list with one internal scroll area.
- Added an explicit Back button for mouse users.
- Build-checked with `npm run build`.

## What worked

The settings markup was isolated cleanly from the generic course/results shell, which removed the nested-scrollbar problem.

## What didn't and why

No automated browser screenshot was available in this session. Manual review remains needed.

## Decisions made

none

## Left unfinished

- Manual visual confirmation at desktop and mobile widths.

## state.md updated: yes
