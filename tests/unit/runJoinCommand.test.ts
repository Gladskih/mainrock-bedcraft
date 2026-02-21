import assert from "node:assert/strict";
import { test } from "node:test";
import type { Authflow } from "prismarine-auth";
import type { Logger } from "pino";
import { runJoinCommand, type JoinCommandOptions, type JoinDependencies } from "../../src/command-line/runJoinCommand.js";
import {
  DEFAULT_BEDROCK_PORT,
  DEFAULT_RAKNET_BACKEND,
  MOVEMENT_GOAL_FOLLOW_PLAYER,
  MOVEMENT_GOAL_SAFE_WALK
} from "../../src/constants.js";
import { selectServerByName } from "../../src/bedrock/serverSelection.js";

type JoinCall = {
  host: string;
  port: number;
  skipPing: boolean;
  raknetBackend: string;
  transport: string;
  movementGoal: string;
  followPlayerName: string | undefined;
  nethernetServerId?: bigint;
  minecraftVersion?: string;
};

const createLogger = (): Logger => ({
  info: () => undefined,
  warn: () => undefined
} as unknown as Logger);

const createBaseJoinOptions = (overrides: Partial<JoinCommandOptions> = {}): JoinCommandOptions => ({
  accountName: "user",
  host: "127.0.0.1",
  port: DEFAULT_BEDROCK_PORT,
  serverName: undefined,
  transport: "raknet",
  discoveryTimeoutMs: 1,
  cacheDirectory: undefined,
  keyFilePath: undefined,
  environmentKey: undefined,
  minecraftVersion: undefined,
  joinTimeoutMs: 1,
  disconnectAfterFirstChunk: true,
  forceRefresh: false,
  skipPing: false,
  raknetBackend: DEFAULT_RAKNET_BACKEND,
  movementGoal: MOVEMENT_GOAL_SAFE_WALK,
  followPlayerName: undefined,
  ...overrides
});

const createDependencies = () => {
  const calls: { join?: JoinCall } = {};
  const dependencies: JoinDependencies = {
    resolveCachePaths: () => ({ cacheDirectory: "cache", keyFilePath: "key" }),
    discoverLanServers: async () => [],
    discoverNethernetLanServers: async () => [],
    selectServerByName,
    createAuthFlow: () => ({ authflow: { username: "user" } as Authflow, keySource: "environment" }),
    joinBedrockServer: async (options) => {
      calls.join = {
        host: options.host,
        port: options.port,
        skipPing: options.skipPing,
        raknetBackend: options.raknetBackend,
        transport: options.transport,
        movementGoal: options.movementGoal,
        followPlayerName: options.followPlayerName,
        ...(options.nethernetServerId !== undefined ? { nethernetServerId: options.nethernetServerId } : {}),
        ...(options.minecraftVersion !== undefined ? { minecraftVersion: options.minecraftVersion } : {})
      };
    },
    sleep: async () => undefined,
    random: () => 0
  };
  return { calls, dependencies };
};

const createServer = (host: string, motd: string) => ({
  host,
  port: 19132,
  advertisement: {
    motd,
    levelName: "World",
    protocol: 754,
    version: "1.21.80",
    playersOnline: 1,
    playersMax: 10,
    serverId: "id",
    gamemode: "",
    gamemodeId: null,
    portV4: 19132,
    portV6: null
  },
  lastSeenMs: 0
});

void test("runJoinCommand requires host or name", async () => {
  const { dependencies } = createDependencies();
  await assert.rejects(() => runJoinCommand(
    createBaseJoinOptions({ host: undefined, serverName: undefined }),
    createLogger(),
    dependencies
  ));
});

void test("runJoinCommand joins by host", async () => {
  const { dependencies, calls } = createDependencies();
  await runJoinCommand(createBaseJoinOptions(), createLogger(), dependencies);
  assert.deepEqual(calls.join, {
    host: "127.0.0.1",
    port: DEFAULT_BEDROCK_PORT,
    skipPing: false,
    raknetBackend: DEFAULT_RAKNET_BACKEND,
    transport: "raknet",
    movementGoal: MOVEMENT_GOAL_SAFE_WALK,
    followPlayerName: undefined
  });
});

void test("runJoinCommand joins by name", async () => {
  const { dependencies, calls } = createDependencies();
  dependencies.discoverLanServers = async () => [createServer("192.168.1.10", "Server")];
  await runJoinCommand(createBaseJoinOptions({ host: undefined, serverName: "Server" }), createLogger(), dependencies);
  assert.deepEqual(calls.join, {
    host: "192.168.1.10",
    port: DEFAULT_BEDROCK_PORT,
    skipPing: false,
    raknetBackend: DEFAULT_RAKNET_BACKEND,
    transport: "raknet",
    movementGoal: MOVEMENT_GOAL_SAFE_WALK,
    followPlayerName: undefined
  });
});

