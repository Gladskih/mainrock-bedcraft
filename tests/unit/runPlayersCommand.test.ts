import assert from "node:assert/strict";
import { test } from "node:test";
import type { Authflow } from "prismarine-auth";
import type { Logger } from "pino";
import { runPlayersCommand } from "../../src/command-line/runPlayersCommand.js";
import type { JoinDependencies } from "../../src/command-line/runJoinCommand.js";
import { DEFAULT_RAKNET_BACKEND } from "../../src/constants.js";

const createLogger = (events: string[]): Logger => ({
  info: (fields: { event?: string }) => {
    if (fields.event) events.push(fields.event);
  },
  warn: (fields: { event?: string }) => {
    if (fields.event) events.push(fields.event);
  }
} as unknown as Logger);

const createDependencies = (onUpdate?: (players: string[]) => void): JoinDependencies => ({
  resolveCachePaths: () => ({ cacheDirectory: "cache", keyFilePath: "key" }),
  discoverLanServers: async () => [],
  discoverNethernetLanServers: async () => [],
  selectServerByName: () => ({ selected: null, matches: [] }),
  createAuthFlow: () => ({ authflow: { username: "user" } as Authflow, keySource: "environment" }),
  joinBedrockServer: async (options) => {
    onUpdate?.(["TargetPlayer", "SrgGld"]);
    options.onPlayerListUpdate?.(["TargetPlayer", "SrgGld"]);
  },
  sleep: async () => undefined,
  random: () => 0
});

void test("runPlayersCommand logs players list", async () => {
  const events: string[] = [];
  await runPlayersCommand({
    accountName: "user",
    host: "127.0.0.1",
    port: 19132,
    serverName: undefined,
    transport: "raknet",
    discoveryTimeoutMs: 1,
    cacheDirectory: undefined,
    keyFilePath: undefined,
    environmentKey: undefined,
    joinTimeoutMs: 1,
    forceRefresh: false,
    skipPing: false,
    raknetBackend: DEFAULT_RAKNET_BACKEND,
    waitMs: 1
  }, createLogger(events), createDependencies());
  assert.equal(events.includes("players_probe_start"), true);
  assert.equal(events.includes("players_snapshot"), true);
  assert.equal(events.includes("players_result"), true);
});

void test("runPlayersCommand logs empty list when no players observed", async () => {
  const events: string[] = [];
  const dependencies = createDependencies();
  dependencies.joinBedrockServer = async () => undefined;
  await runPlayersCommand({
    accountName: "user",
    host: "127.0.0.1",
    port: 19132,
    serverName: undefined,
    transport: "raknet",
    discoveryTimeoutMs: 1,
    cacheDirectory: undefined,
    keyFilePath: undefined,
    environmentKey: undefined,
    joinTimeoutMs: 1,
    forceRefresh: false,
    skipPing: false,
    raknetBackend: DEFAULT_RAKNET_BACKEND,
    waitMs: 1
  }, createLogger(events), dependencies);
  assert.equal(events.includes("players_empty"), true);
});
