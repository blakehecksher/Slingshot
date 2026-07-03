# 2026-05-10 1850 - Multiplayer leaderboard

## What was done

- Added pilot-name persistence and an editable pilot-name field to the course screen.
- Added per-course leaderboard entries to the provider interface.
- Updated the Supabase provider to fetch the top shared rows, expose remote status/errors, and keep the fastest known run available as the ghost target.
- Added global standings and ghost-target UI to the course select screen.
- Guarded keyboard shortcuts while typing in the pilot-name input.
- Updated README notes for shared standings and pilot-name storage.
- Ran `npm run build`.
- Verified the configured Supabase REST endpoint with a read-only request: HTTP 200 and one existing `claim-shakedown` row returned.

## What worked

- TypeScript and Vite build cleanly.
- `.env.local` Supabase URL/key can read `public.race_leaderboard`.
- Existing remote row confirms the table exists and data is present.

## What didn't and why

- The first Supabase verification attempt failed inside the restricted sandbox because outbound network access was blocked. Retried with approval and the request succeeded.

## Decisions made

none

## Left unfinished

- Browser playtest a full finish flow to confirm the updated course screen refreshes immediately after insert.
- Tune course times and ghost visibility from real multiplayer runs.

## state.md updated: yes
