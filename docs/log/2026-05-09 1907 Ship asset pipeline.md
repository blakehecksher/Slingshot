# 2026-05-09 1907 - Ship asset pipeline

## What was done

- Wrote `docs/spec/ship-asset-pipeline.md`.
- Captured the intended ship visual fallback order: kit-built manifest, full model, primitive fallback.
- Documented proposed folders, manifest shape, mount point requirements, AI 3D generation workflow, and future ship-builder direction.

## What worked

- The writeup gives future implementation a clear path without changing runtime code yet.

## What didn't and why

- None.

## Decisions made

- Ship visuals should resolve per variant as kit-built first, full model second, primitive fallback third.

## Left unfinished

- No code implementation yet. The next implementation step is a `ShipVisualResolver` and GLTF loading.

## state.md updated: yes