void test("runJoinCommand rejects when no servers match", async () => {
  const { dependencies } = createDependencies();
  dependencies.discoverLanServers = async () => [];
  await assert.rejects(() => runJoinCommand(createBaseJoinOptions({ host: undefined, serverName: "Missing" }), createLogger(), dependencies));
});

void test("runJoinCommand rejects on multiple matches", async () => {
  const { dependencies } = createDependencies();
  dependencies.discoverLanServers = async () => [createServer("192.168.1.10", "Server"), createServer("192.168.1.11", "Server")];
  await assert.rejects(() => runJoinCommand(createBaseJoinOptions({ host: undefined, serverName: "Server" }), createLogger(), dependencies));
});

void test("runJoinCommand passes cache overrides to auth flow", async () => {
  const { dependencies } = createDependencies();
  let receivedCacheDirectory = "";
  let receivedKeyFilePath = "";
  dependencies.createAuthFlow = (options) => {
    receivedCacheDirectory = options.cacheDirectory;
    receivedKeyFilePath = options.keyFilePath;
    return { authflow: { username: "user" } as Authflow, keySource: "environment" };
  };
  await runJoinCommand(createBaseJoinOptions({ cacheDirectory: "override-cache", keyFilePath: "override-key", environmentKey: "secret" }), createLogger(), dependencies);
  assert.equal(receivedCacheDirectory, "override-cache");
  assert.equal(receivedKeyFilePath, "override-key");
});

void test("runJoinCommand logs device code callback", async () => {
  const { dependencies } = createDependencies();
  const events: Array<{ event?: string }> = [];
  const logger = ({
    info: (data: { event?: string }) => events.push(data)
  } as unknown) as Logger;
  dependencies.createAuthFlow = (options) => {
    options.deviceCodeCallback({
      user_code: "CODE",
      device_code: "DEVICE",
      verification_uri: "https://example.com",
      expires_in: 10,
      interval: 1,
      message: "msg"
    });
    return { authflow: { username: "user" } as Authflow, keySource: "environment" };
  };
  await runJoinCommand(createBaseJoinOptions(), logger, dependencies);
  assert.equal(events.some((event) => event.event === "device_code"), true);
});

void test("runJoinCommand passes minecraft version when provided", async () => {
  const { dependencies, calls } = createDependencies();
  await runJoinCommand(createBaseJoinOptions({ minecraftVersion: "1.21.93" }), createLogger(), dependencies);
  assert.equal(calls.join?.minecraftVersion, "1.21.93");
});

void test("runJoinCommand passes follow-player goal", async () => {
  const { dependencies, calls } = createDependencies();
  await runJoinCommand(
    createBaseJoinOptions({ movementGoal: MOVEMENT_GOAL_FOLLOW_PLAYER, followPlayerName: "TargetPlayer" }),
    createLogger(),
    dependencies
  );
  assert.equal(calls.join?.movementGoal, MOVEMENT_GOAL_FOLLOW_PLAYER);
  assert.equal(calls.join?.followPlayerName, "TargetPlayer");
});

void test("runJoinCommand retries after failed join and then succeeds", async () => {
  const { dependencies } = createDependencies();
  let attempts = 0;
  const delays: number[] = [];
  dependencies.joinBedrockServer = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("temporary");
  };
  dependencies.sleep = async (delayMs) => {
    delays.push(delayMs);
  };
  await runJoinCommand(
    createBaseJoinOptions({
      reconnectMaxRetries: 1,
      reconnectBaseDelayMs: 10,
      reconnectMaxDelayMs: 10
    }),
    createLogger(),
    dependencies
  );
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [10]);
});

void test("runJoinCommand throws after reconnect retries are exhausted", async () => {
  const { dependencies } = createDependencies();
  let attempts = 0;
  dependencies.joinBedrockServer = async () => {
    attempts += 1;
    throw new Error("still-failing");
  };
  await assert.rejects(() => runJoinCommand(
    createBaseJoinOptions({
      reconnectMaxRetries: 1,
      reconnectBaseDelayMs: 5,
      reconnectMaxDelayMs: 5
    }),
    createLogger(),
    dependencies
  ));
  assert.equal(attempts, 2);
});

void test("runJoinCommand records online and offline state transitions from join callbacks", async () => {
  const { dependencies } = createDependencies();
  const transitions: Array<{ from: string | undefined; to: string | undefined }> = [];
  const logger = ({
    info: (data: { event?: string; from?: string; to?: string }) => {
      if (data.event !== "join_state") return;
      transitions.push({ from: data.from, to: data.to });
    },
    warn: () => undefined
  } as unknown) as Logger;
  dependencies.joinBedrockServer = async (options) => {
    options.onConnectionStateChange?.({ state: "online", reason: "join_authenticated" });
    options.onConnectionStateChange?.({ state: "offline", reason: "session_finished" });
  };
  await runJoinCommand(createBaseJoinOptions(), logger, dependencies);
  assert.equal(transitions.some((transition) => transition.from === "connecting" && transition.to === "online"), true);
  assert.equal(transitions.some((transition) => transition.from === "online" && transition.to === "offline"), true);
});
