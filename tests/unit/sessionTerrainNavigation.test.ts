import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Logger } from "pino";
import { createSessionTerrainNavigation } from "../../src/bedrock/sessionTerrainNavigation.js";

class FakeClient extends EventEmitter {
  disconnect(): void {}
  queue(_name: string, _payload: unknown): void {}
}

type FakeChunkTerrainMap = {
  configureRuntimeIdMode: (useHashedRuntimeIds: boolean) => void;
  observeLevelChunk: (packet: unknown) => void;
  observeSubChunk: (packet: unknown) => void;
  isStandable: (x: number, y: number, z: number) => boolean | null;
  getLoadedChunkCount: () => number;
};

type FakeWaypointResolver = {
  resolveWaypoint: (
    position: { x: number; y: number; z: number },
    target: { x: number; y: number; z: number } | null
  ) => { x: number; y: number; z: number } | null;
  clear: () => void;
};

void test("createSessionTerrainNavigation forwards valid level_chunk packets", () => {
  const client = new FakeClient();
  const observedPackets: unknown[] = [];
  const observedSubChunks: unknown[] = [];
  const navigation = createSessionTerrainNavigation(
    client,
    { info: () => undefined } as unknown as Logger,
    {
      createChunkTerrainMap: () => ({
        configureRuntimeIdMode: () => undefined,
        observeLevelChunk: (packet) => observedPackets.push(packet),
        observeSubChunk: (packet) => observedSubChunks.push(packet),
        isStandable: () => true,
        getLoadedChunkCount: () => 1
      }) as FakeChunkTerrainMap,
      createNavigationWaypointResolver: () => ({
        resolveWaypoint: (_position, target) => target,
        clear: () => undefined
      }) as FakeWaypointResolver
    }
  );
  client.emit("level_chunk", { x: 0 });
  client.emit("level_chunk", { x: 0, z: 0 });
  client.emit("subchunk", { origin: { x: 0, y: 4, z: 0 }, entries: [{}] });
  assert.equal(observedPackets.length, 1);
  assert.equal(observedSubChunks.length, 1);
  navigation.cleanup();
});

