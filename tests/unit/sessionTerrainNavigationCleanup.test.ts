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

void test("createSessionTerrainNavigation cleanup clears resolver and removes listener", () => {
  const client = new FakeClient();
  let cleared = false;
  const observedPackets: unknown[] = [];
  const navigation = createSessionTerrainNavigation(
    client,
    { info: () => undefined } as unknown as Logger,
    {
      createChunkTerrainMap: () => ({
        configureRuntimeIdMode: () => undefined,
        observeLevelChunk: (packet) => observedPackets.push(packet),
        observeSubChunk: () => undefined,
        isStandable: (_x: number, _y: number, _z: number) => true,
        getLoadedChunkCount: () => 1
      }) as FakeChunkTerrainMap,
      createNavigationWaypointResolver: () => ({
        resolveWaypoint: (_position, target) => target,
        clear: () => {
          cleared = true;
        }
      }) as FakeWaypointResolver
    }
  );
  navigation.cleanup();
  client.emit("level_chunk", { x: 0, z: 0 });
  assert.equal(cleared, true);
  assert.equal(observedPackets.length, 0);
});
