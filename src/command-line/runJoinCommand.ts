import type { Logger } from "pino";
import {
  APPLICATION_ID,
  DEFAULT_MOVEMENT_SPEED_MODE,
  DEFAULT_RECONNECT_BASE_DELAY_MS,
  DEFAULT_RECONNECT_JITTER_RATIO,
  DEFAULT_RECONNECT_MAX_DELAY_MS,
  DEFAULT_RECONNECT_MAX_RETRIES,
  MOVEMENT_SPEED_MODE_CALIBRATE,
  MOVEMENT_SPEED_MODE_FIXED,
  MOVEMENT_SPEED_PROFILE_FILE_NAME,
  type MovementGoal,
  type MovementSpeedMode,
  type RaknetBackend
} from "../constants.js";
import type { Vector3 } from "../bedrock/joinClientHelpers.js";
import { createAuthFlow } from "../authentication/authFlow.js";
import { resolveCachePaths } from "../authentication/cachePaths.js";
import { discoverLanServers } from "../bedrock/lanDiscovery.js";
import { joinBedrockServer } from "../bedrock/joinClient.js";
import { calculateReconnectDelayMs } from "../bedrock/reconnectPolicy.js";
import { selectServerByName } from "../bedrock/serverSelection.js";
import { discoverNethernetLanServers } from "../nethernet/lanDiscovery.js";
import { createJoinRuntimeStateMachine } from "./joinRuntimeStateMachine.js";
import { createMovementSpeedProfileStore, toMovementSpeedProfileKey } from "../bot/movementSpeedProfileStore.js";
import { resolveNethernetTarget, resolveRaknetTarget } from "./joinTargetResolution.js";
import { join as joinPath } from "node:path";

export type JoinCommandOptions = {
  accountName: string;
  host: string | undefined;
  port: number;
  serverName: string | undefined;
  transport: "raknet" | "nethernet";
  discoveryTimeoutMs: number;
  cacheDirectory: string | undefined;
  keyFilePath: string | undefined;
  environmentKey: string | undefined;
  minecraftVersion: string | undefined;
  joinTimeoutMs: number;
  disconnectAfterFirstChunk: boolean;
  forceRefresh: boolean;
  raknetBackend: RaknetBackend;
  skipPing: boolean;
  movementGoal: MovementGoal;
  followPlayerName: string | undefined;
  followCoordinates: Vector3 | undefined;
  movementSpeedMode?: MovementSpeedMode;
  speedProfileFilePath?: string;
  viewDistanceChunks?: number;
  reconnectMaxRetries?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  listPlayersOnly?: boolean;
  playerListWaitMs?: number;
  onPlayerListUpdate?: (players: string[]) => void;
};

export type JoinDependencies = {
  resolveCachePaths: typeof resolveCachePaths;
  discoverLanServers: typeof discoverLanServers;
  discoverNethernetLanServers: typeof discoverNethernetLanServers;
  selectServerByName: typeof selectServerByName;
  createAuthFlow: typeof createAuthFlow;
  joinBedrockServer: typeof joinBedrockServer;
  sleep: (timeoutMs: number) => Promise<void>;
  random: () => number;
};

const defaultJoinDependencies: JoinDependencies = {
  resolveCachePaths,
  discoverLanServers,
  discoverNethernetLanServers,
  selectServerByName,
  createAuthFlow,
  joinBedrockServer,
  sleep: (timeoutMs) => new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  random: () => Math.random()
};

