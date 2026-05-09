# 2026-05-09 1820 - Tuning per-value reset

## What was done

- Added per-value reset buttons to the lil-gui tuning panel.
- Reset buttons appear only for controls whose current value differs from the captured default.
- Reset buttons are hover-only and reset just that specific tuning value.
- Kept the existing global reset, clipboard copy, field regeneration, and audio master-volume callback behavior.

## What worked

- `npm.cmd run build` passes.
- The existing large Vite chunk warning remains unchanged.

## What didn't and why

- none

## Decisions made

- none

## Left unfinished

- Browser feel-check of the hover affordance.

## state.md updated: yes
