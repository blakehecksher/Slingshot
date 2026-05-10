import {
  defaultManifestParts,
  getPart,
  type PartSlot,
  type ShipManifest,
  type ShipPart,
} from '../render/shipVisual';
import { applyCost, manifestIsValid } from './upgrades';

// Hangar gameplay state — separate from the DOM UI. Holds the working
// (preview) manifest the player is editing. Apply commits.

export class HangarState {
  open = false;
  workingParts: ShipPart[];

  constructor(initial: ShipPart[]) {
    this.workingParts = initial.map((p) => ({ ...p }));
  }

  reset(initial: ShipPart[]): void {
    this.workingParts = initial.map((p) => ({ ...p }));
  }

  resetToDefault(): void {
    this.workingParts = defaultManifestParts();
  }

  setSlot(slot: PartSlot, partId: string | null): void {
    if (partId === null) {
      this.workingParts = this.workingParts.filter((p) => p.slot !== slot);
      return;
    }
    const part = getPart(partId);
    if (!part) return;
    if (part.slot !== slot) return;
    const idx = this.workingParts.findIndex((p) => p.slot === slot);
    if (idx >= 0) this.workingParts[idx] = { slot, partId };
    else this.workingParts.push({ slot, partId });
  }

  toManifest(id = 'player', name = 'Custom rig'): ShipManifest {
    return { id, displayName: name, parts: this.workingParts.map((p) => ({ ...p })) };
  }

  isValid(): boolean {
    return manifestIsValid(this.toManifest());
  }

  costToApply(owned: readonly string[]): number {
    return applyCost(this.toManifest(), owned);
  }
}