export const runJoinCommand = async (
  options: JoinCommandOptions,
  logger: Logger,
  dependencies: JoinDependencies = defaultJoinDependencies
): Promise<void> => {
  const joinRuntimeStateMachine = createJoinRuntimeStateMachine(logger);
  const cachePaths = dependencies.resolveCachePaths(APPLICATION_ID);
  const cacheDirectory = options.cacheDirectory ?? cachePaths.cacheDirectory;
  const keyFilePath = options.keyFilePath ?? cachePaths.keyFilePath;
  const speedProfileFilePath = options.speedProfileFilePath
    ?? joinPath(cacheDirectory, MOVEMENT_SPEED_PROFILE_FILE_NAME);
  const movementSpeedProfileStore = createMovementSpeedProfileStore(speedProfileFilePath);
  const movementSpeedMode = options.movementSpeedMode ?? DEFAULT_MOVEMENT_SPEED_MODE;
  if (!options.host && !options.serverName) throw new Error("Either host or server name must be provided");
  const authFlowResult = dependencies.createAuthFlow({
    accountName: options.accountName,
    cacheDirectory,
    keyFilePath,
    environmentKey: options.environmentKey,
    forceRefresh: options.forceRefresh,
    deviceCodeCallback: (code) => {
      logger.info({
        event: "device_code",
        verificationUri: code.verification_uri,
        userCode: code.user_code,
        expiresInSeconds: code.expires_in,
        intervalSeconds: code.interval
      }, "Complete Microsoft login in your browser");
    }
  });
  logger.info({ event: "auth_cache", cacheDirectory, keySource: authFlowResult.keySource }, "Authentication cache ready");
  joinRuntimeStateMachine.transitionTo("auth_ready");
  const reconnectMaxRetries = options.reconnectMaxRetries ?? DEFAULT_RECONNECT_MAX_RETRIES;
  const reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS;
  const reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS;
  for (let attempt = 0; ; attempt += 1) {
    joinRuntimeStateMachine.transitionTo("discovering", { attempt: attempt + 1, transport: options.transport });
    const target = options.transport === "nethernet"
      ? await resolveNethernetTarget(options, logger, dependencies)
      : await resolveRaknetTarget(options, logger, dependencies);
    const speedProfileKey = toMovementSpeedProfileKey({
      transport: options.transport,
      host: target.host,
      port: target.port,
      serverId: target.speedProfileServerId ?? null
    });
    const persistedSpeedBlocksPerSecond = await movementSpeedProfileStore.readSpeed(speedProfileKey);
    if (persistedSpeedBlocksPerSecond !== null) {
      logger.info(
        {
          event: "movement_speed_profile_loaded",
          profileKey: speedProfileKey,
          speedBlocksPerSecond: persistedSpeedBlocksPerSecond,
          mode: movementSpeedMode
        },
        "Loaded persisted movement speed profile"
      );
    }
    joinRuntimeStateMachine.transitionTo("connecting", { attempt: attempt + 1, host: target.host, port: target.port });
    try {
      await dependencies.joinBedrockServer({
        host: target.host,
        port: target.port,
        accountName: options.accountName,
        authflow: authFlowResult.authflow,
        logger,
        serverName: target.serverName,
        disconnectAfterFirstChunk: options.disconnectAfterFirstChunk,
        skipPing: options.transport === "nethernet" ? true : options.skipPing,
        raknetBackend: options.raknetBackend,
        transport: options.transport,
        joinTimeoutMs: options.joinTimeoutMs,
        movementGoal: options.movementGoal,
        followPlayerName: options.followPlayerName,
        followCoordinates: options.followCoordinates,
        movementSpeedMode,
        ...(persistedSpeedBlocksPerSecond !== null
          ? { initialSpeedBlocksPerSecond: persistedSpeedBlocksPerSecond }
          : {}),
        ...(movementSpeedMode === MOVEMENT_SPEED_MODE_CALIBRATE
          ? {
            onMovementSpeedCalibrated: async (calibratedSpeedBlocksPerSecond: number) => {
              await movementSpeedProfileStore.writeSpeed(speedProfileKey, calibratedSpeedBlocksPerSecond);
              logger.info(
                {
                  event: "movement_speed_profile_saved",
                  profileKey: speedProfileKey,
                  speedBlocksPerSecond: calibratedSpeedBlocksPerSecond,
                  nextDefaultMode: MOVEMENT_SPEED_MODE_FIXED
                },
                "Saved calibrated movement speed profile"
              );
            }
          }
          : {}),
        ...(options.viewDistanceChunks !== undefined ? { viewDistanceChunks: options.viewDistanceChunks } : {}),
        ...(options.listPlayersOnly !== undefined ? { listPlayersOnly: options.listPlayersOnly } : {}),
        ...(options.playerListWaitMs !== undefined ? { playerListWaitMs: options.playerListWaitMs } : {}),
        ...(options.onPlayerListUpdate !== undefined ? { onPlayerListUpdate: options.onPlayerListUpdate } : {}),
        ...(options.minecraftVersion !== undefined ? { minecraftVersion: options.minecraftVersion } : {}),
        ...(target.nethernetServerId !== undefined ? { nethernetServerId: target.nethernetServerId } : {}),
        onConnectionStateChange: (stateChange) => {
          if (stateChange.state === "online") {
            joinRuntimeStateMachine.transitionTo("online", { attempt: attempt + 1, reason: stateChange.reason });
            return;
          }
          if (stateChange.state === "offline") {
            const currentState = joinRuntimeStateMachine.getState();
            if (currentState === "online" || currentState === "connecting") {
              joinRuntimeStateMachine.transitionTo("offline", { attempt: attempt + 1, reason: stateChange.reason });
            }
          }
        }
      });
      if (joinRuntimeStateMachine.getState() === "connecting") {
        joinRuntimeStateMachine.transitionTo("online", { attempt: attempt + 1, reason: "session_completed_without_join_signal" });
      }
      if (joinRuntimeStateMachine.getState() === "online") {
        joinRuntimeStateMachine.transitionTo("offline", { attempt: attempt + 1, reason: "session_completed" });
      }
      return;
    } catch (error) {
      if (attempt >= reconnectMaxRetries) {
        joinRuntimeStateMachine.transitionTo("failed", { attempt: attempt + 1, error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
      const delayMs = calculateReconnectDelayMs({
        attempt,
        baseDelayMs: reconnectBaseDelayMs,
        maxDelayMs: reconnectMaxDelayMs,
        jitterRatio: DEFAULT_RECONNECT_JITTER_RATIO,
        random: dependencies.random
      });
      joinRuntimeStateMachine.transitionTo("retry_waiting", { attempt: attempt + 1, delayMs });
      logger.warn(
        {
          event: "reconnect_retry",
          attempt: attempt + 1,
          maxRetries: reconnectMaxRetries,
          delayMs,
          error: error instanceof Error ? error.message : String(error)
        },
        "Join failed, retrying"
      );
      await dependencies.sleep(delayMs);
    }
  }
};