void test("createSessionTerrainNavigation requests subchunks for level_chunk with count -2", () => {
  const client = new FakeClient();
  const requests: Array<{ dimension: number; origin: { x: number; y: number; z: number }; requests: unknown[] }> = [];
  const navigation = createSessionTerrainNavigation(
    client,
    { info: () => undefined } as unknown as Logger,
    {
      createChunkTerrainMap: () => ({
        configureRuntimeIdMode: () => undefined,
        observeLevelChunk: () => undefined,
        observeSubChunk: () => undefined,
        isStandable: () => true,
        getLoadedChunkCount: () => 1
      }) as FakeChunkTerrainMap,
      createNavigationWaypointResolver: () => ({
        resolveWaypoint: (_position, target) => target,
        clear: () => undefined
      }) as FakeWaypointResolver,
      queueSubChunkRequest: (request) => {
        requests.push(
          request as { dimension: number; origin: { x: number; y: number; z: number }; requests: unknown[] }
        );
      }
    }
  );
  client.emit("level_chunk", {
    x: 7,
    z: 9,
    dimension: 0,
    sub_chunk_count: -2,
    highest_subchunk_count: 24
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.origin.x, 7);
  assert.equal(requests[0]?.origin.z, 9);
  assert.equal(requests[0]?.requests.length, 24);
  navigation.cleanup();
});

void test("createSessionTerrainNavigation enforces subchunk request column limit", () => {
  const client = new FakeClient();
  const requests: unknown[] = [];
  const navigation = createSessionTerrainNavigation(
    client,
    { info: () => undefined } as unknown as Logger,
    {
      subChunkRequestColumnLimit: 1,
      createChunkTerrainMap: () => ({
        configureRuntimeIdMode: () => undefined,
        observeLevelChunk: () => undefined,
        observeSubChunk: () => undefined,
        isStandable: () => true,
        getLoadedChunkCount: () => 1
      }) as FakeChunkTerrainMap,
      createNavigationWaypointResolver: () => ({
        resolveWaypoint: (_position, target) => target,
        clear: () => undefined
      }) as FakeWaypointResolver,
      queueSubChunkRequest: (request) => {
        requests.push(request);
      }
    }
  );
  client.emit("level_chunk", { x: 0, z: 0, sub_chunk_count: -2, highest_subchunk_count: 24 });
  client.emit("level_chunk", { x: 1, z: 0, sub_chunk_count: -2, highest_subchunk_count: 24 });
  assert.equal(requests.length, 1);
  navigation.cleanup();
});

void test("createSessionTerrainNavigation uses default subchunk request queue and parses string fields", () => {
  const client = new FakeClient();
  const queuedRequests: Array<{ name: string; payload: unknown }> = [];
  client.queue = (name: string, payload: unknown) => {
    queuedRequests.push({ name, payload });
  };
  const infoEvents: Array<{ payloadType?: string }> = [];
  const navigation = createSessionTerrainNavigation(
    client,
    { info: (payload: { payloadType?: string }) => infoEvents.push(payload) } as unknown as Logger,
    {
      createChunkTerrainMap: () => ({
        configureRuntimeIdMode: () => undefined,
        observeLevelChunk: () => undefined,
        observeSubChunk: () => undefined,
        isStandable: () => true,
        getLoadedChunkCount: () => 1
      }) as FakeChunkTerrainMap,
      createNavigationWaypointResolver: () => ({
        resolveWaypoint: (_position, target) => target,
        clear: () => undefined
      }) as FakeWaypointResolver
    }
  );
  client.emit("level_chunk", {
    x: "7",
    z: "9",
    dimension: 0n,
    sub_chunk_count: -2,
    highest_subchunk_count: "24",
    payload: Buffer.from([0x00])
  });
  assert.equal(queuedRequests.length, 1);
  assert.equal(queuedRequests[0]?.name, "subchunk_request");
  assert.equal(infoEvents.some((event) => event.payloadType === "buffer"), true);
  navigation.cleanup();
});

void test("createSessionTerrainNavigation logs uint8array payload shape", () => {
  const client = new FakeClient();
  const infoEvents: Array<{ payloadType?: string }> = [];
  const navigation = createSessionTerrainNavigation(
    client,
    { info: (payload: { payloadType?: string }) => infoEvents.push(payload) } as unknown as Logger,
    {
      createChunkTerrainMap: () => ({
        configureRuntimeIdMode: () => undefined,
        observeLevelChunk: () => undefined,
        observeSubChunk: () => undefined,
        isStandable: () => true,
        getLoadedChunkCount: () => 1
      }) as FakeChunkTerrainMap,
      createNavigationWaypointResolver: () => ({
        resolveWaypoint: (_position, target) => target,
        clear: () => undefined
      }) as FakeWaypointResolver
    }
  );
  client.emit("level_chunk", { x: 0, z: 0, payload: Uint8Array.from([0x00]) });
  assert.equal(infoEvents.some((event) => event.payloadType === "uint8array"), true);
  navigation.cleanup();
});

void test("createSessionTerrainNavigation delegates waypoint resolution when chunks are ready", () => {
  const client = new FakeClient();
  let resolverCalls = 0;
  const navigation = createSessionTerrainNavigation(
    client,
    { info: () => undefined } as unknown as Logger,
    {
      createChunkTerrainMap: () => ({
        configureRuntimeIdMode: () => undefined,
        observeLevelChunk: () => undefined,
        observeSubChunk: () => undefined,
        isStandable: (_x: number, _y: number, _z: number) => true,
        getLoadedChunkCount: () => 2
      }) as FakeChunkTerrainMap,
      createNavigationWaypointResolver: () => ({
        resolveWaypoint: (_position, target) => {
          resolverCalls += 1;
          return target;
        },
        clear: () => undefined
      }) as FakeWaypointResolver
    }
  );
  const waypoint = navigation.resolveWaypoint({ x: 0, y: 70, z: 0 }, { x: 1, y: 70, z: 1 });
  assert.deepEqual(waypoint, { x: 1, y: 70, z: 1 });
  assert.equal(resolverCalls, 1);
  navigation.cleanup();
});

void test("createSessionTerrainNavigation logs wait state and throws on chunk-ready timeout", () => {
  const client = new FakeClient();
  const infoEvents: Array<{ event?: string }> = [];
  let nowMs = 0;
  const navigation = createSessionTerrainNavigation(
    client,
    { info: (payload: { event?: string }) => infoEvents.push(payload) } as unknown as Logger,
    {
      now: () => nowMs,
      chunkReadyTimeoutMs: 100,
      createChunkTerrainMap: () => ({
        configureRuntimeIdMode: () => undefined,
        observeLevelChunk: () => undefined,
        observeSubChunk: () => undefined,
        isStandable: (_x: number, _y: number, _z: number) => true,
        getLoadedChunkCount: () => 0
      }) as FakeChunkTerrainMap,
      createNavigationWaypointResolver: () => ({
        resolveWaypoint: (_position, target) => target,
        clear: () => undefined
      }) as FakeWaypointResolver
    }
  );
  assert.equal(navigation.resolveWaypoint({ x: 0, y: 70, z: 0 }, { x: 1, y: 70, z: 1 }), null);
  assert.equal(infoEvents.some((event) => event.event === "navigation_waiting_for_chunks"), true);
  nowMs = 101;
  assert.throws(() => navigation.resolveWaypoint({ x: 0, y: 70, z: 0 }, { x: 1, y: 70, z: 1 }));
  navigation.cleanup();
});

void test("createSessionTerrainNavigation resets waiting timer when target disappears", () => {
  const client = new FakeClient();
  let nowMs = 0;
  const navigation = createSessionTerrainNavigation(
    client,
    { info: () => undefined } as unknown as Logger,
    {
      now: () => nowMs,
      chunkReadyTimeoutMs: 100,
      createChunkTerrainMap: () => ({
        configureRuntimeIdMode: () => undefined,
        observeLevelChunk: () => undefined,
        observeSubChunk: () => undefined,
        isStandable: (_x: number, _y: number, _z: number) => true,
        getLoadedChunkCount: () => 0
      }) as FakeChunkTerrainMap,
      createNavigationWaypointResolver: () => ({
        resolveWaypoint: (_position, target) => target,
        clear: () => undefined
      }) as FakeWaypointResolver
    }
  );
  navigation.resolveWaypoint({ x: 0, y: 70, z: 0 }, { x: 1, y: 70, z: 1 });
  nowMs = 50;
  navigation.resolveWaypoint({ x: 0, y: 70, z: 0 }, null);
  nowMs = 120;
  assert.equal(navigation.resolveWaypoint({ x: 0, y: 70, z: 0 }, { x: 1, y: 70, z: 1 }), null);
  navigation.cleanup();
});
