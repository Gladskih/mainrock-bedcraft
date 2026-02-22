import { createRequire } from "node:module";

type PrismarineRuntimeBlock = { stateId: number };
type PrismarineRegistryLike = { blocksByRuntimeId?: Record<string, PrismarineRuntimeBlock | undefined> };
type BedrockSubChunk118Like = {
  prototype: {
    loadPalettedBlocks: (
      storageLayer: number,
      stream: { readVarInt: () => number },
      bitsPerBlock: number,
      format: number
    ) => void;
    addToPalette: (storageLayer: number, stateId: number) => void;
    blocks: unknown[];
    palette: unknown[][];
    registry: PrismarineRegistryLike;
  };
};

const STORAGE_BITS_SINGLE_VALUE = 0;
const SINGLE_VALUE_RUNTIME_ID_SHIFT_BITS = 1;
const require = createRequire(import.meta.url);
const loadBedrockSubChunk118 = require("prismarine-chunk/src/bedrock/1.18/SubChunk") as BedrockSubChunk118Like;
const loadBedrockPalettedStorage = require("prismarine-chunk/src/bedrock/common/PalettedStorage") as new (bitsPerBlock: number) => unknown;
const loadBedrockConstants = require("prismarine-chunk/src/bedrock/common/constants") as { StorageType: { Runtime: number } };
let runtimePaletteSingletonPatchApplied = false;

const toSignedInt32 = (value: number): number => value | 0;
const toUnsignedInt32 = (value: number): number => value >>> 0;

const readRuntimeBlock = (registry: PrismarineRegistryLike, runtimeId: number): PrismarineRuntimeBlock | null => {
  if (!registry.blocksByRuntimeId) return null;
  const directMatch = registry.blocksByRuntimeId[runtimeId];
  if (directMatch) return directMatch;
  const signedMatch = registry.blocksByRuntimeId[toSignedInt32(runtimeId)];
  if (signedMatch) return signedMatch;
  const unsignedMatch = registry.blocksByRuntimeId[toUnsignedInt32(runtimeId)];
  if (unsignedMatch) return unsignedMatch;
  return null;
};

const toRuntimeIdCandidates = (packedRuntimeId: number): number[] => {
  const shiftedSigned = packedRuntimeId >> SINGLE_VALUE_RUNTIME_ID_SHIFT_BITS;
  const shiftedUnsigned = packedRuntimeId >>> SINGLE_VALUE_RUNTIME_ID_SHIFT_BITS;
  const zigZagDecoded = shiftedUnsigned ^ -(packedRuntimeId & 1);
  return [
    shiftedSigned,
    shiftedUnsigned,
    zigZagDecoded,
    toSignedInt32(zigZagDecoded),
    toUnsignedInt32(zigZagDecoded),
    packedRuntimeId,
    toSignedInt32(packedRuntimeId),
    toUnsignedInt32(packedRuntimeId)
  ];
};

const resolveRuntimeStateId = (registry: PrismarineRegistryLike, packedRuntimeId: number): number => {
  for (const runtimeId of toRuntimeIdCandidates(packedRuntimeId)) {
    const runtimeBlock = readRuntimeBlock(registry, runtimeId);
    if (runtimeBlock && Number.isFinite(runtimeBlock.stateId)) return runtimeBlock.stateId;
  }
  throw new Error(`Unknown runtime ID in singleton runtime palette: ${packedRuntimeId}`);
};

export const ensureRuntimePaletteSingletonDecodePatched = (): void => {
  if (runtimePaletteSingletonPatchApplied) return;
  const SubChunk118 = loadBedrockSubChunk118;
  const runtimeStorageType = loadBedrockConstants.StorageType.Runtime;
  const PalettedStorage = loadBedrockPalettedStorage;
  const originalLoadPalettedBlocks = SubChunk118.prototype.loadPalettedBlocks;
  SubChunk118.prototype.loadPalettedBlocks = function patchedLoadPalettedBlocks(
    storageLayer,
    stream,
    bitsPerBlock,
    format
  ) {
    if (format !== runtimeStorageType || bitsPerBlock !== STORAGE_BITS_SINGLE_VALUE) {
      originalLoadPalettedBlocks.call(this, storageLayer, stream, bitsPerBlock, format);
      return;
    }
    this.palette[storageLayer] = [];
    this.blocks[storageLayer] = new PalettedStorage(1);
    this.addToPalette(storageLayer, resolveRuntimeStateId(this.registry, stream.readVarInt()));
  };
  runtimePaletteSingletonPatchApplied = true;
};
