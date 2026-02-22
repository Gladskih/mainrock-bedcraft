import assert from "node:assert/strict";
import { test } from "node:test";
import type { Authflow } from "prismarine-auth";
import type { Logger } from "pino";
import { runJoinCommand, type JoinCommandOptions, type JoinDependencies } from "../../src/command-line/runJoinCommand.js";
import {
  DEFAULT_BEDROCK_PORT,
  DEFAULT_RAKNET_BACKEND,
  MOVEMENT_GOAL_FOLLOW_COORDINATES,
  MOVEMENT_GOAL_FOLLOW_PLAYER,
  MOVEMENT_GOAL_SAFE_WALK,
  MOVEMENT_SPEED_MODE_FIXED,
  MOVEMENT_SPEED_MODE_CALIBRATE
} from "../../src/constants.js";
import { selectServerByName } from "../../src/bedrock/serverSelection.js";

type JoinCall = {
  host: string;
  port: number;
  skipPing: boolean;
  raknetBackend: string;
  transport: string;
  movementGoal: string;
  movementSpeedMode?: string;
  initialSpeedBlocksPerSecond?: number;
  followPlayerName: string | undefined;
  followCoordinates: { x: number; y: number; z: number } | undefined;
  onMovementSpeedCalibrated?: (speedBlocksPerSecond: number) => void | Promise<void>;
  nethernetServerId?: bigint;
  minecraftVersion?: string;
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
        host: options.host,
        port: options.port,
        skipPing: options.skipPing,
        raknetBackend: options.raknetBackend,
        transport: options.transport,
        movementGoal: options.movementGoal,
        ...(options.movementSpeedMode !== undefined ? { movementSpeedMode: options.movementSpeedMode } : {}),
        ...(options.initialSpeedBlocksPerSecond !== undefined
          ? { initialSpeedBlocksPerSecond: options.initialSpeedBlocksPerSecond }
          : {}),
        followPlayerName: options.followPlayerName,
        followCoordinates: options.followCoordinates,
        ...(options.onMovementSpeedCalibrated !== undefined
          ? { onMovementSpeedCalibrated: options.onMovementSpeedCalibrated }
          : {}),
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
    movementSpeedMode: MOVEMENT_SPEED_MODE_FIXED,
    followPlayerName: undefined,
    followCoordinates: undefined
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
    movementSpeedMode: MOVEMENT_SPEED_MODE_FIXED,
    followPlayerName: undefined,
    followCoordinates: undefined
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
  assert.equal(calls.join?.movementSpeedMode, MOVEMENT_SPEED_MODE_FIXED);
  assert.equal(calls.join?.followPlayerName, "TargetPlayer");
  assert.equal(calls.join?.followCoordinates, undefined);
});

void test("runJoinCommand passes follow-coordinates goal", async () => {
  const { dependencies, calls } = createDependencies();
  await runJoinCommand(
    createBaseJoinOptions({
      movementGoal: MOVEMENT_GOAL_FOLLOW_COORDINATES,
      followCoordinates: { x: -2962, y: 65, z: -2100 }
    }),
    createLogger(),
    dependencies
  );
  assert.equal(calls.join?.movementGoal, MOVEMENT_GOAL_FOLLOW_COORDINATES);
  assert.deepEqual(calls.join?.followCoordinates, { x: -2962, y: 65, z: -2100 });
});

void test("runJoinCommand enables calibration mode and receives calibration callback", async () => {
  const { dependencies, calls } = createDependencies();
  await runJoinCommand(
    createBaseJoinOptions({
      movementSpeedMode: MOVEMENT_SPEED_MODE_CALIBRATE
    }),
    createLogger(),
    dependencies
  );
  assert.equal(calls.join?.movementSpeedMode, MOVEMENT_SPEED_MODE_CALIBRATE);
  assert.equal(typeof calls.join?.onMovementSpeedCalibrated, "function");
});
