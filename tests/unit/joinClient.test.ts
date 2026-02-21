import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Authflow } from "prismarine-auth";
import type { Logger } from "pino";
import { joinBedrockServer } from "../../src/bedrock/joinClient.js";
import { DEFAULT_RAKNET_BACKEND, MOVEMENT_GOAL_FOLLOW_PLAYER, MOVEMENT_GOAL_SAFE_WALK } from "../../src/constants.js";

class FakeClient extends EventEmitter {
  disconnectCalled = false;
  profile?: { name?: string };
  disconnect(): void {
    this.disconnectCalled = true;
  }
}

const defaultAuthflow = { username: "user" } as Authflow;

const createLogger = (): Logger => ({
  debug: () => undefined,
  info: () => undefined
} as unknown as Logger);

const createCapturingLogger = <T extends object>(events: T[]): Logger => ({
  debug: () => undefined,
  info: (data: T) => {
    events.push(data);
  }
} as unknown as Logger);

type JoinOptions = Parameters<typeof joinBedrockServer>[0];

const createRaknetJoinOptions = (client: FakeClient, overrides: Partial<JoinOptions> = {}): JoinOptions => ({
  host: "127.0.0.1",
  port: 19132,
  accountName: "user",
  authflow: defaultAuthflow,
  logger: createLogger(),
  serverName: "Server",
  disconnectAfterFirstChunk: true,
  skipPing: false,
  raknetBackend: DEFAULT_RAKNET_BACKEND,
  transport: "raknet",
  movementGoal: MOVEMENT_GOAL_SAFE_WALK,
  followPlayerName: undefined,
  clientFactory: () => client,
  ...overrides
});

void test("joinBedrockServer resolves after first chunk", async () => {
  const fakeClient = new FakeClient();
  fakeClient.profile = { name: "Player" };
  const promise = joinBedrockServer(createRaknetJoinOptions(fakeClient));
  fakeClient.emit("loggingIn");
  fakeClient.emit("client.server_handshake");
  fakeClient.emit("play_status", { status: "login_success" });
  fakeClient.emit("join");
  fakeClient.emit("start_game", { player_position: { x: 1, y: 2, z: 3 }, dimension: "overworld" });
  fakeClient.emit("spawn");
  fakeClient.emit("level_chunk", { x: 0, z: 0 });
  await promise;
  assert.equal(fakeClient.disconnectCalled, true);
});

void test("joinBedrockServer respects disconnect flag", async () => {
  const fakeClient = new FakeClient();
  const promise = joinBedrockServer(createRaknetJoinOptions(fakeClient, { disconnectAfterFirstChunk: false }));
  fakeClient.emit("level_chunk", { x: 0, z: 0 });
  const status = await Promise.race([
    promise.then(() => "resolved"),
    new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 25))
  ]);
  assert.equal(status, "pending");
  assert.equal(fakeClient.disconnectCalled, false);
  process.emit("SIGINT");
  await promise;
});

void test("joinBedrockServer rejects on close before chunk", async () => {
  const fakeClient = new FakeClient();
  const promise = joinBedrockServer(createRaknetJoinOptions(fakeClient));
  fakeClient.emit("close", "reason");
  await assert.rejects(() => promise);
});

void test("joinBedrockServer rejects on non-error value", async () => {
  const fakeClient = new FakeClient();
  const promise = joinBedrockServer(createRaknetJoinOptions(fakeClient));
  fakeClient.emit("error", "bad");
  await assert.rejects(() => promise);
});

void test("joinBedrockServer ignores invalid packets", async () => {
  const fakeClient = new FakeClient();
  const promise = joinBedrockServer(createRaknetJoinOptions(fakeClient));
  fakeClient.emit("join");
  fakeClient.emit("start_game", null);
  fakeClient.emit("start_game", { player_position: "bad", dimension: "overworld" });
  fakeClient.emit("spawn");
  fakeClient.emit("level_chunk", { x: 0 });
  fakeClient.emit("level_chunk", { x: 0, z: 0 });
  await promise;
  assert.equal(fakeClient.disconnectCalled, true);
});

void test("joinBedrockServer logs unknown profile name", async () => {
  const fakeClient = new FakeClient();
  const events: Array<{ playerName?: string }> = [];
  const promise = joinBedrockServer(createRaknetJoinOptions(fakeClient, {
    logger: createCapturingLogger(events),
    disconnectAfterFirstChunk: true
  }));
  fakeClient.emit("join");
  fakeClient.emit("level_chunk", { x: 0, z: 0 });
  await promise;
  assert.equal(events.some((event) => event.playerName === "unknown"), true);
});

void test("joinBedrockServer handles SIGINT", async () => {
  const fakeClient = new FakeClient();
  const promise = joinBedrockServer(createRaknetJoinOptions(fakeClient, { disconnectAfterFirstChunk: false }));
  process.emit("SIGINT");
  await promise;
  assert.equal(fakeClient.disconnectCalled, true);
});

void test("joinBedrockServer uses null position without start game", async () => {
  const fakeClient = new FakeClient();
  const events: Array<{ event?: string; position?: unknown }> = [];
  const promise = joinBedrockServer(createRaknetJoinOptions(fakeClient, {
    logger: createCapturingLogger(events),
    disconnectAfterFirstChunk: true
  }));
  fakeClient.emit("spawn");
  fakeClient.emit("level_chunk", { x: 0, z: 0 });
  await promise;
  assert.equal(events.some((event) => event.event === "spawn" && event.position === null), true);
});

