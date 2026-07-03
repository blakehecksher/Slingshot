# Slingshot - Ship Asset Pipeline

_Status: Draft_  
_Created: 2026-05-09 1907_  
_Purpose: Define how ship visuals should evolve from primitive prototypes into real game assets without blocking gameplay iteration._

---

## Goal

Ships should be able to improve visually over time without forcing a rewrite of flight, collision, upgrades, tuning, or debug tooling.

The game should support three visual tiers for every ship:

1. **Kit-built ship** - assembled from reusable parts and pieces.
2. **Full-model ship** - loaded as one complete GLB/GLTF model.
3. **Primitive fallback ship** - generated from the current procedural Three.js primitives.

The ideal path is kit-built because it supports future ship customization and upgrade visibility. Full models are still useful, especially when generated from concept images with tools like Meshy/Tripo/Rodin and cleaned up externally. Primitive ships stay as the last-resort fallback so the game remains playable even when assets are missing, broken, or still in progress.

---

## Desired Resolution Order

When the game needs to load a ship visual, it should resolve in this order:

1. **Try kit definition**
   - Load a manifest describing a ship assembled from reusable parts.
   - Example: hull module, cockpit module, engine pods, cargo rack, radiator fins, antennas, boost nozzles.
   - This is the long-term preferred path.

2. **Try full model**
   - If no kit definition exists, load a complete ship model from a separate full-model folder.
   - This supports AI-generated or commissioned complete ships.
   - The full model should still expose or be paired with named mount points.

3. **Use primitive fallback**
   - If neither asset path exists or loading fails, use the procedural primitive variant already in code.
   - This keeps the game playable and keeps ship selection/debug stable during development.

This fallback chain should happen per ship variant, not globally. One ship can be kit-built while another still uses a full model or primitive fallback.

---

## Proposed Folder Shape

```text
public/
  assets/
    ships/
      kits/
        parts/
          engines/
          hulls/
          cockpits/
          cargo/
          radiators/
          weapons/
          utility/
        scrapper-mk1.ship.json
        tamarack-07.ship.json
        gravity-runner.ship.json
      full-models/
        scrapper-mk1.glb
        tamarack-07.glb
        gravity-runner.glb
      materials/
        ship-common.json
        decals/
```

The exact folder names can change, but the conceptual split should remain:

- `kits/parts/` for reusable modules.
- `kits/*.ship.json` for assembled ship definitions.
- `full-models/*.glb` for one-piece ships.
- procedural primitives stay in source code as fallback.

---

## Ship Definition Shape

A kit-built ship should be data-driven. The code should not hard-code the part layout for every ship.

Example shape:

```json
{
  "id": "scrapper-mk1",
  "displayName": "Scrapper Mk-I",
  "fallbackPrimitive": "scrapper",
  "fullModel": "/assets/ships/full-models/scrapper-mk1.glb",
  "parts": [
    {
      "id": "hull",
      "asset": "/assets/ships/kits/parts/hulls/wedge-runner-a.glb",
      "position": [0, 0, 0],
      "rotation": [0, 0, 0],
      "scale": [1, 1, 1],
      "material": "patched-cream"
    },
    {
      "id": "engine-main",
      "asset": "/assets/ships/kits/parts/engines/tri-main-a.glb",
      "position": [0, -0.05, 1.4],
      "rotation": [0, 0, 0],
      "scale": [1, 1, 1],
      "mount": "engine-main"
    }
  ],
  "mounts": {
    "nose": [0, 0.05, -2.4],
    "wing-l": [-1.7, 0, 0.55],
    "wing-r": [1.7, 0, 0.55],
    "engine-l": [-0.55, -0.12, 1.85],
    "engine-r": [0.55, -0.12, 1.85],
    "topspine": [0, 0.5, 0],
    "cargo-bay": [0, -0.35, 0.4],
    "boost-l": [-0.55, -0.12, 1.9],
    "boost-r": [0.55, -0.12, 1.9]
  }
}
```

The manifest should be allowed to grow later. Do not overfit the first version.

Likely future fields:

- damage states
- paint variants
- decal sets
- LOD models
- cockpit camera anchor
- landing gear anchors
- hardpoints for weapons/tools
- cargo pod capacity visualization
- upgrade compatibility tags

---

## Required Mount Points

Every ship visual path should expose a common set of mount points, either as named empties in the GLB or as coordinates in the manifest.

Current required points:

- `nose`
- `wing-l`
- `wing-r`
- `engine-l`
- `engine-r`
- `topspine`
- `cargo-bay`

Likely next points:

- `boost-l`
- `boost-r`
- `cockpit-camera`
- `weapon-l`
- `weapon-r`
- `utility-l`
- `utility-r`
- `radiator-l`
- `radiator-r`

The important rule: gameplay systems should ask for mount points by name, not know whether the ship came from a kit, a full GLB, or primitives.

---

## Full-Model Ship Requirements

Full models are useful for AI-generated or externally made ships. They should be easy to drop into the game.

Recommended requirements:

- Format: `.glb`.
- Real-world-ish orientation:
  - forward is local negative Z
  - up is local positive Y
  - right is local positive X
