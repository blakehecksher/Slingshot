import RAPIER from '@dimforge/rapier3d-compat';

// One-time Rapier WASM init. Call once at boot before constructing PhysicsWorld.
export async function initPhysics(): Promise<void> {
  await RAPIER.init();
}

// Thin wrapper around RAPIER.World. Holds the world + an event queue and
// exposes a fixed-step interface. Gravity is zeroed; per-body forces (gravity,
// thrust) are applied externally each tick by the gameplay code.
export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly eventQueue: RAPIER.EventQueue;

  constructor(fixedDt: number) {
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.world.timestep = fixedDt;
    this.eventQueue = new RAPIER.EventQueue(true);
  }

  step(): void {
    this.world.step(this.eventQueue);
  }
}

export { RAPIER };
