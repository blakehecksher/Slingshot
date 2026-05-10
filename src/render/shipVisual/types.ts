import * as THREE from 'three';
import type { AttachmentName } from './manifestTypes';

export type ThrusterKey =
  | 'main'
  | 'reverse'
  | 'strafeLeft'
  | 'strafeRight'
  | 'strafeUp'
  | 'strafeDown';

export type ThrusterSet = Record<ThrusterKey, THREE.Mesh[]>;

export interface BuiltShip {
  root: THREE.Object3D;
  attachments: Record<AttachmentName, THREE.Object3D>;
  thrusters: ThrusterSet;
}

export function emptyThrusterSet(): ThrusterSet {
  return {
    main: [],
    reverse: [],
    strafeLeft: [],
    strafeRight: [],
    strafeUp: [],
    strafeDown: [],
  };
}
