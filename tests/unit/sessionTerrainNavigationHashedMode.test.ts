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

void test("createSessionTerrainNavigation configures hashed runtime id mode from start_game", () => {
  const client = new FakeClient();
  const infoEvents: Array<{ event?: string; mode?: string }> = [];
  const configuredModes: boolean[] = [];
  const navigation = createSessionTerrainNavigation(
    client,
    {
      info: (payload: { event?: string; mode?: string }) => infoEvents.push(payload),
      error: () => undefined
    } as unknown as Logger,
    {
      createChunkTerrainMap: () => ({
        configureRuntimeIdMode: (useHashedRuntimeIds: boolean) => configuredModes.push(useHashedRuntimeIds),
        observeLevelChunk: () => undefined,
        observeSubChunk: () => undefined,
        isStandable: (_x: number, _y: number, _z: number) => true,
        getLoadedChunkCount: () => 1
      }) as FakeChunkTerrainMap,
      createNavigationWaypointResolver: () => ({
        resolveWaypoint: (_position, target) => target,
        clear: () => undefined
      }) as FakeWaypointResolver
    }
  );
  client.emit("start_game", { block_network_ids_are_hashes: true });
  const waypoint = navigation.resolveWaypoint({ x: 0, y: 70, z: 0 }, { x: 1, y: 70, z: 1 });
  assert.deepEqual(waypoint, { x: 1, y: 70, z: 1 });
  assert.equal(
    infoEvents.some((event) => event.event === "navigation_runtime_id_mode" && event.mode === "hashed"),
    true
  );
  assert.deepEqual(configuredModes, [true]);
  navigation.cleanup();
});

void test("createSessionTerrainNavigation fails fast when runtime id mode reconfiguration fails", () => {
  const client = new FakeClient();
  const errorEvents: Array<{ event?: string; mode?: string; error?: string }> = [];
  const navigation = createSessionTerrainNavigation(
    client,
    {
      info: () => undefined,
      error: (payload: { event?: string; mode?: string; error?: string }) => errorEvents.push(payload)
    } as unknown as Logger,
    {
      createChunkTerrainMap: () => ({
        configureRuntimeIdMode: () => {
          throw new Error("reconfigure-failed");
        },
        observeLevelChunk: () => undefined,
        observeSubChunk: () => undefined,
        isStandable: (_x: number, _y: number, _z: number) => true,
        getLoadedChunkCount: () => 1
      }) as FakeChunkTerrainMap,
      createNavigationWaypointResolver: () => ({
        resolveWaypoint: (_position, target) => target,
        clear: () => undefined
      }) as FakeWaypointResolver
    }
  );
  client.emit("start_game", { block_network_ids_are_hashes: true });
  assert.throws(() => navigation.resolveWaypoint({ x: 0, y: 70, z: 0 }, { x: 1, y: 70, z: 1 }));
  assert.equal(
    errorEvents.some((event) => event.event === "navigation_runtime_id_mode_error" && event.mode === "hashed"),
    true
  );
  navigation.cleanup();
});
