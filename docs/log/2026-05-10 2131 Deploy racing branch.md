# 2026-05-10 2131 - Deploy racing branch

## What was done

- Switched `.github/workflows/deploy.yml` so GitHub Pages deploys on pushes to `racing-time-trials` instead of `main`.
- Added a decision entry superseding the original deploy-from-main decision.
- Updated `docs/state.md` with the current deployment state.

## What worked

- The existing workflow already used official GitHub Pages actions, so only the trigger branch needed to change.
- `npm run build` completed successfully after the workflow change.

## What didn't and why

- The exact `date '+%Y-%m-%d %H%M'` command failed because this session is PowerShell, where `date` resolves to `Get-Date`; used `Get-Date -Format "yyyy-MM-dd HHmm"` for the timestamp.

## Decisions made

- GitHub Pages should deploy from `racing-time-trials` while `main` remains independent.

## Left unfinished

- Verify the GitHub Actions Pages run completes after `racing-time-trials` is pushed.

## state.md updated: yes