void test("joinBedrockServer logs chunk progress while connected", async () => {
  const fakeClient = new FakeClient();
  const events: Array<{ event?: string; chunkPackets?: number }> = [];
  const promise = joinBedrockServer(createRaknetJoinOptions(fakeClient, {
    logger: createCapturingLogger(events),
    disconnectAfterFirstChunk: false
  }));
  for (let index = 0; index < 64; index += 1) {
    fakeClient.emit("level_chunk", { x: index, z: 0 });
  }
  assert.equal(events.some((event) => event.event === "chunk_progress" && event.chunkPackets === 64), true);
  process.emit("SIGINT");
  await promise;
});

void test("joinBedrockServer follow-player goal sends movement toward target", async () => {
  class WritableClient extends FakeClient {
    queueCalls: Array<{ name: string; params: { move_vector?: { x?: number; y?: number } } }> = [];
    queue(name: string, params: { move_vector?: { x?: number; y?: number } }): void {
      this.queueCalls.push({ name, params });
    }
  }
  const fakeClient = new WritableClient();
  const promise = joinBedrockServer(createRaknetJoinOptions(fakeClient, {
    disconnectAfterFirstChunk: false,
    movementGoal: MOVEMENT_GOAL_FOLLOW_PLAYER,
    followPlayerName: "TargetPlayer"
  }));
  fakeClient.emit("start_game", { runtime_entity_id: 1n, player_position: { x: 0, y: 70, z: 0 }, dimension: "overworld" });
  fakeClient.emit("add_player", { runtime_id: 2n, username: "TargetPlayer", position: { x: 5, y: 70, z: 0 } });
  fakeClient.emit("level_chunk", { x: 0, z: 0 });
  await new Promise((resolve) => setTimeout(resolve, 130));
  process.emit("SIGINT");
  await promise;
  assert.equal(fakeClient.queueCalls.some((call) => call.name === "player_auth_input"), true);
  assert.equal(fakeClient.queueCalls.some((call) => (call.params.move_vector?.x ?? 0) > 0), true);
});

void test("joinBedrockServer rejects nethernet join without server id", async () => {
  await assert.rejects(() => joinBedrockServer({
    host: "127.0.0.1",
    port: 19132,
    accountName: "user",
    authflow: defaultAuthflow,
    logger: createLogger(),
    serverName: "Server",
    disconnectAfterFirstChunk: true,
    skipPing: false,
    raknetBackend: DEFAULT_RAKNET_BACKEND,
    transport: "nethernet",
    movementGoal: MOVEMENT_GOAL_SAFE_WALK,
    followPlayerName: undefined
  }));
});

void test("joinBedrockServer uses nethernet client factory", async () => {
  const fakeClient = new FakeClient();
  let receivedSkipPing = false;
  let receivedServerId = 0n;
  let receivedClientId = 0n;
  const promise = joinBedrockServer({
    host: "127.0.0.1",
    port: 19132,
    accountName: "user",
    authflow: defaultAuthflow,
    logger: createLogger(),
    serverName: "Server",
    disconnectAfterFirstChunk: true,
    skipPing: false,
    raknetBackend: DEFAULT_RAKNET_BACKEND,
    transport: "nethernet",
    movementGoal: MOVEMENT_GOAL_SAFE_WALK,
    followPlayerName: undefined,
    nethernetServerId: 5n,
    nethernetClientId: 6n,
    nethernetClientFactory: (options, _logger, serverId, clientId) => {
      receivedSkipPing = options.skipPing === true;
      receivedServerId = serverId;
      receivedClientId = clientId;
      return fakeClient;
    }
  });
  fakeClient.emit("level_chunk", { x: 0, z: 0 });
  await promise;
  assert.equal(fakeClient.disconnectCalled, true);
  assert.equal(receivedSkipPing, true);
  assert.equal(receivedServerId, 5n);
  assert.equal(receivedClientId, 6n);
});

void test("joinBedrockServer rejects on join timeout", async () => {
  const fakeClient = new FakeClient();
  const promise = joinBedrockServer(createRaknetJoinOptions(fakeClient, {
    disconnectAfterFirstChunk: false,
    joinTimeoutMs: 50
  }));
  await assert.rejects(() => promise);
  assert.equal(fakeClient.disconnectCalled, true);
});

void test("joinBedrockServer includes last packet details on timeout", async () => {
  const fakeClient = new FakeClient();
  const promise = joinBedrockServer(createRaknetJoinOptions(fakeClient, {
    disconnectAfterFirstChunk: false,
    joinTimeoutMs: 50
  }));
  fakeClient.emit("packet", { data: { name: "test_packet" } });
  await assert.rejects(() => promise);
  assert.equal(fakeClient.disconnectCalled, true);
});

void test("joinBedrockServer responds to resource pack negotiation", async () => {
  class WritableClient extends FakeClient {
    writeCalls: Array<{ name: string; params: object }> = [];
    queueCalls: Array<{ name: string; params: object }> = [];
    write(name: string, params: object): void {
      this.writeCalls.push({ name, params });
    }
    queue(name: string, params: object): void {
      this.queueCalls.push({ name, params });
    }
  }
  const fakeClient = new WritableClient();
  const promise = joinBedrockServer(createRaknetJoinOptions(fakeClient, { disconnectAfterFirstChunk: true }));
  fakeClient.emit("join");
  fakeClient.emit("resource_packs_info");
  fakeClient.emit("resource_pack_stack");
  fakeClient.emit("join");
  await new Promise((resolve) => setTimeout(resolve, 600));
  fakeClient.emit("level_chunk", { x: 0, z: 0 });
  await promise;
  assert.equal(fakeClient.writeCalls.some((call) => call.name === "resource_pack_client_response"), true);
  assert.equal(fakeClient.queueCalls.some((call) => call.name === "client_cache_status"), true);
  assert.equal(fakeClient.queueCalls.some((call) => call.name === "request_chunk_radius"), true);
});
