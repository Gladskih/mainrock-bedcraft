import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Authflow } from "prismarine-auth";
import type { Logger } from "pino";
import { joinBedrockServer } from "../../src/bedrock/joinClient.js";
import { DEFAULT_RAKNET_BACKEND, MOVEMENT_GOAL_SAFE_WALK } from "../../src/constants.js";

class FakeClient extends EventEmitter {
  disconnectCalled = false;
  disconnect(): void {
    this.disconnectCalled = true;
  }
}

const defaultAuthflow = { username: "user" } as Authflow;

const createLogger = (): Logger => ({
  debug: () => undefined,
  info: () => undefined
} as unknown as Logger);

type JoinOptions = Parameters<typeof joinBedrockServer>[0];

const createRaknetJoinOptions = (client: FakeClient, overrides: Partial<JoinOptions> = {}): JoinOptions => ({
  host: "127.0.0.1",
  port: 19132,
  accountName: "user",
  authflow: defaultAuthflow,
  logger: createLogger(),
  serverName: "Server",
  disconnectAfterFirstChunk: false,
  skipPing: false,
  raknetBackend: DEFAULT_RAKNET_BACKEND,
  transport: "raknet",
  movementGoal: MOVEMENT_GOAL_SAFE_WALK,
  followPlayerName: undefined,
  followCoordinates: undefined,
  clientFactory: () => client,
  listPlayersOnly: true,
  ...overrides
});

void test("joinBedrockServer listPlayersOnly resolves after probe timeout", async () => {
  const fakeClient = new FakeClient();
  const snapshots: string[][] = [];
  const promise = joinBedrockServer(createRaknetJoinOptions(fakeClient, {
    playerListWaitMs: 20,
    onPlayerListUpdate: (players) => snapshots.push(players)
  }));
  fakeClient.emit("join");
  fakeClient.emit("player_list", {
    records: {
      type: "add",
      records: [{ uuid: "1", username: "TargetPlayer" }]
    }
  });
  await promise;
  assert.equal(fakeClient.disconnectCalled, true);
  assert.deepEqual(snapshots.at(-1), ["TargetPlayer"]);
});

void test("joinBedrockServer listPlayersOnly settles before max wait after updates", async () => {
  const fakeClient = new FakeClient();
  const startedAtMs = Date.now();
  const promise = joinBedrockServer(createRaknetJoinOptions(fakeClient, {
    playerListWaitMs: 2000
  }));
  fakeClient.emit("join");
  fakeClient.emit("player_list", {
    records: {
      type: "add",
      records: [{ uuid: "1", username: "TargetPlayer" }]
    }
  });
  await promise;
  assert.equal(Date.now() - startedAtMs < 1000, true);
});
