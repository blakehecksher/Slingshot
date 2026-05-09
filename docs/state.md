# State
_Last updated: 2026-05-08 2301_

## Current focus

Phase 1, M0 — local gate passed. Awaiting initial push to GitHub for the Pages deploy verification half of M0.

## What's working

- Vite + TS project scaffolded. Strict tsconfig, ES2022 target.
- `three` ^0.169 and `@dimforge/rapier3d-compat` ^0.14 installed; production build clean (~2.5MB bundle, WASM inlined).
- `src/main.ts` renders a starfield + placeholder rust-colored ship cube against deep navy background. HUD shows live fps + physics dt.
- Fixed-timestep loop running at 1/120s with render interpolation hooks in place. Rapier world initialized with zero gravity (no bodies yet).
- Verified in Chrome via Playwright: 60fps, console clean (only a harmless favicon 404), starfield + cube visible.
- `.github/workflows/deploy.yml` wired with official Pages actions (`upload-pages-artifact` + `deploy-pages`).
- `vite.config.ts` `base: '/Slingshot/'` — confirmed in built `dist/index.html`.

## In progress

M0 deploy verification. Needs first push to a GitHub remote and the one-time repo setting (Settings → Pages → Source = "GitHub Actions").

## Known issues

- Build warns about chunk > 500kB. Expected — Three + Rapier + inlined WASM. Address only if it impacts feel/load.
- Favicon 404 in dev server. Cosmetic. Add a real favicon at some point.

## Next actions
1. `git init` (if not already), commit M0, create the GitHub repo, push to `main`.
2. In GitHub Settings → Pages → Source = "GitHub Actions" (one-time).
3. Confirm green Actions run + live URL renders the same scene at 60fps. Then M0 fully complete.
4. Begin M1 — ship as Rapier rigid body, cockpit camera, gamepad + keyboard input.

## Active plan
docs/plans/2026-05-08 2251 Plan - Phase 1 Gravity.md

## Recent logs
- docs/log/2026-05-08 2251 Kickoff.md — project kickoff, Phase 1 plan written, M0 scaffold + local verification
