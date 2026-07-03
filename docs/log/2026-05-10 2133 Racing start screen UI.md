# 2026-05-10 2133 - Racing start screen UI

## What was done

- Used Playwright screenshots to inspect the existing racing course/start screen at desktop size.
- Reworked the course select markup in `src/main.ts` into header, course list, leaderboard, ghost target, medal strip, and footer actions.
- Replaced the old compact CSS with a cleaner racing menu presentation, selected-course focus state, balanced desktop grid, and mobile-friendly stacked layout.
- Ran `npm.cmd run build`.

## What worked

- Playwright desktop and mobile screenshots rendered the redesigned UI without visible overflow.
- Build completed successfully.

## What didn't and why

- The project `date '+%Y-%m-%d %H%M'` command could not run because bash is not installed in this Windows shell; used `Get-Date -Format "yyyy-MM-dd HHmm"` after confirming that failure.
- Playwright was not installed locally, so `npx.cmd --yes playwright` was used after approval.

## Decisions made

none

## Left unfinished

- Hands-on keyboard/gamepad menu pass.
- Full course completion pass to verify Supabase submit, standings refresh, and ghost replay.

## state.md updated: yes
