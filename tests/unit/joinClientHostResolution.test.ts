import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Authflow } from "prismarine-auth";
import type { Logger } from "pino";
import { joinBedrockServer } from "../../src/bedrock/joinClient.js";
import { MOVEMENT_GOAL_SAFE_WALK, RAKNET_BACKEND_NODE } from "../../src/constants.js";

class FakeClient extends EventEmitter {
  disconnectCalled = false;
  disconnect(): void {
    this.disconnectCalled = true;
  }
}

const createLogger = (): Logger => ({ debug: () => undefined, info: () => undefined } as unknown as Logger);

void test("joinBedrockServer resolves hostname for raknet-node backend", async () => {
  const fakeClient = new FakeClient();
  let receivedHost = "";
  const promise = joinBedrockServer({
    host: "example.test",
    port: 19132,
    accountName: "user",
    authflow: { username: "user" } as Authflow,
    logger: createLogger(),
    serverName: "Server",
    disconnectAfterFirstChunk: true,
    skipPing: true,
    raknetBackend: RAKNET_BACKEND_NODE,
    transport: "raknet",
    movementGoal: MOVEMENT_GOAL_SAFE_WALK,
    followPlayerName: undefined,
    followCoordinates: undefined,
    lookupHost: async () => "203.0.113.10",
    clientFactory: (options) => {
      receivedHost = options.host;
      return fakeClient;
    }
  });
  await Promise.resolve();
  fakeClient.emit("level_chunk", { x: 0, z: 0 });
  await promise;
  assert.equal(receivedHost, "203.0.113.10");
});
