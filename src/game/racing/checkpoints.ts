import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../../physics/world';
import { COL_CHECKPOINT, COL_SHIP, ContactRegistry, interactionGroups } from '../collision';
import type { RaceCourse, RaceGate } from './courses';

interface GateHandle {
  readonly body: RAPIER.RigidBody;
  readonly colliderHandle: number;
  readonly group: THREE.Group;
  readonly ring: THREE.Mesh;
  readonly core: THREE.Mesh;
  readonly light: THREE.PointLight;
}

const ACTIVE_MAT = new THREE.MeshBasicMaterial({
  color: 0x5dff9a,
  transparent: true,
  opacity: 0.92,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});

const WAITING_MAT = new THREE.MeshBasicMaterial({
  color: 0xffc65a,
  transparent: true,
  opacity: 0.22,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});

const PASSED_MAT = new THREE.MeshBasicMaterial({
  color: 0xc8c3b7,
  transparent: true,
  opacity: 0.12,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});

const NEXT_MAT = new THREE.MeshBasicMaterial({
  color: 0xffc65a,
  transparent: true,
  opacity: 0.48,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});

const tmpQuat = new THREE.Quaternion();
const defaultNormal = new THREE.Vector3(0, 0, 1);

export class CheckpointSystem {
  private scene: THREE.Scene;
  private physics: PhysicsWorld;
  private registry: ContactRegistry;
  private handles: GateHandle[] = [];
  private spin = 0;

  constructor(scene: THREE.Scene, physics: PhysicsWorld, registry: ContactRegistry) {
    this.scene = scene;
    this.physics = physics;
    this.registry = registry;
  }

  setCourse(course: RaceCourse): void {
    this.clear();
    course.gates.forEach((gate, index) => this.addGate(gate, index));
    this.updateActive(0);
  }

  clear(): void {
    for (const handle of this.handles) {
      this.registry.unregister(handle.colliderHandle);
      this.physics.world.removeRigidBody(handle.body);
      this.scene.remove(handle.group);
    }
    this.handles = [];
  }

  update(dt: number, nextCheckpoint: number): void {
    this.spin += dt;
    this.updateActive(nextCheckpoint);
    for (let i = 0; i < this.handles.length; i++) {
      const h = this.handles[i];
      h.ring.rotation.z += dt * (i === nextCheckpoint ? 0.85 : 0.22);
      h.core.rotation.z -= dt * 0.45;
      const pulse = 0.7 + Math.sin(this.spin * 4 + i) * 0.18;
      h.light.intensity = i === nextCheckpoint ? 26 * pulse : i === nextCheckpoint + 1 ? 9 * pulse : 2;
    }
  }

  targetPosition(index: number): THREE.Vector3 | null {
    const handle = this.handles[index];
    if (!handle) return null;
    return handle.group.position;
  }

  private addGate(gate: RaceGate, index: number): void {
    const group = new THREE.Group();
    group.position.copy(gate.position);
    tmpQuat.setFromUnitVectors(defaultNormal, gate.normal);
    group.quaternion.copy(tmpQuat);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(gate.radius, 2.2, 8, 72), WAITING_MAT);
    group.add(ring);

    const core = new THREE.Mesh(
      new THREE.TorusGeometry(gate.radius * 0.68, 0.75, 6, 48),
      WAITING_MAT,
    );
    core.rotation.z = Math.PI / 6;
    group.add(core);

    const light = new THREE.PointLight(0x5dff9a, 12, gate.radius * 3.2, 1.8);
    group.add(light);

    this.scene.add(group);

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(gate.position.x, gate.position.y, gate.position.z);
    const body = this.physics.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.ball(gate.radius)
      .setSensor(true)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      .setCollisionGroups(interactionGroups(COL_CHECKPOINT, COL_SHIP));
    const collider = this.physics.world.createCollider(colliderDesc, body);
    this.registry.register(collider.handle, { type: 'checkpoint', index });

    this.handles.push({ body, colliderHandle: collider.handle, group, ring, core, light });
  }

  private updateActive(nextCheckpoint: number): void {
    for (let i = 0; i < this.handles.length; i++) {
      const handle = this.handles[i];
      const mat = i < nextCheckpoint
        ? PASSED_MAT
        : i === nextCheckpoint
          ? ACTIVE_MAT
          : i === nextCheckpoint + 1
            ? NEXT_MAT
            : WAITING_MAT;
      handle.ring.material = mat;
      handle.core.material = mat;
      handle.light.color.set(
        i < nextCheckpoint
          ? 0xc8c3b7
          : i === nextCheckpoint
            ? 0x5dff9a
            : i === nextCheckpoint + 1
              ? 0xffc65a
              : 0xffc65a,
      );
      handle.group.visible = i >= nextCheckpoint - 1;
    }
  }
}
