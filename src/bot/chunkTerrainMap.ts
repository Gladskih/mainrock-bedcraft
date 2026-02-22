import { createRequire } from "node:module";
import type { Logger } from "pino";
import { DEFAULT_NAVIGATION_CHUNK_CACHE_LIMIT } from "../constants.js";
import { toChunkKey, type LevelChunkPacket, type SubChunkPacket } from "../bedrock/joinClientHelpers.js";
import { ensureRuntimePaletteSingletonDecodePatched } from "./runtimePaletteSingletonPatch.js";
type TerrainBlock = { name: string; boundingBox: string | null };
type PrismarineStartGameConfig = { itemstates: unknown[]; block_network_ids_are_hashes: boolean };
type PrismarineRegistryLike = {
  handleStartGame: (packet: PrismarineStartGameConfig) => void; version?: { type?: string; majorVersion?: string };
};
type ChunkColumnInstance = {
  networkDecodeNoCache: (buffer: Buffer, sectionCount: number) => Promise<void>;
  networkDecodeSubChunkNoCache?: (sectionY: number, buffer: Buffer) => Promise<void>;
  getBlock: (position: { x: number; y: number; z: number; l?: number }, full?: boolean) => unknown;
};
type ChunkColumnConstructor = new (options: { x: number; z: number; chunkVersion?: number }) => ChunkColumnInstance;
type DecodedChunkColumn = {
  chunkX: number;
  chunkZ: number;
  chunk: ChunkColumnInstance;
  loadedSections: Set<number>;
};
type ChunkColumnDecoder = {
  decodeLevelChunk: (column: DecodedChunkColumn, packet: LevelChunkPacket) => Promise<void>;
  decodeSubChunk: (column: DecodedChunkColumn, sectionY: number, payload: Buffer) => Promise<void>;
};
export type ChunkTerrainMap = {
  configureRuntimeIdMode: (useHashedRuntimeIds: boolean) => void;
  observeLevelChunk: (packet: LevelChunkPacket) => void;
  observeSubChunk: (packet: SubChunkPacket) => void;
  isStandable: (x: number, y: number, z: number) => boolean | null;
  getLoadedChunkCount: () => number;
};
type ChunkTerrainMapOptions = {
  logger?: Logger;
  decoder?: ChunkColumnDecoder;
  maxChunks?: number;
  registry?: PrismarineRegistryLike;
  registryVersion?: string;
};
type ParsedSubChunkEntry = { chunkX: number; sectionY: number; chunkZ: number; result: "success" | "success_all_air"; payload: Buffer | null };
const CHUNK_SIZE_BLOCKS = 16;
const BEDROCK_CHUNK_DECODER_REGISTRY_VERSION = "bedrock_1.21.0";
const NAVIGATION_WARNING_LOG_INTERVAL_MS = 5000;
const MAX_SUPPORTED_SUBCHUNK_COUNT = 32;
const require = createRequire(import.meta.url);
const loadPrismarineRegistry = require("prismarine-registry") as (version: string) => PrismarineRegistryLike;
const loadPrismarineChunk = require("prismarine-chunk") as (registryOrVersion: string | PrismarineRegistryLike) => unknown;
const HAZARDOUS_BLOCK_PATTERNS = [
  "lava",
  "fire",
  "magma",
  "cactus",
  "berry_bush",
  "powder_snow",
  "sweet_berry_bush"
] as const;
const EXTRA_PASSABLE_BLOCK_PATTERNS = [
  "air",
  "water",
  "short_grass",
  "tall_grass",
  "seagrass",
  "fern",
  "flower",
  "sapling",
  "torch",
  "button",
  "lever",
  "rail",
  "vine",
  "lily_pad",
  "carpet",
  "snow_layer"
] as const;
const resolveChunkCoordinate = (value: number): number => Math.floor(value / CHUNK_SIZE_BLOCKS);
const resolveLocalCoordinate = (world: number, chunk: number): number => world - chunk * CHUNK_SIZE_BLOCKS;
const resolveSectionCoordinate = (worldY: number): number => Math.floor(worldY / CHUNK_SIZE_BLOCKS);
const isHazardousBlock = (block: TerrainBlock): boolean => {
  const normalizedName = block.name.toLowerCase();
  return HAZARDOUS_BLOCK_PATTERNS.some((pattern) => normalizedName.includes(pattern));
};
const isPassableBlock = (block: TerrainBlock): boolean => {
  if (block.boundingBox === "empty") return true;
  const normalizedName = block.name.toLowerCase();
  return EXTRA_PASSABLE_BLOCK_PATTERNS.some((pattern) => normalizedName.includes(pattern));
};
const toIntegerLikeNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
const toByteArrayPayloadBuffer = (value: unknown): Buffer | null => {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Array.isArray(value) && value.every((entry) => typeof entry === "number")) return Buffer.from(value);
  if (!value || typeof value !== "object") return null;
  if ("data" in value && Array.isArray(value.data) && value.data.every((entry) => typeof entry === "number")) {
    return Buffer.from(value.data);
  }
  if ("buffer" in value && value.buffer instanceof Uint8Array) return Buffer.from(value.buffer);
  return null;
};
const toTerrainBlock = (block: unknown): TerrainBlock | null => {
  if (!block || typeof block !== "object") return null;
  const name = "name" in block && typeof block.name === "string" ? block.name : null;
  const boundingBox = "boundingBox" in block && typeof block.boundingBox === "string" ? block.boundingBox : null;
  if (!name) return null;
  return { name, boundingBox };
};
const createEmptyDecodedChunkColumn = (
  ChunkColumn: ChunkColumnConstructor,
  chunkX: number,
  chunkZ: number
): DecodedChunkColumn => {
  return {
    chunkX,
    chunkZ,
    chunk: new ChunkColumn({ x: chunkX, z: chunkZ, chunkVersion: 40 }),
    loadedSections: new Set<number>()
  };
};
const createDefaultChunkColumnDecoder = (): ChunkColumnDecoder => ({
  decodeLevelChunk: async (column, packet) => {
    if (packet.cache_enabled === true) throw new Error("Navigation decoder does not support cached level_chunk payloads");
    const subChunkCount = toIntegerLikeNumber(packet.sub_chunk_count);
    if (subChunkCount === null) return;
    const payload = toByteArrayPayloadBuffer(packet.payload);
    if (!payload) return;
    await column.chunk.networkDecodeNoCache(payload, subChunkCount);
    if (subChunkCount > 0 && subChunkCount <= MAX_SUPPORTED_SUBCHUNK_COUNT) {
      for (let sectionY = 0; sectionY < subChunkCount; sectionY += 1) {
        column.loadedSections.add(sectionY);
      }
    }
  },
  decodeSubChunk: async (column, sectionY, payload) => {
    if (!column.chunk.networkDecodeSubChunkNoCache) throw new Error("Navigation decoder does not support subchunk decoding");
    await column.chunk.networkDecodeSubChunkNoCache(sectionY, payload);
    column.loadedSections.add(sectionY);
  }
});
const toParsedSubChunkEntries = (packet: SubChunkPacket): ParsedSubChunkEntry[] => {
  if (!packet.origin || !packet.entries || !Array.isArray(packet.entries)) return [];
  const originX = toIntegerLikeNumber(packet.origin.x);
  const originY = toIntegerLikeNumber(packet.origin.y);
  const originZ = toIntegerLikeNumber(packet.origin.z);
  if (originX === null || originY === null || originZ === null) return [];
  const parsedEntries: ParsedSubChunkEntry[] = [];
  for (const entry of packet.entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const deltaX = toIntegerLikeNumber(record["dx"]);
    const deltaY = toIntegerLikeNumber(record["dy"]);
    const deltaZ = toIntegerLikeNumber(record["dz"]);
    if (deltaX === null || deltaY === null || deltaZ === null) continue;
    const result = record["result"];
    if (result !== "success" && result !== "success_all_air") continue;
    parsedEntries.push({
      chunkX: originX + deltaX,
      sectionY: originY + deltaY,
      chunkZ: originZ + deltaZ,
      result,
      payload: result === "success" ? toByteArrayPayloadBuffer(record["payload"]) : null
    });
  }
  return parsedEntries;
};
const toRegistryVersionSpecifier = (version: string): string => version.startsWith("bedrock_") ? version : `bedrock_${version}`;
export const createChunkTerrainMap = (options: ChunkTerrainMapOptions = {}): ChunkTerrainMap => {
  const registryVersion = toRegistryVersionSpecifier(options.registryVersion ?? BEDROCK_CHUNK_DECODER_REGISTRY_VERSION);
  const registry = options.registry ?? loadPrismarineRegistry(registryVersion);
  const registryMajorVersion = typeof registry.version?.majorVersion === "string" ? Number.parseFloat(registry.version.majorVersion) : Number.NaN;
  if (registry.version?.type === "bedrock" && registryMajorVersion > 1.21) registry.version.majorVersion = "1.21";
  const ChunkColumn = loadPrismarineChunk(registry) as unknown as ChunkColumnConstructor;
  const decoder = options.decoder ?? createDefaultChunkColumnDecoder();
  const requiresRuntimeIdModeConfiguration = options.decoder === undefined;
  const maxChunks = options.maxChunks ?? DEFAULT_NAVIGATION_CHUNK_CACHE_LIMIT;
  const chunksByKey = new Map<string, DecodedChunkColumn>();
  const loadedChunkKeys = new Set<string>();
  const chunkInsertionOrder: string[] = [];
  let decodeQueue = Promise.resolve(), lastWarningAtMs = 0;
  let runtimeIdMode: "legacy" | "hashed" | null = null;
  const configureRuntimeIdMode = (useHashedRuntimeIds: boolean): void => {
    const nextMode = useHashedRuntimeIds ? "hashed" : "legacy";
    if (runtimeIdMode === nextMode) return;
    if (runtimeIdMode !== null && (chunksByKey.size > 0 || loadedChunkKeys.size > 0)) throw new Error("Navigation runtime ID mode cannot be changed after chunk decoding starts");
    if (useHashedRuntimeIds) ensureRuntimePaletteSingletonDecodePatched();
    registry.handleStartGame({ itemstates: [], block_network_ids_are_hashes: useHashedRuntimeIds });
    runtimeIdMode = nextMode;
  };
  const assertRuntimeIdModeReady = (): void => {
    if (!requiresRuntimeIdModeConfiguration || runtimeIdMode !== null) return;
    throw new Error("Navigation runtime ID mode is not configured");
  };
  const getOrCreateChunk = (chunkX: number, chunkZ: number): DecodedChunkColumn => {
    const key = toChunkKey(chunkX, chunkZ);
    const existingChunk = chunksByKey.get(key);
    if (existingChunk) return existingChunk;
    const createdChunk = createEmptyDecodedChunkColumn(ChunkColumn, chunkX, chunkZ);
    chunksByKey.set(key, createdChunk);
    chunkInsertionOrder.push(key);
    return createdChunk;
  };
  const noteChunkReady = (column: DecodedChunkColumn): void => {
    if (column.loadedSections.size === 0) return;
    loadedChunkKeys.add(toChunkKey(column.chunkX, column.chunkZ));
  };
  const evictChunksIfNeeded = (): void => {
    while (chunkInsertionOrder.length > maxChunks) {
      const droppedKey = chunkInsertionOrder.shift();
      if (!droppedKey) break;
      chunksByKey.delete(droppedKey);
      loadedChunkKeys.delete(droppedKey);
    }
  };
  const queueDecodeTask = (stage: "level_chunk" | "subchunk", task: () => Promise<void>): void => {
    decodeQueue = decodeQueue.then(task).catch((error: unknown) => {
      const nowMs = Date.now();
      if (nowMs - lastWarningAtMs < NAVIGATION_WARNING_LOG_INTERVAL_MS) return;
      lastWarningAtMs = nowMs;
      options.logger?.warn?.(
        {
          event: "navigation_chunk_decode_failed",
          stage,
          error: error instanceof Error ? error.message : String(error)
        },
        "Failed to decode world terrain packet for navigation"
      );
    });
  };
  const getBlock = (worldX: number, worldY: number, worldZ: number): TerrainBlock | null => {
    const chunkX = resolveChunkCoordinate(worldX);
    const chunkZ = resolveChunkCoordinate(worldZ);
    const chunk = chunksByKey.get(toChunkKey(chunkX, chunkZ));
    if (!chunk) return null;
    const localX = resolveLocalCoordinate(worldX, chunkX);
    const localZ = resolveLocalCoordinate(worldZ, chunkZ);
    return toTerrainBlock(chunk.chunk.getBlock({ x: localX, y: worldY, z: localZ, l: 0 }, false));
  };
  const isSectionLoaded = (worldX: number, worldY: number, worldZ: number): boolean => {
    const chunkX = resolveChunkCoordinate(worldX);
    const chunkZ = resolveChunkCoordinate(worldZ);
    const chunk = chunksByKey.get(toChunkKey(chunkX, chunkZ));
    if (!chunk) return false;
    return chunk.loadedSections.has(resolveSectionCoordinate(worldY));
  };
  return {
    configureRuntimeIdMode,
    observeLevelChunk: (packet) => {
      const chunkX = toIntegerLikeNumber(packet.x);
      const chunkZ = toIntegerLikeNumber(packet.z);
      if (chunkX === null || chunkZ === null) return;
      queueDecodeTask("level_chunk", async () => {
        assertRuntimeIdModeReady();
        const chunk = getOrCreateChunk(chunkX, chunkZ);
        await decoder.decodeLevelChunk(chunk, packet);
        noteChunkReady(chunk);
        evictChunksIfNeeded();
      });
    },
    observeSubChunk: (packet) => {
      queueDecodeTask("subchunk", async () => {
        assertRuntimeIdModeReady();
        for (const entry of toParsedSubChunkEntries(packet)) {
          const chunk = getOrCreateChunk(entry.chunkX, entry.chunkZ);
          if (entry.result === "success_all_air") {
            chunk.loadedSections.add(entry.sectionY);
            noteChunkReady(chunk);
            continue;
          }
          if (!entry.payload) continue;
          await decoder.decodeSubChunk(chunk, entry.sectionY, entry.payload);
          noteChunkReady(chunk);
        }
        evictChunksIfNeeded();
      });
    },
    isStandable: (x, y, z) => {
      if (!isSectionLoaded(x, y, z)) return null;
      if (!isSectionLoaded(x, y + 1, z)) return null;
      if (!isSectionLoaded(x, y - 1, z)) return null;
      const feetBlock = getBlock(x, y, z);
      const headBlock = getBlock(x, y + 1, z);
      const floorBlock = getBlock(x, y - 1, z);
      if (!feetBlock || !headBlock || !floorBlock) return null;
      if (isHazardousBlock(feetBlock) || isHazardousBlock(headBlock) || isHazardousBlock(floorBlock)) return false;
      if (!isPassableBlock(feetBlock) || !isPassableBlock(headBlock)) return false;
      if (floorBlock.boundingBox === "empty") return false;
      return true;
    },
    getLoadedChunkCount: () => loadedChunkKeys.size
  };
};
