# 2026-05-15 0004 - Repository cleanup

## What was done

- Removed generated/local artifacts: `dist/`, `.playwright-mcp/`, `playwright-images/`, `.vite-dev.err.log`, `.vite-dev.out.log`, and `debug.log`.
- Moved Supabase setup SQL from `docs/supabase-racing.sql` to `docs/database/supabase-racing.sql`.
- Updated README references for current specs and the new Supabase SQL path.
- Removed `docs/spec/archive` from `.gitignore` so archived specs can be tracked.
- Updated historical plan/log references to point at `docs/spec/archive/`.
- Left `.env.example` at repo root because it documents the Vite environment contract and is referenced by README setup.

## What worked

- Generated artifacts were cleanly removed.
- Supabase docs now live in a clearer database-specific docs folder.
- Archived spec files are no longer hidden by ignore rules.

## What didn't and why

- Tracked draft ship binaries in `public/ships/` were not removed because they are tracked assets and need an explicit retention/removal decision.
- Ignored `Blake/config-values/` was not removed because it may be personal scratch data, though the current source defaults already include the promoted tuning values.

## Decisions made

none

## Left unfinished

- Decide whether to delete or relocate `public/ships/`.
- Decide whether to delete the ignored `Blake/config-values/` scratch folder.

## state.md updated: yes
