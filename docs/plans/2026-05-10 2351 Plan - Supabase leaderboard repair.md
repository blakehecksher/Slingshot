status: complete

# Plan - Supabase leaderboard repair
_Created: 2026-05-10 2351_

## Goal

Make the Supabase leaderboard show shared top-10 standings reliably and prevent deployed builds from silently using the local-only provider.

## Steps
1. Verify live Supabase rows and the app's leaderboard query behavior.
2. Split remote standings fetches from ghost replay fetches so top-10 display does not download every ghost payload.
3. Update GitHub Pages deployment so Supabase env vars are required at build time.
4. Build-check and update state/log.

## Notes

- Live Supabase read showed multiple `claim-shakedown` rows and `dead-iron-sweep` rows, so storage/RLS were not the one-row bottleneck.
- A Vite build without `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` compiles the app into local-only mode, which can only show the local best row.
