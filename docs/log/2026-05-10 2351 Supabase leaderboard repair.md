# 2026-05-10 2351 - Supabase leaderboard repair

## What was done

- Verified the live Supabase `race_leaderboard` table has multiple shared rows visible through the publishable key.
- Refactored Supabase leaderboard reads so the course standings request selects only summary fields for the top 10.
- Added a separate one-row top-run fetch for the ghost replay source.
- Updated the GitHub Pages workflow to require `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` during build.
- Documented the GitHub Pages Supabase variables in README.
- Ran `npm run build`.

## What worked

- Supabase read returned 13 visible rows, including 11 `claim-shakedown` rows and 2 `dead-iron-sweep` rows.
- Build completed successfully.

## What didn't and why

- The first live Supabase verification failed inside the restricted sandbox because outbound network access was blocked. Retried with approval and the read succeeded.
- The existing build chunk-size warning remains because Three/Rapier still bundle into a large app chunk.

## Decisions made

none

## Left unfinished

- Configure the GitHub repository config if it is not already set:
  `VITE_SUPABASE_URL` as a variable, `VITE_SUPABASE_PUBLISHABLE_KEY` as a variable or secret, and optional `VITE_SLINGSHOT_PLAYER_NAME`.
- Push `racing-time-trials` and verify the GitHub Pages workflow deploys with Supabase enabled.

## state.md updated: yes
