import { createClient } from "bedrock-protocol";
import { randomBytes } from "node:crypto";
import type { ClientOptions } from "bedrock-protocol";
import {
  DEFAULT_BOT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_CHUNK_PROGRESS_LOG_INTERVAL,
  DEFAULT_JOIN_TIMEOUT_MS,
  DEFAULT_REQUEST_CHUNK_RADIUS_DELAY_MS,
  DEFAULT_VIEW_DISTANCE_CHUNKS
} from "../constants.js";
import type { AuthenticatedClientOptions } from "./authenticatedClientOptions.js";
import { disconnectClient, isRecoverableReadError } from "./clientConnectionCleanup.js";
import type { ClientLike } from "./clientTypes.js";
import { getAvailableProgressionTasks, type ProgressionTaskId, type ResourceType } from "../bot/progressionPlan.js";
import type { JoinOptions } from "./joinClient.js";
import {
  getProfileName,
  isLevelChunkPacket,
  isStartGamePacket,
  isVector3,
  readPacketId,
  readOptionalStringField,
  readPacketEventName,
  toChunkKey,
  toError,
  type StartGamePacket,
  type Vector3
} from "./joinClientHelpers.js";
import { configurePostJoinPackets } from "./postJoinPackets.js";
import { createNethernetClient } from "./nethernetClientFactory.js";
import { createPlayerTrackingState } from "./playerTrackingState.js";
import { createSessionMovementLoop } from "./sessionMovementLoop.js";

const toClientOptions = (options: JoinOptions): AuthenticatedClientOptions => ({
  host: options.host,
  port: options.port,
  username: options.accountName,
  authflow: options.authflow,
  flow: "live",
  deviceType: "Nintendo",
  skipPing: options.skipPing,
  raknetBackend: options.raknetBackend,
  viewDistance: options.viewDistanceChunks ?? DEFAULT_VIEW_DISTANCE_CHUNKS,
  ...(options.minecraftVersion ? { version: options.minecraftVersion as unknown as NonNullable<ClientOptions["version"]> } : {}),
  conLog: null
});

