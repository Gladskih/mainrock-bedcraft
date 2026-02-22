import {
  DEFAULT_BOT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_CHUNK_PROGRESS_LOG_INTERVAL,
  DEFAULT_JOIN_TIMEOUT_MS,
  DEFAULT_PLAYER_LIST_SETTLE_MS,
  DEFAULT_PLAYER_LIST_WAIT_MS,
  DEFAULT_REQUEST_CHUNK_RADIUS_DELAY_MS,
  DEFAULT_VIEW_DISTANCE_CHUNKS
} from "../constants.js";
import { disconnectClient, isRecoverableReadError } from "./clientConnectionCleanup.js";
import type { JoinOptions } from "./joinClient.js";
import {
  getProfileName,
  isLevelChunkPacket,
  isStartGamePacket,
  isVector3,
  readOptionalBigIntField,
  readPacketId,
  readOptionalStringField, readPacketEventName, toChunkKey, toError, type Vector3
} from "./joinClientHelpers.js";
import { createSessionClient } from "./sessionClientFactory.js";
import { createPlayerTrackingState } from "./playerTrackingState.js";
import { createPlayerListState } from "./playerListState.js";
import { createPlayerListProbe } from "./playerListProbe.js";
import { createChunkPublisherUpdateLogger } from "./joinClientChunkPublisherLogger.js";
import { attachMovementPacketHandlers } from "./joinClientSessionMovementHandlers.js";
import { configurePostJoinPackets } from "./postJoinPackets.js";
import { toStartGameLogFields } from "./sessionWorldLogging.js";
import { startSessionMovementLoopWithPlanner } from "./sessionMovementPlanner.js";
import { toRuntimeHeartbeatLogFields } from "./sessionRuntimeHeartbeat.js";
import { createSessionTerrainNavigation } from "./sessionTerrainNavigation.js";
import { createWorldStateBridge } from "./worldStateBridge.js";
export const createJoinPromise = (resolvedOptions: JoinOptions): Promise<void> => new Promise((resolve, reject) => {
    const client = createSessionClient(resolvedOptions);
    let firstChunk = false; let finished = false;
    let shutdownRequested = false;
    let authenticatedPlayerName: string | null = null;
    let chunkPacketCount = 0;
    let inputTick = 0n;
    let currentPosition: Vector3 | null = null;
    let movementLoop: { cleanup: () => void } | null = null;
    let runtimeHeartbeatId: ReturnType<typeof setInterval> | null = null;
    const terrainNavigation = createSessionTerrainNavigation(client, resolvedOptions.logger);
    const worldStateBridge = createWorldStateBridge();
    const setCurrentPosition = (position: Vector3): void => { currentPosition = position; };
    const playerTrackingState = createPlayerTrackingState(resolvedOptions.logger, resolvedOptions.followPlayerName);
    const listPlayersOnly = resolvedOptions.listPlayersOnly ?? false;
    const playerListWaitMs = resolvedOptions.playerListWaitMs ?? DEFAULT_PLAYER_LIST_WAIT_MS;
    const playerListProbe = createPlayerListProbe({
      enabled: listPlayersOnly,
      maxWaitMs: playerListWaitMs,
      settleWaitMs: DEFAULT_PLAYER_LIST_SETTLE_MS,
      onElapsed: () => { finish(); disconnectClient(client); }
    });
    const handlePlayerListUpdate = listPlayersOnly
      ? (players: string[]) => {
        resolvedOptions.onPlayerListUpdate?.(players);
        if (authenticatedPlayerName && players.some((name) => name !== authenticatedPlayerName)) {
          playerListProbe.completeNow();
          return;
        }
        if (players.length === 0) return;
        playerListProbe.notePlayersObserved();
      }
      : (players: string[]) => {
        resolvedOptions.onPlayerListUpdate?.(players);
      };
    const playerListState = createPlayerListState({ onUpdate: handlePlayerListUpdate });
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
    const chunkProgressLogInterval = DEFAULT_CHUNK_PROGRESS_LOG_INTERVAL;
    const runtimeHeartbeatIntervalMs = DEFAULT_BOT_HEARTBEAT_INTERVAL_MS;
    const postJoin = configurePostJoinPackets(
      client,
      resolvedOptions.logger,
      requestChunkRadiusDelayMs,
      viewDistanceChunks
    );
    const logChunkPublisherUpdate = createChunkPublisherUpdateLogger(resolvedOptions.logger);
    const clearJoinTimeout = () => {
      if (!joinTimeoutId) return;
      clearTimeout(joinTimeoutId);
      joinTimeoutId = null;
    };
    const startRuntimeHeartbeat = () => {
      if (runtimeHeartbeatId) return;
      runtimeHeartbeatId = setInterval(() => {
        const botWorldSnapshot = worldStateBridge.getSnapshot();
        resolvedOptions.logger.info(toRuntimeHeartbeatLogFields({
          chunkPackets: chunkPacketCount,
          uniqueChunks: loadedChunks.size,
          dimension: botWorldSnapshot.localPlayer.dimension,
          position: botWorldSnapshot.localPlayer.position,
          simulatedPosition: currentPosition,
          movementGoal: resolvedOptions.movementGoal,
          followCoordinates: resolvedOptions.followCoordinates
        }), "Bot runtime heartbeat");
      }, runtimeHeartbeatIntervalMs);
    };
    const handleUncaughtException = (error: Error) => { fail(toError(error)); disconnectClient(client); };
    const handleUnhandledRejection = (reason: unknown) => { fail(toError(reason)); disconnectClient(client); };
    const removeProcessErrorHandlers = () => {
      process.removeListener("uncaughtException", handleUncaughtException);
      process.removeListener("unhandledRejection", handleUnhandledRejection);
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      resolvedOptions.onConnectionStateChange?.({ state: "offline", reason: "session_finished" });
      cleanup();
      resolve();
    };
    const fail = (error: Error) => {
      if (finished) return;
      finished = true;
      resolvedOptions.onConnectionStateChange?.({ state: "offline", reason: "session_failed" });
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
      playerListProbe.clear();
      if (runtimeHeartbeatId) clearInterval(runtimeHeartbeatId);
      runtimeHeartbeatId = null;
      movementLoop?.cleanup();
      terrainNavigation.cleanup();
      movementLoop = null;
      postJoin.cleanup();
    };
    const onJoinAuthenticated = (): void => { if (listPlayersOnly) { clearJoinTimeout(); playerListProbe.start(); } };
    const handleFirstChunk = resolvedOptions.disconnectAfterFirstChunk
      ? () => {
        finish();
        disconnectClient(client);
      }
      : listPlayersOnly
        ? () => undefined
        : () => {
          startRuntimeHeartbeat();
        };
    const startMovementLoopIfNeeded = (): void => {
      if (listPlayersOnly || movementLoop) return;
      movementLoop = startSessionMovementLoopWithPlanner({
        client,
        resolvedOptions,
        playerTrackingState,
        getPosition: () => currentPosition,
        getTick: () => { inputTick += 1n; return inputTick; },
        setPosition: (position) => { currentPosition = position; },
        getLocalRuntimeEntityId: () => worldStateBridge.getSnapshot().localPlayer.runtimeEntityId,
        terrainNavigation
      });
    };
    const handleChunkProgress = listPlayersOnly
      ? () => undefined
      : () => {
        if (chunkPacketCount % chunkProgressLogInterval !== 0) return;
        resolvedOptions.logger.info(
          { event: "chunk_progress", chunkPackets: chunkPacketCount, uniqueChunks: loadedChunks.size },
          "Streaming world chunks"
        );
      };
    process.once("SIGINT", handleSignal);
    process.on("uncaughtException", handleUncaughtException);
    process.on("unhandledRejection", handleUnhandledRejection);
    resolvedOptions.logger.info({
      event: "connect",
      host: resolvedOptions.host, port: resolvedOptions.port,
      serverName: resolvedOptions.serverName ?? null,
      serverId: resolvedOptions.nethernetServerId?.toString() ?? null,
      chunkRadiusSoftCap: viewDistanceChunks
    }, "Connecting to server");
    resolvedOptions.onConnectionStateChange?.({ state: "connecting", reason: "connect_start" });
    client.on("packet", (packet) => {
      const name = readPacketEventName(packet);
      if (!name) return;
      lastPacketName = name;
      lastPacketAtMs = Date.now();
    });
    client.on("loggingIn", () => { resolvedOptions.logger.info({ event: "logging_in" }, "Sending login"); });
    client.on("client.server_handshake", () => {
      resolvedOptions.logger.info({ event: "server_handshake" }, "Received server handshake");
    });
    client.on("play_status", (packet) => {
      const status = readOptionalStringField(packet, "status");
      resolvedOptions.logger.info({ event: "play_status", status }, "Received play status");
    });
    client.on("join", () => {
      authenticatedPlayerName = getProfileName(client);
      worldStateBridge.setAuthenticatedPlayerName(authenticatedPlayerName);
      resolvedOptions.onConnectionStateChange?.({ state: "online", reason: "join_authenticated" });
      resolvedOptions.logger.info({ event: "join", playerName: authenticatedPlayerName }, "Authenticated with server");
      onJoinAuthenticated();
    });
    client.on("start_game", (packet) => {
      if (!isStartGamePacket(packet)) return;
      const localRuntimeEntityId = readPacketId(packet, ["runtime_entity_id", "runtime_id"]);
      playerTrackingState.setLocalRuntimeEntityId(localRuntimeEntityId);
      const position = isVector3(packet.player_position) ? packet.player_position : null;
      const currentTick = readOptionalBigIntField(packet, "current_tick");
      if (currentTick !== null) inputTick = currentTick;
      worldStateBridge.setLocalFromStartGame(localRuntimeEntityId, packet.dimension ?? null, position);
      currentPosition = position;
      resolvedOptions.logger.info(toStartGameLogFields(resolvedOptions, client, packet, localRuntimeEntityId, position), "Received start game");
    });
    client.on("network_chunk_publisher_update", (packet) => {
      logChunkPublisherUpdate(packet);
    });
    client.on("spawn", () => {
      const localPlayer = worldStateBridge.getSnapshot().localPlayer;
      resolvedOptions.logger.info(
        {
          event: "spawn",
          playerName: getProfileName(client),
          dimension: localPlayer.dimension,
          position: localPlayer.position
        },
        "Spawn confirmed"
      );
      startMovementLoopIfNeeded();
    });
    client.on("add_player", (packet) => {
      worldStateBridge.handleAddPlayerPacket(packet); playerTrackingState.handleAddPlayerPacket(packet);
      playerListState.handleAddPlayerPacket(packet);
    });
    client.on("add_entity", (packet) => { worldStateBridge.handleAddEntityPacket(packet); });
    client.on("player_list", (packet) => { playerListState.handlePlayerListPacket(packet); });
    client.on("remove_entity", (packet) => { worldStateBridge.handleRemoveEntityPacket(packet);
      playerTrackingState.handleRemoveEntityPacket(packet); });
    client.on("level_chunk", (packet) => {
      if (!isLevelChunkPacket(packet)) return;
      if (packet.x === undefined || packet.z === undefined) return;
      chunkPacketCount += 1;
      loadedChunks.add(toChunkKey(packet.x, packet.z));
      if (!firstChunk) {
        firstChunk = true;
        clearJoinTimeout();
        resolvedOptions.logger.info(
          {
            event: "chunk",
            chunkX: packet.x,
            chunkZ: packet.z,
            chunkPackets: chunkPacketCount,
            uniqueChunks: loadedChunks.size
          },
          "Received first chunk"
        );
        handleFirstChunk();
        return;
      }
      handleChunkProgress();
    });
    client.on("close", (reason) => {
      if (finished) return;
      if (shutdownRequested) { finish(); return; }
      fail(new Error(`Server closed connection: ${reason ?? "unknown"}`));
    });
    attachMovementPacketHandlers({
      client,
      logger: resolvedOptions.logger,
      worldStateBridge,
      playerTrackingState,
      setCurrentPosition
    });
    client.on("error", (error) => {
      const normalizedError = toError(error);
      if (!firstChunk && isRecoverableReadError(normalizedError)) {
        resolvedOptions.logger.info(
          { event: "join_error_ignored", error: normalizedError.message },
          "Ignoring recoverable packet read error"
        );
        return;
      }
      fail(normalizedError);
      disconnectClient(client);
    });
  });
