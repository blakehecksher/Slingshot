// Versioned localStorage save. Bank, owned upgrades, manifest selection,
// and run stats. Bump SAVE_VERSION when shape changes — old saves are
// dropped silently rather than half-migrated.

const SAVE_KEY = 'slingshot.save.v1';
const SAVE_VERSION = 1;

export interface RunStats {
  totalDeposited: number;
  shipsLost: number;
  runsCompleted: number;
  deepestRunZ: number;
  peakSpeed: number;
}

export interface ShipManifestRef {
  id: string;
  // Optional inline manifest — used by the hangar so player-built ships
  // persist without needing a JSON file on disk.
  inline?: import('../render/shipVisual/manifestTypes').ShipManifest;
}

export interface SaveData {
  version: number;
  bank: number;
  upgradesOwned: string[];
  manifest: ShipManifestRef | null;
  stats: RunStats;
}

const DEFAULT_STATS: RunStats = {
  totalDeposited: 0,
  shipsLost: 0,
  runsCompleted: 0,
  deepestRunZ: 0,
  peakSpeed: 0,
};

function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    bank: 0,
    upgradesOwned: [],
    manifest: null,
    stats: { ...DEFAULT_STATS },
  };
}

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (parsed.version !== SAVE_VERSION) return defaultSave();
    return {
      version: SAVE_VERSION,
      bank: typeof parsed.bank === 'number' ? parsed.bank : 0,
      upgradesOwned: Array.isArray(parsed.upgradesOwned) ? parsed.upgradesOwned.filter((s) => typeof s === 'string') : [],
      manifest: parsed.manifest ?? null,
      stats: { ...DEFAULT_STATS, ...(parsed.stats ?? {}) },
    };
  } catch (err) {
    console.warn('[persistence] load failed, using fresh save', err);
    return defaultSave();
  }
}

export function save(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
  } catch (err) {
    console.warn('[persistence] save failed', err);
  }
}

export function reset(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
