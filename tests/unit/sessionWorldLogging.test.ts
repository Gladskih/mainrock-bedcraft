import assert from "node:assert/strict";
import { test } from "node:test";
import type { Logger } from "pino";
import type { JoinOptions } from "../../src/bedrock/joinClient.js";
import type { StartGamePacket } from "../../src/bedrock/joinClientHelpers.js";
import { toChunkPublisherUpdateLogFields, toStartGameLogFields } from "../../src/bedrock/sessionWorldLogging.js";

const createJoinOptions = (overrides: Partial<JoinOptions> = {}): JoinOptions => ({
  host: "127.0.0.1",
  port: 19132,
  accountName: "account",
  authflow: {} as JoinOptions["authflow"],
  logger: { info: () => undefined } as unknown as Logger,
  serverName: undefined,
  disconnectAfterFirstChunk: false,
  skipPing: false,
  raknetBackend: "raknet-node",
  transport: "raknet",
  movementGoal: "safe_walk",
  followPlayerName: undefined,
  followCoordinates: undefined,
  ...overrides
});

void test("toStartGameLogFields prefers player_gamemode and serializes server id", () => {
  const packet = {
    dimension: "overworld",
    level_id: "level-id",
    world_name: "world-name",
    block_network_ids_are_hashes: true,
    player_gamemode: 2,
    game_type: 1,
    difficulty: "3",
    generator: 1,
    seed: "123"
  } as unknown as StartGamePacket;
  const fields = toStartGameLogFields(
    createJoinOptions({ nethernetServerId: 42n, transport: "nethernet" }),
    { profile: { name: "SrgGld" } },
    packet,
    "100",
    { x: 1, y: 64, z: 2 }
  );
  assert.equal(fields["serverId"], "42");
  assert.equal(fields["playerName"], "SrgGld");
  assert.equal(fields["gameType"], 2);
  assert.equal(fields["difficulty"], 3);
  assert.equal(fields["generator"], 1);
  assert.equal(fields["seed"], 123);
  assert.equal(fields["serverName"], null);
  assert.equal(fields["blockNetworkIdsAreHashes"], true);
});

void test("toStartGameLogFields falls back to game_type when player_gamemode is missing", () => {
  const packet = { game_type: 1 } as unknown as StartGamePacket;
  const fields = toStartGameLogFields(
    createJoinOptions({ serverName: "targetplayer" }),
    {},
    packet,
    null,
    null
  );
  assert.equal(fields["serverId"], null);
  assert.equal(fields["serverName"], "targetplayer");
  assert.equal(fields["playerName"], "unknown");
  assert.equal(fields["gameType"], 1);
  assert.equal(fields["dimension"], null);
});

void test("toChunkPublisherUpdateLogFields serializes center and radius", () => {
  const fields = toChunkPublisherUpdateLogFields({
    coordinates: { x: 96, y: 0, z: -32 },
    radius: "144"
  });
  assert.deepEqual(fields["chunkPublisherCenter"], { x: 96, y: 0, z: -32 });
  assert.equal(fields["chunkPublisherRadiusBlocks"], 144);
});
