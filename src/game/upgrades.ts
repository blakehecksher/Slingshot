import {
  defaultManifestParts,
  getPart,
  type BuiltinPartDef,
  type PartStatDelta,
  type ShipManifest,
  type ShipPart,
} from '../render/shipVisual';
import { defaultShipMods, type ShipMods } from './ship';

// Single source of truth for "what mods does this manifest grant?"
// Kit parts ARE upgrades in V1: swapping to a better engine pod IS the
// upgrade. Cost is paid the first time a player uses a given part (tracked
// in save.upgradesOwned). Re-mounting an already-owned part is free.

export function computeModsFromParts(parts: readonly ShipPart[]): ShipMods {
  const mods = defaultShipMods();

  let thrustAdd = 0;
  let reverseAdd = 0;
  let agility = 1;
  let weaponDamage = 0;
  let weaponRof = 0;
  let weaponMuzzle = 0;
  let weaponCount = 0;

  for (const entry of parts) {
    const part = getPart(entry.partId);
    if (!part) continue;
    const s: PartStatDelta = part.stats;

    if (s.thrust) thrustAdd += s.thrust;
    if (s.reverseThrust) reverseAdd += s.reverseThrust;
    if (s.agility) agility *= s.agility;
    if (s.cargoCap) mods.cargoCapAdd += s.cargoCap;
    if (s.energyMax) mods.energyMaxAdd += s.energyMax;
    if (s.hullHp) mods.hullHpMax += s.hullHp;
    if (s.miningCoef) mods.miningCoefAdd += s.miningCoef;
    if (s.brake) mods.brakeMult *= s.brake;
    if (s.mass) mods.partMass += s.mass;

    if (s.weaponDamage || s.weaponRof || s.weaponMuzzle) {
      // Average across mounted weapons. Two cutters = same dps as one cutter
      // x2 muzzles. Keeps math simple; weapons code fires from each mount.
      weaponDamage += s.weaponDamage ?? 0;
      weaponRof += s.weaponRof ?? 0;
      weaponMuzzle += s.weaponMuzzle ?? 0;
      weaponCount++;
    }
  }

  // Baseline 36 = sum of two stock engine pods (18+18).
  const baselineThrust = 36;
  const baselineReverse = 12;
  // Translate thrust adds into multipliers on SHIP_TUNING.FORWARD_THRUST.
  mods.thrustMult = Math.max(0.4, (baselineThrust + thrustAdd) / baselineThrust);
  mods.reverseMult = Math.max(0.4, (baselineReverse + reverseAdd) / baselineReverse);
  mods.agilityMult = agility;

  if (weaponCount > 0) {
    mods.weaponDamage = weaponDamage / weaponCount;
    mods.weaponRof = weaponRof / weaponCount;
    mods.weaponMuzzle = weaponMuzzle / weaponCount;
  }

  return mods;
}

export function manifestPartCost(manifest: ShipManifest): number {
  let cost = 0;
  for (const entry of manifest.parts) {
    const part = getPart(entry.partId);
    if (part) cost += part.cost;
  }
  return cost;
}

/** Cost to apply a new manifest given the player's owned parts. Already-owned
 *  parts (or zero-cost defaults) are free; new parts charge their listed
 *  cost. */
export function applyCost(newManifest: ShipManifest, owned: readonly string[]): number {
  const ownedSet = new Set(owned);
  let cost = 0;
  for (const entry of newManifest.parts) {
    if (ownedSet.has(entry.partId)) continue;
    const part = getPart(entry.partId);
    if (!part) continue;
    if (part.cost > 0) cost += part.cost;
  }
  return cost;
}

/** Returns part defs that would be newly purchased by applying `manifest`. */
export function newPartsForApply(manifest: ShipManifest, owned: readonly string[]): BuiltinPartDef[] {
  const ownedSet = new Set(owned);
  const out: BuiltinPartDef[] = [];
  for (const entry of manifest.parts) {
    if (ownedSet.has(entry.partId)) continue;
    const part = getPart(entry.partId);
    if (part && part.cost > 0) out.push(part);
  }
  return out;
}

/** Build the bootstrap "stripped runner" manifest used when no save exists. */
export function defaultManifest(): ShipManifest {
  return {
    id: 'default-stripped',
    displayName: 'Stripped runner',
    parts: defaultManifestParts(),
  };
}

/** Required slots that must be filled for an Apply to be valid. */
export const REQUIRED_SLOTS = ['hull', 'cockpit', 'engine-l', 'engine-r'] as const;

export function manifestIsValid(manifest: ShipManifest): boolean {
  const filled = new Set(manifest.parts.map((p) => p.slot));
  for (const slot of REQUIRED_SLOTS) {
    if (!filled.has(slot)) return false;
  }
  return true;
}
