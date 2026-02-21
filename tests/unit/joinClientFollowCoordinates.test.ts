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

class WritableClient extends FakeClient {
  queueCalls: Array<{ name: string; params: { move_vector?: { x?: number; y?: number } } }> = [];
  queue(name: string, params: { move_vector?: { x?: number; y?: number } }): void {
    this.queueCalls.push({ name, params });
  }
}

const createLogger = (): Logger => ({ debug: () => undefined, info: () => undefined } as unknown as Logger);

const createJoinOptions = (client: WritableClient) => ({
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

void test("joinBedrockServer follow-coordinates goal sends movement toward target coordinates", async () => {
  const fakeClient = new WritableClient();
  const promise = joinBedrockServer({
    ...createJoinOptions(fakeClient),
    movementGoal: MOVEMENT_GOAL_FOLLOW_COORDINATES,
    followCoordinates: { x: 5, y: 70, z: 0 }
  });
  fakeClient.emit("start_game", { runtime_entity_id: 1n, player_position: { x: 0, y: 70, z: 0 }, dimension: "overworld" });
  fakeClient.emit("level_chunk", { x: 0, z: 0 });
  await new Promise((resolve) => setTimeout(resolve, 130));
  process.emit("SIGINT");
  await promise;
  assert.equal(fakeClient.queueCalls.some((call) => call.name === "player_auth_input"), true);
  assert.equal(fakeClient.queueCalls.some((call) => (call.params.move_vector?.x ?? 0) > 0), true);
});
