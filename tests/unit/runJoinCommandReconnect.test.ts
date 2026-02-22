import assert from "node:assert/strict";
import { test } from "node:test";
import type { Authflow } from "prismarine-auth";
import type { Logger } from "pino";
import { runJoinCommand, type JoinCommandOptions, type JoinDependencies } from "../../src/command-line/runJoinCommand.js";
import {
  DEFAULT_BEDROCK_PORT,
  DEFAULT_RAKNET_BACKEND,
  MOVEMENT_GOAL_SAFE_WALK,
  MOVEMENT_SPEED_MODE_FIXED
} from "../../src/constants.js";
import { selectServerByName } from "../../src/bedrock/serverSelection.js";

const createLogger = (): Logger => ({
  info: () => undefined,
  warn: () => undefined
} as unknown as Logger);

const hasOverride = <K extends keyof JoinCommandOptions>(
  overrides: Partial<JoinCommandOptions>,
  key: K
): boolean => Object.prototype.hasOwnProperty.call(overrides, key);

const createBaseJoinOptions = (overrides: Partial<JoinCommandOptions> = {}): JoinCommandOptions => ({
  accountName: overrides.accountName ?? "user",
  host: hasOverride(overrides, "host") ? overrides.host : "127.0.0.1",
  port: overrides.port ?? DEFAULT_BEDROCK_PORT,
  serverName: hasOverride(overrides, "serverName") ? overrides.serverName : undefined,
  transport: overrides.transport ?? "raknet",
  discoveryTimeoutMs: overrides.discoveryTimeoutMs ?? 1,
  cacheDirectory: overrides.cacheDirectory ?? undefined,
  keyFilePath: overrides.keyFilePath ?? undefined,
  environmentKey: overrides.environmentKey ?? undefined,
  minecraftVersion: overrides.minecraftVersion ?? undefined,
  joinTimeoutMs: overrides.joinTimeoutMs ?? 1,
  disconnectAfterFirstChunk: overrides.disconnectAfterFirstChunk ?? true,
  forceRefresh: overrides.forceRefresh ?? false,
  skipPing: overrides.skipPing ?? false,
  raknetBackend: overrides.raknetBackend ?? DEFAULT_RAKNET_BACKEND,
  movementGoal: overrides.movementGoal ?? MOVEMENT_GOAL_SAFE_WALK,
  followPlayerName: overrides.followPlayerName ?? undefined,
  followCoordinates: overrides.followCoordinates ?? undefined,
  movementSpeedMode: overrides.movementSpeedMode ?? MOVEMENT_SPEED_MODE_FIXED,
  ...(overrides.speedProfileFilePath !== undefined ? { speedProfileFilePath: overrides.speedProfileFilePath } : {}),
  ...(overrides.viewDistanceChunks !== undefined ? { viewDistanceChunks: overrides.viewDistanceChunks } : {}),
  ...(overrides.reconnectMaxRetries !== undefined ? { reconnectMaxRetries: overrides.reconnectMaxRetries } : {}),
  ...(overrides.reconnectBaseDelayMs !== undefined ? { reconnectBaseDelayMs: overrides.reconnectBaseDelayMs } : {}),
  ...(overrides.reconnectMaxDelayMs !== undefined ? { reconnectMaxDelayMs: overrides.reconnectMaxDelayMs } : {}),
  ...(overrides.listPlayersOnly !== undefined ? { listPlayersOnly: overrides.listPlayersOnly } : {}),
  ...(overrides.playerListWaitMs !== undefined ? { playerListWaitMs: overrides.playerListWaitMs } : {}),
  ...(overrides.onPlayerListUpdate !== undefined ? { onPlayerListUpdate: overrides.onPlayerListUpdate } : {})
});

const createDependencies = (): JoinDependencies => ({
  resolveCachePaths: () => ({ cacheDirectory: "cache", keyFilePath: "key" }),
  discoverLanServers: async () => [],
  discoverNethernetLanServers: async () => [],
  selectServerByName,
  createAuthFlow: () => ({ authflow: { username: "user" } as Authflow, keySource: "environment" }),
  joinBedrockServer: async () => undefined,
  sleep: async () => undefined,
  random: () => 0
});

void test("runJoinCommand retries after failed join and then succeeds", async () => {
  const dependencies = createDependencies();
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
  const dependencies = createDependencies();
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
  const dependencies = createDependencies();
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
