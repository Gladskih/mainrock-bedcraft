import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Authflow } from "prismarine-auth";
import type { Logger } from "pino";
import { joinBedrockServer } from "../../src/bedrock/joinClient.js";
import {
  DEFAULT_RAKNET_BACKEND,
  MOVEMENT_GOAL_FOLLOW_COORDINATES,
  MOVEMENT_GOAL_SAFE_WALK
} from "../../src/constants.js";

class FakeClient extends EventEmitter {
  disconnect(): void {}
}

const createLogger = (): Logger => ({ debug: () => undefined, info: () => undefined } as unknown as Logger);

const createJoinOptions = (client: FakeClient) => ({
  host: "127.0.0.1",
  port: 19132,
  accountName: "user",
  authflow: { username: "user" } as Authflow,
  logger: createLogger(),
  serverName: "Server",
  disconnectAfterFirstChunk: false,
  skipPing: false,
  raknetBackend: DEFAULT_RAKNET_BACKEND,
  transport: "raknet" as const,
  movementGoal: MOVEMENT_GOAL_SAFE_WALK,
  followPlayerName: undefined,
  followCoordinates: undefined,
  clientFactory: () => client
});

void test("joinBedrockServer follow-coordinates goal fails fast without decoded terrain chunks", async () => {
  const fakeClient = new FakeClient();
  const promise = joinBedrockServer({
    ...createJoinOptions(fakeClient),
    movementGoal: MOVEMENT_GOAL_FOLLOW_COORDINATES,
    followCoordinates: { x: 5, y: 70, z: 0 }
  });
  fakeClient.emit("start_game", { runtime_entity_id: 1n, player_position: { x: 0, y: 70, z: 0 }, dimension: "overworld" });
  fakeClient.emit("spawn");
  fakeClient.emit("level_chunk", { x: 0, z: 0 });
  await assert.rejects(() => promise, /Navigation (path unavailable|chunk data unavailable)/);
});
