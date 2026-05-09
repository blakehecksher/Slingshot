# 2026-05-09 1840 - Ship variants and boost

## What was done

- Added procedural ship variants based on the concept images: Scrapper Mk-I, Tamarack-07, Veteran gravity-runner/courier, plus the existing Sparrow prototype.
- Preserved the existing ship collider bounds and attachment-point names across variants.
- Added boost plume geometry to every variant.
- Added ship visual selection through the tuning panel and V hotkey cycling.
- Mapped boost to B/Shift and the top end of RT forward thrust.
- Changed boost energy drain so it only drains when boost is adding forward thrust.

## What worked

- `npm run build` passed, including TypeScript and Vite production build.

## What didn't and why

- Direct `npx tsc --noEmit` was blocked by local PowerShell execution policy for `npx.ps1`. The same TypeScript check passed through `npm run build`.

## Decisions made

none

## Left unfinished

- Visual variants are still primitive-based approximations, ready for later model replacement.

## state.md updated: yes
