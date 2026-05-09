# 2026-05-09 1854 - Lighting polish

## What was done

- Added ACES tone mapping and an EffectComposer pipeline with UnrealBloomPass.
- Replaced the flat black scene with a deep-field nebula dome, warmer sun disc, richer star colors, and subtle distance fog.
- Reworked scene lighting around warm key light, cyan rim light, violet kicker, and cool hemisphere fill.
- Updated ship, base, pickup, and asteroid materials for stronger specular/emissive response.
- Added ship cockpit/engine glow lights and base beacon/dock lights.
- Added lightweight blue/orange mineral glints to medium and large asteroids.

## What worked

- `npm run build` passes.
- The app responds on the existing local Vite server at `http://127.0.0.1:5173/Slingshot/`.

## What didn't and why

- A separate background Vite launch reported port 5174, but HTTP did not connect there. The already-running server on 5173 responded successfully.

## Decisions made

- Chose the darker deep-field concept direction over the bright teal/gold daylight direction for this pass, because it better matches the tense asteroid-run mood and current Phase 2 gameplay.

## Left unfinished

- No in-browser screenshot review was completed in this session.
- Further polish could tune bloom strength and light colors after hands-on play.

## state.md updated: yes
