import assert from "node:assert/strict";
import { test } from "node:test";
import type { Logger } from "pino";
import { createChunkTerrainMap } from "../../src/bot/chunkTerrainMap.js";
import type { LevelChunkPacket } from "../../src/bedrock/joinClientHelpers.js";
type TestBlock = { name: string; boundingBox: string | null };
const createDecoder = (blocksByKey: Map<string, TestBlock>) => ({
  decodeLevelChunk: async (column: {
    chunkX: number;
    loadedSections: Set<number>;
    chunk: {
      getBlock: (position: { x: number; y: number; z: number; l?: number }, full?: boolean) => unknown;
    };
  }, _packet: LevelChunkPacket) => {
    column.loadedSections.add(4);
    column.chunk.getBlock = (position) => {
      const worldX = column.chunkX * 16 + position.x;
      const key = `${worldX}:${position.y}:${position.z}`;
      const block = blocksByKey.get(key);
      return block ?? { name: "minecraft:air", boundingBox: "empty" };
    };
  },
  decodeSubChunk: async () => undefined
});
void test("createChunkTerrainMap resolves standable cells from decoded chunk blocks", async () => {
  const blocksByKey = new Map<string, TestBlock>([
    ["1:64:1", { name: "minecraft:stone", boundingBox: "block" }],
    ["1:65:1", { name: "minecraft:air", boundingBox: "empty" }],
    ["1:66:1", { name: "minecraft:air", boundingBox: "empty" }]
  ]);
  const terrainMap = createChunkTerrainMap({ decoder: createDecoder(blocksByKey) });
  terrainMap.observeLevelChunk({ x: 0, z: 0 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(terrainMap.isStandable(1, 65, 1), true);
  assert.equal(terrainMap.getLoadedChunkCount(), 1);
});
void test("createChunkTerrainMap rejects hazardous floor blocks", async () => {
  const blocksByKey = new Map<string, TestBlock>([
    ["1:64:1", { name: "minecraft:lava", boundingBox: "empty" }],
    ["1:65:1", { name: "minecraft:air", boundingBox: "empty" }],
    ["1:66:1", { name: "minecraft:air", boundingBox: "empty" }]
  ]);
  const terrainMap = createChunkTerrainMap({ decoder: createDecoder(blocksByKey) });
  terrainMap.observeLevelChunk({ x: 0, z: 0 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(terrainMap.isStandable(1, 65, 1), false);
});
void test("createChunkTerrainMap returns null for unknown chunks", () => {
  const terrainMap = createChunkTerrainMap({
    decoder: {
      decodeLevelChunk: async () => undefined,
      decodeSubChunk: async () => undefined
    }
  });
  assert.equal(terrainMap.isStandable(33, 65, 33), null);
});
void test("createChunkTerrainMap logs decode failures once per interval", async () => {
  const warnings: Array<{ event?: string }> = [];
  const logger = { warn: (payload: { event?: string }) => warnings.push(payload) } as unknown as Logger;
  const terrainMap = createChunkTerrainMap({
    logger,
    decoder: {
      decodeLevelChunk: async () => {
        throw new Error("decode-failed");
      },
      decodeSubChunk: async () => undefined
    }
  });
  terrainMap.observeLevelChunk({ x: 0, z: 0 });
  terrainMap.observeLevelChunk({ x: 0, z: 1 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.event, "navigation_chunk_decode_failed");
});
void test("createChunkTerrainMap loads chunk from subchunk packets", async () => {
  const terrainMap = createChunkTerrainMap({
    decoder: {
      decodeLevelChunk: async () => undefined,
      decodeSubChunk: async (column: { loadedSections: Set<number> }, sectionY: number) => {
        column.loadedSections.add(sectionY);
      }
    }
  });
  terrainMap.observeSubChunk({
    origin: { x: 0, y: 4, z: 0 },
    entries: [{ dx: 0, dy: 0, dz: 0, result: "success_all_air" }]
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(terrainMap.getLoadedChunkCount(), 1);
});
void test("createChunkTerrainMap parses subchunk string coordinates and object payload", async () => {
  let decodeCalls = 0;
  const terrainMap = createChunkTerrainMap({
    decoder: {
      decodeLevelChunk: async () => undefined,
      decodeSubChunk: async (column: { loadedSections: Set<number> }, sectionY: number, payload: Buffer) => {
        decodeCalls += 1;
        column.loadedSections.add(sectionY);
        assert.equal(Buffer.isBuffer(payload), true);
      }
    }
  });
  terrainMap.observeSubChunk({
    origin: { x: "0" as unknown as number, y: "4" as unknown as number, z: "0" as unknown as number },
    entries: [
      {
        dx: "0",
        dy: "0",
        dz: "0",
        result: "success",
        payload: { data: [1, 2, 3] }
      }
    ]
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(decodeCalls, 1);
  assert.equal(terrainMap.getLoadedChunkCount(), 1);
});
void test("createChunkTerrainMap ignores malformed subchunk entries", async () => {
  let decodeCalls = 0;
  const terrainMap = createChunkTerrainMap({
    decoder: {
      decodeLevelChunk: async () => undefined,
      decodeSubChunk: async () => {
        decodeCalls += 1;
      }
    }
  });
  terrainMap.observeSubChunk({
    origin: { x: 0, y: 4, z: 0 },
    entries: [
      null,
      { dx: "x", dy: 0, dz: 0, result: "success", payload: [1] },
      { dx: 0, dy: 0, dz: 0, result: "ignored", payload: [1] },
      { dx: 0, dy: 0, dz: 0, result: "success" }
    ]
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(decodeCalls, 0);
  assert.equal(terrainMap.getLoadedChunkCount(), 0);
});
void test("createChunkTerrainMap reports blocked feet and floor air as non-standable", async () => {
  const feetBlocked = new Map<string, TestBlock>([
    ["1:64:1", { name: "minecraft:stone", boundingBox: "block" }],
    ["1:65:1", { name: "minecraft:stone", boundingBox: "block" }],
    ["1:66:1", { name: "minecraft:air", boundingBox: "empty" }]
  ]);
  const terrainFeetBlocked = createChunkTerrainMap({ decoder: createDecoder(feetBlocked) });
  terrainFeetBlocked.observeLevelChunk({ x: 0, z: 0 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(terrainFeetBlocked.isStandable(1, 65, 1), false);
  const noFloor = new Map<string, TestBlock>([
    ["1:64:1", { name: "minecraft:air", boundingBox: "empty" }],
    ["1:65:1", { name: "minecraft:air", boundingBox: "empty" }],
    ["1:66:1", { name: "minecraft:air", boundingBox: "empty" }]
  ]);
  const terrainNoFloor = createChunkTerrainMap({ decoder: createDecoder(noFloor) });
  terrainNoFloor.observeLevelChunk({ x: 0, z: 0 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(terrainNoFloor.isStandable(1, 65, 1), false);
});
void test("createChunkTerrainMap default decoder handles unsupported cache payload", async () => {
  const warnings: Array<{ event?: string }> = [];
  const logger = { warn: (payload: { event?: string }) => warnings.push(payload) } as unknown as Logger;
  const terrainMap = createChunkTerrainMap({ logger });
  terrainMap.configureRuntimeIdMode(false);
  terrainMap.observeLevelChunk({
    x: 0,
    z: 0,
    sub_chunk_count: "1" as unknown as number,
    cache_enabled: true,
    payload: Uint8Array.from([0, 0, 0]) as unknown as Buffer
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.event, "navigation_chunk_decode_failed");
});

void test("createChunkTerrainMap requires runtime id mode before default decoder starts", async () => {
  const warnings: Array<{ event?: string; error?: string }> = [];
  const logger = { warn: (payload: { event?: string; error?: string }) => warnings.push(payload) } as unknown as Logger;
  const terrainMap = createChunkTerrainMap({ logger });
  terrainMap.observeLevelChunk({
    x: 0,
    z: 0,
    sub_chunk_count: "1" as unknown as number,
    payload: Uint8Array.from([0, 0, 0]) as unknown as Buffer
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.event, "navigation_chunk_decode_failed");
  assert.equal((warnings[0]?.error ?? "").includes("runtime ID mode is not configured"), true);
});

void test("createChunkTerrainMap rejects runtime id mode switch after chunk decode started", async () => {
  const terrainMap = createChunkTerrainMap({
    decoder: {
      decodeLevelChunk: async (column: { loadedSections: Set<number> }) => {
        column.loadedSections.add(4);
      },
      decodeSubChunk: async () => undefined
    }
  });
  terrainMap.configureRuntimeIdMode(false);
  terrainMap.observeLevelChunk({ x: 0, z: 0 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.throws(() => terrainMap.configureRuntimeIdMode(true));
});