const createRandomSenderId = (): bigint => randomBytes(8).readBigUInt64BE();
export const createJoinPromise = (resolvedOptions: JoinOptions): Promise<void> => new Promise((resolve, reject) => {
    const resolvedClientFactory = resolvedOptions.transport === "nethernet"
    ? () => {
      if (!resolvedOptions.nethernetServerId) throw new Error("NetherNet join requires serverId from discovery");
      return (resolvedOptions.nethernetClientFactory ?? createNethernetClient)(
        toClientOptions({ ...resolvedOptions, skipPing: true }),
        resolvedOptions.logger,
        resolvedOptions.nethernetServerId,
        resolvedOptions.nethernetClientId ?? createRandomSenderId()
      );
    }
    : () => (resolvedOptions.clientFactory ?? createClient)(toClientOptions(resolvedOptions)) as ClientLike;
    const client = resolvedClientFactory();
    let startGamePacket: StartGamePacket | null = null;
    let firstChunk = false;
    let finished = false;
    let shutdownRequested = false;
    let chunkPacketCount = 0;
    let inputTick = 0n;
    let currentPosition: Vector3 | null = null;
    let movementLoop: { cleanup: () => void } | null = null;
    let runtimeHeartbeatId: ReturnType<typeof setInterval> | null = null;
    const playerTrackingState = createPlayerTrackingState(resolvedOptions.logger, resolvedOptions.followPlayerName);
    const completedTaskIds = new Set<ProgressionTaskId>();
    const discoveredResources = new Set<ResourceType>();
    const loadedChunks = new Set<string>();
    const joinTimeoutMs = resolvedOptions.joinTimeoutMs ?? DEFAULT_JOIN_TIMEOUT_MS;
    const viewDistanceChunks = resolvedOptions.viewDistanceChunks ?? DEFAULT_VIEW_DISTANCE_CHUNKS;
    const requestChunkRadiusDelayMs = DEFAULT_REQUEST_CHUNK_RADIUS_DELAY_MS;
    const joinStartedAtMs = Date.now();
    let lastPacketName: string | null = null;
    let lastPacketAtMs: number | null = null;
    let joinTimeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      const idleMs = lastPacketAtMs === null ? null : Math.max(0, Date.now() - lastPacketAtMs);
      const timeoutDetails = idleMs === null
        ? `last packet: ${lastPacketName ?? "none"}`
        : `last packet: ${lastPacketName ?? "none"}, idle: ${idleMs}ms`;
      joinTimeoutId = null;
      fail(new Error(`Join timed out after ${Math.max(0, Date.now() - joinStartedAtMs)}ms (${timeoutDetails})`));
      disconnectClient(client);
    }, joinTimeoutMs);
    const packetLogLimit = 50; // Log first few inbound packet names at debug to help diagnose join stalls without flooding.
    const chunkProgressLogInterval = DEFAULT_CHUNK_PROGRESS_LOG_INTERVAL;
    const runtimeHeartbeatIntervalMs = DEFAULT_BOT_HEARTBEAT_INTERVAL_MS;
    let packetLogs = 0;
    const postJoin = configurePostJoinPackets(
      client,
      resolvedOptions.logger,
      requestChunkRadiusDelayMs,
      viewDistanceChunks
    );
    const clearJoinTimeout = () => {
      if (!joinTimeoutId) return;
      clearTimeout(joinTimeoutId);
      joinTimeoutId = null;
    };
    const startRuntimeHeartbeat = () => {
      if (runtimeHeartbeatId) return;
      runtimeHeartbeatId = setInterval(() => {
        resolvedOptions.logger.info(
          {
            event: "runtime_heartbeat",
            chunkPackets: chunkPacketCount,
            uniqueChunks: loadedChunks.size,
            dimension: startGamePacket?.dimension ?? null
          },
          "Bot runtime heartbeat"
        );
      }, runtimeHeartbeatIntervalMs);
    };
    const handleUncaughtException = (error: Error) => {
      fail(toError(error));
      disconnectClient(client);
    };
    const handleUnhandledRejection = (reason: unknown) => {
      fail(toError(reason));
      disconnectClient(client);
    };
    const removeProcessErrorHandlers = () => {
      process.removeListener("uncaughtException", handleUncaughtException);
      process.removeListener("unhandledRejection", handleUnhandledRejection);
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve();
    };
    const fail = (error: Error) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(error);
    };
    const handleSignal = () => {
      if (finished) return;
      shutdownRequested = true;
      resolvedOptions.logger.info({ event: "signal", signal: "SIGINT" }, "Disconnecting from server");
      disconnectClient(client);
      finish();
    };
    const cleanup = () => {
      process.removeListener("SIGINT", handleSignal);
      removeProcessErrorHandlers();
      clearJoinTimeout();
      if (runtimeHeartbeatId) clearInterval(runtimeHeartbeatId);
      runtimeHeartbeatId = null;
      movementLoop?.cleanup();
      movementLoop = null;
      postJoin.cleanup();
    };
    process.once("SIGINT", handleSignal);
    process.on("uncaughtException", handleUncaughtException);
    process.on("unhandledRejection", handleUnhandledRejection);
    resolvedOptions.logger.info(
      {
        event: "connect",
        host: resolvedOptions.host,
        port: resolvedOptions.port,
        serverName: resolvedOptions.serverName ?? null,
        serverId: resolvedOptions.nethernetServerId ? resolvedOptions.nethernetServerId.toString() : null
      },
      "Connecting to server"
    );
    client.on("packet", (packet) => {
      const name = readPacketEventName(packet);
      if (!name) return;
      lastPacketName = name;
      lastPacketAtMs = Date.now();
      if (packetLogs >= packetLogLimit) return;
      packetLogs += 1;
      resolvedOptions.logger.debug({ event: "packet_in", name }, "Received packet");
    });
    client.on("loggingIn", () => {
      resolvedOptions.logger.info({ event: "logging_in" }, "Sending login");
    });
    client.on("client.server_handshake", () => {
      resolvedOptions.logger.info({ event: "server_handshake" }, "Received server handshake");
    });
    client.on("play_status", (packet) => {
      resolvedOptions.logger.info({ event: "play_status", status: readOptionalStringField(packet, "status") }, "Received play status");
    });
    client.on("join", () => {
      resolvedOptions.logger.info({ event: "join", playerName: getProfileName(client) }, "Authenticated with server");
    });
    client.on("start_game", (packet) => {
      if (!isStartGamePacket(packet)) return;
      startGamePacket = packet;
      const localRuntimeEntityId = readPacketId(packet, ["runtime_entity_id", "runtime_id"]);
      playerTrackingState.setLocalRuntimeEntityId(localRuntimeEntityId);
      const position = isVector3(packet.player_position) ? packet.player_position : null;
      currentPosition = position;
      resolvedOptions.logger.info(
        {
          event: "start_game",
          playerName: getProfileName(client),
          dimension: packet.dimension ?? null,
          position,
          runtimeEntityId: localRuntimeEntityId,
          levelId: packet.level_id ?? null,
          worldName: packet.world_name ?? null
        },
        "Received start game"
      );
    });
    client.on("spawn", () => {
      const position = startGamePacket && isVector3(startGamePacket.player_position)
        ? startGamePacket.player_position
        : null;
      resolvedOptions.logger.info(
        { event: "spawn", playerName: getProfileName(client), dimension: startGamePacket?.dimension ?? null, position },
        "Spawn confirmed"
      );
    });
    client.on("add_player", (packet) => {
      playerTrackingState.handleAddPlayerPacket(packet);
    });
    client.on("remove_entity", (packet) => {
      playerTrackingState.handleRemoveEntityPacket(packet);
    });
    client.on("level_chunk", (packet) => {
      if (!isLevelChunkPacket(packet)) return;
      if (packet.x === undefined || packet.z === undefined) return;
      chunkPacketCount += 1;
      loadedChunks.add(toChunkKey(packet.x, packet.z));
      if (!firstChunk) {
        firstChunk = true;
        clearJoinTimeout();
        startRuntimeHeartbeat();
        resolvedOptions.logger.info(
          { event: "chunk", chunkX: packet.x, chunkZ: packet.z, chunkPackets: chunkPacketCount, uniqueChunks: loadedChunks.size },
          "Received first chunk"
        );
        if (resolvedOptions.disconnectAfterFirstChunk) {
          finish();
          disconnectClient(client);
        } else {
          movementLoop = createSessionMovementLoop({
            client,
            logger: resolvedOptions.logger,
            movementGoal: resolvedOptions.movementGoal,
            followPlayerName: resolvedOptions.followPlayerName,
            getFollowTargetPosition: () => playerTrackingState.resolveFollowTargetPosition(),
            getPosition: () => currentPosition,
            setPosition: (position) => {
              currentPosition = position;
            },
            getTick: () => {
              inputTick += 1n;
              return inputTick;
            }
          });
          const initialTasks = getAvailableProgressionTasks(
            completedTaskIds,
            discoveredResources
          ).map((task) => task.id);
          resolvedOptions.logger.info({ event: "planner_bootstrap", nextTaskIds: initialTasks }, "Initialized progression planner");
        }
        return;
      }
      if (chunkPacketCount % chunkProgressLogInterval !== 0) return;
      resolvedOptions.logger.info(
        { event: "chunk_progress", chunkPackets: chunkPacketCount, uniqueChunks: loadedChunks.size },
        "Streaming world chunks"
      );
    });
    client.on("close", (reason) => {
      if (finished) return;
      if (shutdownRequested) {
        finish();
        return;
      }
      fail(new Error(`Server closed connection: ${reason ?? "unknown"}`));
    });
    client.on("move_player", (packet) => {
      playerTrackingState.handleMovePlayerPacket(packet, (position) => {
        currentPosition = position;
      });
    });
    client.on("error", (error) => {
      const normalizedError = toError(error);
      if (!firstChunk && isRecoverableReadError(normalizedError)) {
        resolvedOptions.logger.info({ event: "join_error_ignored", error: normalizedError.message }, "Ignoring recoverable packet read error");
        return;
      }
      fail(normalizedError);
      disconnectClient(client);
    });
  });
