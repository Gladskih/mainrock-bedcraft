import assert from "node:assert/strict";
import { test } from "node:test";
import type { Authflow } from "prismarine-auth";
import type { Logger } from "pino";
import { runJoinCommand, type JoinCommandOptions, type JoinDependencies } from "../../src/command-line/runJoinCommand.js";
import {
  DEFAULT_NETHERNET_PORT,
  DEFAULT_RAKNET_BACKEND,
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
};

const createLogger = (): Logger => ({
  info: () => undefined
} as unknown as Logger);

const createBaseJoinOptions = (overrides: Partial<JoinCommandOptions> = {}): JoinCommandOptions => ({
  accountName: "user",
  host: "127.0.0.1",
  port: DEFAULT_NETHERNET_PORT,
  serverName: undefined,
  transport: "nethernet",
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
        ...(options.nethernetServerId !== undefined ? { nethernetServerId: options.nethernetServerId } : {})
      };
    },
    sleep: async () => undefined,
    random: () => 0
  };
  return { calls, dependencies };
};

const createNethernetServer = (host: string, senderId: bigint) => ({
  host,
  port: DEFAULT_NETHERNET_PORT,
  senderId,
  serverData: {
    nethernetVersion: 1,
    serverName: "Server",
    levelName: "World",
    gameType: 1,
    playersOnline: 1,
    playersMax: 10,
    editorWorld: false,
    transportLayer: 0
  },
  lastSeenMs: 0,
  latencyMs: 1
});

void test("runJoinCommand joins nethernet by host", async () => {
  const { dependencies, calls } = createDependencies();
  dependencies.discoverNethernetLanServers = async () => [createNethernetServer("127.0.0.1", 99n)];
  await runJoinCommand(createBaseJoinOptions(), createLogger(), dependencies);
  assert.deepEqual(calls.join, {
    host: "127.0.0.1",
    port: DEFAULT_NETHERNET_PORT,
    skipPing: true,
    raknetBackend: DEFAULT_RAKNET_BACKEND,
    transport: "nethernet",
    movementGoal: MOVEMENT_GOAL_SAFE_WALK,
    followPlayerName: undefined,
    nethernetServerId: 99n
  });
});

void test("runJoinCommand joins nethernet by name", async () => {
  const { dependencies, calls } = createDependencies();
  dependencies.discoverNethernetLanServers = async () => [createNethernetServer("192.168.1.10", 42n)];
  await runJoinCommand(createBaseJoinOptions({ host: undefined, serverName: "Server" }), createLogger(), dependencies);
  assert.deepEqual(calls.join, {
    host: "192.168.1.10",
    port: DEFAULT_NETHERNET_PORT,
    skipPing: true,
    raknetBackend: DEFAULT_RAKNET_BACKEND,
    transport: "nethernet",
    movementGoal: MOVEMENT_GOAL_SAFE_WALK,
    followPlayerName: undefined,
    nethernetServerId: 42n
  });
});

void test("runJoinCommand rejects when no nethernet servers respond by host", async () => {
  const { dependencies } = createDependencies();
  dependencies.discoverNethernetLanServers = async () => [];
  await assert.rejects(() => runJoinCommand(createBaseJoinOptions(), createLogger(), dependencies));
});

void test("runJoinCommand rejects when multiple nethernet servers respond by host", async () => {
  const { dependencies } = createDependencies();
  dependencies.discoverNethernetLanServers = async () => [createNethernetServer("127.0.0.1", 1n), createNethernetServer("127.0.0.1", 2n)];
  await assert.rejects(() => runJoinCommand(createBaseJoinOptions(), createLogger(), dependencies));
});
