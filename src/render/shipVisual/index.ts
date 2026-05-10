export { resolveShipVisual, type ResolveOptions } from './resolver';
export { assembleKitShip, assemblePartList } from './kitAssembler';
export { listParts, listPartsForSlot, getPart, defaultManifestParts } from './builtinParts';
export type { BuiltinPartDef, PartStatDelta } from './builtinParts';
export {
  buildShipVariant,
  SHIP_VARIANTS,
  SHIP_VISUALS,
  defaultMount,
  type ShipVariantId,
} from './primitives';
export type { BuiltShip, ThrusterKey, ThrusterSet } from './types';
export type {
  ShipManifest,
  ShipPart,
  AttachmentName,
  PartSlot,
} from './manifestTypes';
export { ATTACHMENT_NAMES, PART_SLOTS } from './manifestTypes';
