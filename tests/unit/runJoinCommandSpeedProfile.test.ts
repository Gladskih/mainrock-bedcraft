import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { test } from "node:test";
import type { Authflow } from "prismarine-auth";
import type { Logger } from "pino";
import { createMovementSpeedProfileStore, toMovementSpeedProfileKey } from "../../src/bot/movementSpeedProfileStore.js";
import { runJoinCommand, type JoinCommandOptions, type JoinDependencies } from "../../src/command-line/runJoinCommand.js";
import {
  DEFAULT_BEDROCK_PORT,
  DEFAULT_RAKNET_BACKEND,
  MOVEMENT_GOAL_SAFE_WALK,
  MOVEMENT_SPEED_MODE_CALIBRATE,
  MOVEMENT_SPEED_MODE_FIXED
} from "../../src/constants.js";
import { selectServerByName } from "../../src/bedrock/serverSelection.js";

type JoinCall = {
  initialSpeedBlocksPerSecond?: number;
};

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
        ...(options.initialSpeedBlocksPerSecond !== undefined
          ? { initialSpeedBlocksPerSecond: options.initialSpeedBlocksPerSecond }
          : {})
      };
      if (!options.onMovementSpeedCalibrated) return;
      await options.onMovementSpeedCalibrated(1.42);
    },
    sleep: async () => undefined,
    random: () => 0
  };
  return { calls, dependencies };
};

void test("runJoinCommand loads persisted speed profile and passes it to join", async () => {
  const { dependencies, calls } = createDependencies();
  const directoryPath = await mkdtemp(joinPath(tmpdir(), "run-join-profile-"));
  const profileFilePath = joinPath(directoryPath, "speed-profile.json");
  const profileStore = createMovementSpeedProfileStore(profileFilePath);
  const profileKey = toMovementSpeedProfileKey({
    transport: "raknet",
    host: "127.0.0.1",
    port: DEFAULT_BEDROCK_PORT,
    serverId: null
  });
  await profileStore.writeSpeed(profileKey, 1.33);
  await runJoinCommand(
    createBaseJoinOptions({
      speedProfileFilePath: profileFilePath
    }),
    createLogger(),
    dependencies
  );
  assert.equal(calls.join?.initialSpeedBlocksPerSecond, 1.33);
});

void test("runJoinCommand saves calibrated speed profile", async () => {
  const { dependencies } = createDependencies();
  const directoryPath = await mkdtemp(joinPath(tmpdir(), "run-join-profile-"));
  const profileFilePath = joinPath(directoryPath, "speed-profile.json");
  await runJoinCommand(
    createBaseJoinOptions({
      speedProfileFilePath: profileFilePath,
      movementSpeedMode: MOVEMENT_SPEED_MODE_CALIBRATE
    }),
    createLogger(),
    dependencies
  );
  const profileStore = createMovementSpeedProfileStore(profileFilePath);
  const profileKey = toMovementSpeedProfileKey({
    transport: "raknet",
    host: "127.0.0.1",
    port: DEFAULT_BEDROCK_PORT,
    serverId: null
  });
  const persistedSpeed = await profileStore.readSpeed(profileKey);
  assert.equal(persistedSpeed, 1.42);
});
