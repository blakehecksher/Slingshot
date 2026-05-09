import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/world';
import { COL_BASE, COL_SHIP, ContactRegistry, interactionGroups } from './collision';

export const BASE_TUNING = {
  TRIGGER_RADIUS: 80,
  // Visual structure scale.
  CORE_SIZE: 24,
};

export interface BaseHandles {
  readonly position: THREE.Vector3;
  readonly group: THREE.Group;
  readonly colliderHandle: number;
}

const PALETTE = {
  hull: 0xe2cfa3,
  accent: 0xd06424,
  panel: 0x6b3a1c,
  beacon: 0xff7a3a,
  glass: 0x2c5d63,
};

export function createBase(
  scene: THREE.Scene,
  physics: PhysicsWorld,
  registry: ContactRegistry,
  position: THREE.Vector3,
): BaseHandles {
  const group = new THREE.Group();
  group.position.copy(position);
  scene.add(group);

  const hullMat = new THREE.MeshStandardMaterial({ color: PALETTE.hull, roughness: 0.52, metalness: 0.34 });
  const accentMat = new THREE.MeshStandardMaterial({
    color: PALETTE.accent,
    roughness: 0.42,
    metalness: 0.45,
    emissive: 0x3a1206,
    emissiveIntensity: 0.12,
  });
  const panelMat = new THREE.MeshStandardMaterial({ color: PALETTE.panel, roughness: 0.7, metalness: 0.2 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: PALETTE.glass, roughness: 0.1, metalness: 0.55, emissive: 0x0b7184, emissiveIntensity: 1.1,
  });
  const beaconMat = new THREE.MeshBasicMaterial({
    color: PALETTE.beacon,
    toneMapped: false,
  });

  // Central core: cluster of staggered boxes.
  const core = new THREE.Mesh(new THREE.BoxGeometry(BASE_TUNING.CORE_SIZE, BASE_TUNING.CORE_SIZE * 0.7, BASE_TUNING.CORE_SIZE), hullMat);
  group.add(core);

  const upper = new THREE.Mesh(new THREE.BoxGeometry(BASE_TUNING.CORE_SIZE * 0.7, BASE_TUNING.CORE_SIZE * 0.4, BASE_TUNING.CORE_SIZE * 0.7), accentMat);
  upper.position.y = BASE_TUNING.CORE_SIZE * 0.55;
  group.add(upper);

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, BASE_TUNING.CORE_SIZE * 0.9, 8), panelMat);
  tower.position.y = BASE_TUNING.CORE_SIZE * 1.0;
  group.add(tower);

  const beaconBall = new THREE.Mesh(new THREE.SphereGeometry(2.0, 12, 8), beaconMat);
  beaconBall.position.y = BASE_TUNING.CORE_SIZE * 1.5;
  group.add(beaconBall);

  const beaconLight = new THREE.PointLight(PALETTE.beacon, 35, BASE_TUNING.TRIGGER_RADIUS * 2.2, 1.7);
  beaconLight.position.copy(beaconBall.position);
  group.add(beaconLight);

  const dockLight = new THREE.PointLight(0x6dd6c8, 12, BASE_TUNING.TRIGGER_RADIUS * 1.4, 2.0);
  dockLight.position.set(0, BASE_TUNING.CORE_SIZE * 0.2, 0);
  group.add(dockLight);

  // Docking ring (visual only, hint for "land here").
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(BASE_TUNING.TRIGGER_RADIUS * 0.62, 0.6, 8, 48),
    accentMat,
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  // Side panels with glass strips so the base reads as a station, not a cube.
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(BASE_TUNING.CORE_SIZE * 0.6, BASE_TUNING.CORE_SIZE * 0.3, BASE_TUNING.CORE_SIZE * 1.1), hullMat);
    wing.position.x = side * BASE_TUNING.CORE_SIZE * 0.7;
    group.add(wing);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(BASE_TUNING.CORE_SIZE * 0.61, BASE_TUNING.CORE_SIZE * 0.06, BASE_TUNING.CORE_SIZE * 0.9), glassMat);
    glass.position.set(side * BASE_TUNING.CORE_SIZE * 0.7, 0, 0);
    group.add(glass);
  }

  // Trigger sensor — kinematic-position body just to host the collider.
  const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(position.x, position.y, position.z);
  const body = physics.world.createRigidBody(bodyDesc);
  const colliderDesc = RAPIER.ColliderDesc.ball(BASE_TUNING.TRIGGER_RADIUS)
    .setSensor(true)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
    .setCollisionGroups(interactionGroups(COL_BASE, COL_SHIP));
  const collider = physics.world.createCollider(colliderDesc, body);
  registry.register(collider.handle, { type: 'base' });

  return { position: position.clone(), group, colliderHandle: collider.handle };
}
