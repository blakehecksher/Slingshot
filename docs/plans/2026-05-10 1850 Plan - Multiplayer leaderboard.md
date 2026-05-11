status: complete

# Plan - Multiplayer Leaderboard
_Created: 2026-05-10 1850_

## Goal

Make Supabase racing feel multiplayer-facing: pilots can set a display name, view shared course standings, and race the fastest known ghost.

## Steps
1. Extend the leaderboard provider with pilot-name persistence, remote status, and per-course top standings.
2. Fetch Supabase top rows for each selected course and keep using the fastest known run as the replay ghost.
3. Add course-screen UI for pilot name, global standings, ghost target, and Supabase connection feedback.
4. Build-check and verify the configured Supabase table/key with a read-only REST request.

## Notes

- The game still saves local bests first, then attempts Supabase insert/fetch.
- The shared ghost is the fastest known run for the selected course; if remote is unavailable, the local best remains playable.