- Origin near the ship center of mass.
- Model scale should match the current playable bounds closely.
- Mesh should fit inside or near the current gameplay collider unless collider authoring is intentionally expanded later.
- Materials should use PBR-friendly names and avoid huge uncompressed textures.
- Boost nozzles should be named or listed in a sidecar manifest.
- Optional named empties:
  - `mount.nose`
  - `mount.engine-l`
  - `mount.engine-r`
  - `mount.cargo-bay`
  - `mount.boost-l`
  - `mount.boost-r`
  - `mount.cockpit-camera`

If a full model does not include mount empties, the game can use the ship manifest's mount coordinates.

---

## Kit-Built Ship Requirements

Kit-built ships are the preferred long-term direction because they support customization.

A ship kit should be made of reusable GLB parts:

- hull sections
- cockpit/canopy modules
- engine pods
- boost nozzles
- cargo racks and pods
- radiator fins
- armor panels
- antennas/sensor booms
- mining intake rings
- weapons/tools
- utility boxes, cables, braces, struts

Parts should be visually specific but not too precious. The player should eventually be able to swap, upgrade, remove, and rearrange them.

Good kit parts need:

- clear pivot/origin placement
- sane scale
- consistent material slots
- low enough triangle count for browser runtime
- good silhouettes from cockpit/chase distance
- enough beveling and surface detail to stop reading as primitive boxes

---

## Future Ship Builder Direction

The longer-term game direction includes a separate ship-building window where the player constructs or modifies their ship.

That future builder should operate on the same kit manifest system described here. The builder should not be a separate one-off representation.

Long-term loop:

1. Player docks at base.
2. Opens ship builder/hangar.
3. Swaps modules, engines, cargo pods, armor, tools, and cosmetics.
4. Builder writes or updates a ship manifest.
5. Flight scene loads that manifest through the normal ship visual resolver.

This lets development use the same system as gameplay:

- Developer kitbash manifests become player-editable ships later.
- Upgrade visuals become real parts mounted on real anchors.
- Full-model ships can still exist as locked/premium/legacy ships if desired.
- Primitive fallbacks remain useful for test variants and broken assets.

---

## Recommended Implementation Phases

### Phase A - Asset-ready loader

- Add a `ShipVisualResolver`.
- Add GLTF loading for full-model ships.
- Keep primitive fallback exactly available.
- Define manifest types in TypeScript.
- Preserve current `Ship` gameplay API.

Goal: dropping `scrapper-mk1.glb` into the expected folder can replace the primitive Scrapper.

### Phase B - Mount point normalization

- Read named empties from GLB files.
- Fall back to manifest coordinates.
- Fall back to primitive attachment points.
- Expose a single normalized `attachments` map.

Goal: boost VFX, upgrades, camera anchors, and tools work no matter how the ship visual was built.

### Phase C - Kit assembly

- Load multiple GLB parts from a manifest.
- Apply transforms/material overrides.
- Cache loaded part assets.
- Merge or group parts depending on performance needs.

Goal: a ship can be assembled from reusable modules.

### Phase D - Art polish hooks

- Add material override palettes.
- Add decal support.
- Add emissive/boost nozzle markers.
- Add optional damage/wear variants.
- Add LOD or simplified distant rendering if needed.

Goal: ships stop looking like raw imported models and start looking like they belong in the same field.

### Phase E - Ship builder

- Build a separate hangar/builder UI.
- Use kit manifests as the save/load format.
- Add validation for required mount points and gameplay constraints.
- Connect ship parts to upgrades and economy.

Goal: ship construction becomes a playable system, not just an art pipeline.

---

## AI 3D Generation Workflow

AI-generated ships should be treated as source material, not final runtime assets.

Recommended path:

1. Generate model from concept image in Meshy/Tripo/Rodin/etc.
2. Export GLB/FBX/OBJ.
3. Clean in Blender:
   - orient to game axes
   - set origin
   - remove broken interior garbage
   - simplify unnecessary geometry
   - assign/clean materials
   - add mount empties
   - compress textures
4. Export `.glb`.
5. Drop into `public/assets/ships/full-models/`.
6. Add or update ship manifest.
7. Verify in game through the normal selector.

Expected quality issues from AI models:

- melted panel details
- bad undersides
- strange engine openings
- messy topology
- overly large textures
- inconsistent material names
- asymmetry that is not intentional
- missing hardpoints/mounts

The game pipeline should assume AI assets need cleanup, but should make the cleaned result easy to test.

---

## Art Direction Rules

Slingshot ships should look like working field tools, not pristine hero props.

Good visual signals:

- oversized maneuvering thrusters
- exposed nozzles and reaction-control clusters
- bolted cargo pods
- patched armor plates
- radiator fins
- sensor booms
- mining intakes
- worn paint
- mismatched panels
- visible repair work
- amber/teal instrument glow
- warm desaturated colors with occasional utility accents

Avoid:

- perfectly clean chrome sci-fi
- generic fighter silhouettes with no mining function
- decorative detail that does not imply a job
- assets from wildly different visual styles without material unification
- one-off models that cannot expose common mount points

---

## Success Criteria

This pipeline is working when:

- The game can load a high-quality full ship model without code changes.
- A missing or broken asset falls back gracefully.
- Kit parts can assemble a ship that looks coherent from chase view and cockpit context.
- Boost VFX attach to the right places on every visual path.
- Upgrade visuals can mount to named points without knowing the asset source.
- Primitive ships remain useful as development stand-ins.
- The future ship builder can reuse the same manifests instead of inventing a new format.

