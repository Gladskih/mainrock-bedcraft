import assert from "node:assert/strict";
import { test } from "node:test";
import type { Authflow } from "prismarine-auth";
import type { Logger } from "pino";
import { runJoinCommand, type JoinDependencies } from "../../src/command-line/runJoinCommand.js";
import { DEFAULT_NETHERNET_PORT, DEFAULT_RAKNET_BACKEND } from "../../src/constants.js";
import { selectServerByName } from "../../src/bedrock/serverSelection.js";

type JoinCall = {
  host: string;
  port: number;
  skipPing: boolean;
  raknetBackend: string;
  transport: string;
  nethernetServerId?: bigint;
};

const createLogger = (): Logger => ({
  info: () => undefined
} as unknown as Logger);

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
        ...(options.nethernetServerId !== undefined ? { nethernetServerId: options.nethernetServerId } : {})
      };
    }
  };
  return { calls, dependencies };
};

void test("runJoinCommand joins nethernet by host", async () => {
  const { dependencies, calls } = createDependencies();
  dependencies.discoverNethernetLanServers = async () => [{
    host: "127.0.0.1",
    port: DEFAULT_NETHERNET_PORT,
    senderId: 99n,
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
  }];
  await runJoinCommand({
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
    raknetBackend: DEFAULT_RAKNET_BACKEND
  }, createLogger(), dependencies);
  assert.deepEqual(calls.join, {
    host: "127.0.0.1",
    port: DEFAULT_NETHERNET_PORT,
    skipPing: true,
    raknetBackend: DEFAULT_RAKNET_BACKEND,
    transport: "nethernet",
    nethernetServerId: 99n
  });
});

void test("runJoinCommand joins nethernet by name", async () => {
  const { dependencies, calls } = createDependencies();
  dependencies.discoverNethernetLanServers = async () => [{
    host: "192.168.1.10",
    port: DEFAULT_NETHERNET_PORT,
    senderId: 42n,
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
  }];
  await runJoinCommand({
    accountName: "user",
    host: undefined,
    port: DEFAULT_NETHERNET_PORT,
    serverName: "Server",
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
    raknetBackend: DEFAULT_RAKNET_BACKEND
  }, createLogger(), dependencies);
  assert.deepEqual(calls.join, {
    host: "192.168.1.10",
    port: DEFAULT_NETHERNET_PORT,
    skipPing: true,
    raknetBackend: DEFAULT_RAKNET_BACKEND,
    transport: "nethernet",
    nethernetServerId: 42n
  });
});

void test("runJoinCommand rejects when no nethernet servers respond by host", async () => {
  const { dependencies } = createDependencies();
  dependencies.discoverNethernetLanServers = async () => [];
  await assert.rejects(() => runJoinCommand({
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
    raknetBackend: DEFAULT_RAKNET_BACKEND
  }, createLogger(), dependencies));
});

void test("runJoinCommand rejects when multiple nethernet servers respond by host", async () => {
  const { dependencies } = createDependencies();
  dependencies.discoverNethernetLanServers = async () => [
    {
      host: "127.0.0.1",
      port: DEFAULT_NETHERNET_PORT,
      senderId: 1n,
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
    },
    {
      host: "127.0.0.1",
      port: DEFAULT_NETHERNET_PORT,
      senderId: 2n,
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
    }
  ];
  await assert.rejects(() => runJoinCommand({
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
    raknetBackend: DEFAULT_RAKNET_BACKEND
  }, createLogger(), dependencies));
});
