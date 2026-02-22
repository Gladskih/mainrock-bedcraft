import type { Logger } from "pino";
import { createChunkTerrainMap } from "../bot/chunkTerrainMap.js";
import { createNavigationWaypointResolver } from "../bot/navigationWaypointResolver.js";
import {
  DEFAULT_NAVIGATION_CHUNK_READY_TIMEOUT_MS,
  DEFAULT_NAVIGATION_SUBCHUNK_MIN_SECTION_Y,
  DEFAULT_NAVIGATION_SUBCHUNK_REQUEST_COLUMN_LIMIT,
  DEFAULT_NAVIGATION_SUBCHUNK_SECTION_COUNT_FALLBACK,
  DEFAULT_NAVIGATION_SUBCHUNK_SECTION_COUNT_LIMIT
} from "../constants.js";
import type { ClientLike } from "./clientTypes.js";
import { isLevelChunkPacket, isSubChunkPacket, toChunkKey, type Vector3 } from "./joinClientHelpers.js";
import { readClientRegistryVersion } from "./navigationRegistryVersion.js";
type SubChunkRequestPayload = {
  dimension: number;
  origin: Vector3;
  requests: Array<{ dx: number; dy: number; dz: number }>;
};

export type SessionTerrainNavigation = {
  resolveWaypoint: (position: Vector3, target: Vector3 | null) => Vector3 | null;
  cleanup: () => void;
};

type SessionTerrainNavigationDependencies = {
  createChunkTerrainMap?: typeof createChunkTerrainMap;
  createNavigationWaypointResolver?: typeof createNavigationWaypointResolver;
  now?: () => number;
  chunkReadyTimeoutMs?: number;
  subChunkRequestColumnLimit?: number;
  subChunkRequestSectionCountFallback?: number;
  subChunkRequestMinSectionY?: number;
  subChunkRequestSectionCountLimit?: number;
  queueSubChunkRequest?: (request: SubChunkRequestPayload) => void;
};

const toIntegerLikeNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "bigint") return Number(value);
  return null;
};

const clampSectionCount = (value: number, limit: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value > limit) return limit;
  return Math.floor(value);
};

const createSubChunkRequests = (sectionCount: number): Array<{ dx: number; dy: number; dz: number }> => {
  const requests: Array<{ dx: number; dy: number; dz: number }> = [];
  for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
    requests.push({ dx: 0, dy: sectionIndex, dz: 0 });
  }
  return requests;
};

const resolveSubChunkSectionCount = (
  packet: Record<string, unknown>,
  fallbackSectionCount: number,
  sectionCountLimit: number
): number => {
  const highestSubChunkCount = toIntegerLikeNumber(packet["highest_subchunk_count"]);
  if (highestSubChunkCount === null) return clampSectionCount(fallbackSectionCount, sectionCountLimit);
  return clampSectionCount(highestSubChunkCount, sectionCountLimit);
};
export const createSessionTerrainNavigation = (
  client: ClientLike,
  logger: Logger,
  dependencies: SessionTerrainNavigationDependencies = {}
): SessionTerrainNavigation => {
  const registryVersion = readClientRegistryVersion(client);
  if (
    registryVersion.requested
    && registryVersion.effective
    && registryVersion.requested !== registryVersion.effective
  ) {
    logger.info(
      {
        event: "navigation_registry_version_override",
        requestedVersion: registryVersion.requested,
        effectiveVersion: registryVersion.effective
      },
      "Overriding navigation chunk registry version to supported implementation range"
    );
  }
  const terrainMap = (dependencies.createChunkTerrainMap ?? createChunkTerrainMap)({
    logger,
    ...(registryVersion.effective ? { registryVersion: registryVersion.effective } : {})
  });
  const waypointResolver = (dependencies.createNavigationWaypointResolver ?? createNavigationWaypointResolver)({
    logger,
    isStandable: (cell) => terrainMap.isStandable(cell.x, cell.y, cell.z)
  });
  const now = dependencies.now ?? (() => Date.now());
  const chunkReadyTimeoutMs = dependencies.chunkReadyTimeoutMs ?? DEFAULT_NAVIGATION_CHUNK_READY_TIMEOUT_MS;
  const subChunkRequestColumnLimit = dependencies.subChunkRequestColumnLimit
    ?? DEFAULT_NAVIGATION_SUBCHUNK_REQUEST_COLUMN_LIMIT;
  const subChunkRequestSectionCountFallback = dependencies.subChunkRequestSectionCountFallback
    ?? DEFAULT_NAVIGATION_SUBCHUNK_SECTION_COUNT_FALLBACK;
  const subChunkRequestMinSectionY = dependencies.subChunkRequestMinSectionY
    ?? DEFAULT_NAVIGATION_SUBCHUNK_MIN_SECTION_Y;
  const subChunkRequestSectionCountLimit = dependencies.subChunkRequestSectionCountLimit
    ?? DEFAULT_NAVIGATION_SUBCHUNK_SECTION_COUNT_LIMIT;
  const queueSubChunkRequest = dependencies.queueSubChunkRequest
    ?? ((request: SubChunkRequestPayload) => {
      client.queue?.("subchunk_request", request);
    });
  const requestedSubChunkColumns = new Set<string>();
  let subChunkRequestCount = 0;
  let waitingForChunksLogged = false;
  let waitingForChunksSinceMs: number | null = null;
  let levelChunkShapeLogged = false;
  let subChunkShapeLogged = false;
  let runtimeIdMode: "legacy" | "hashed" | null = null;
  let runtimeIdModeError: Error | null = null;
  const onStartGame = (packet: unknown): void => {
    if (!packet || typeof packet !== "object") return;
    const packetRecord = packet as Record<string, unknown>;
    const useHashedRuntimeIds = packetRecord["block_network_ids_are_hashes"] === true;
    const nextRuntimeIdMode = useHashedRuntimeIds ? "hashed" : "legacy";
    if (runtimeIdMode === nextRuntimeIdMode) return;
    try {
      terrainMap.configureRuntimeIdMode(useHashedRuntimeIds);
      runtimeIdMode = nextRuntimeIdMode;
      runtimeIdModeError = null;
      logger.info(
        {
          event: "navigation_runtime_id_mode",
          mode: nextRuntimeIdMode
        },
        "Configured navigation runtime ID mode"
      );
    } catch (error) {
      runtimeIdModeError = error instanceof Error ? error : new Error(String(error));
      logger.error(
        {
          event: "navigation_runtime_id_mode_error",
          mode: nextRuntimeIdMode,
          error: runtimeIdModeError.message
        },
        "Failed to configure navigation runtime ID mode"
      );
    }
  };
  const onLevelChunk = (packet: unknown): void => {
    if (!isLevelChunkPacket(packet)) return;
    if (!levelChunkShapeLogged && packet && typeof packet === "object") {
      levelChunkShapeLogged = true;
      const candidatePacket = packet as Record<string, unknown>;
      logger.info(
        {
          event: "navigation_level_chunk_shape",
          keys: Object.keys(candidatePacket).slice(0, 12),
          subChunkCount: candidatePacket["sub_chunk_count"] ?? null,
          highestSubChunkCount: candidatePacket["highest_subchunk_count"] ?? null,
          subChunkCountType: typeof candidatePacket["sub_chunk_count"],
          cacheEnabled: candidatePacket["cache_enabled"] ?? null,
          payloadType: Buffer.isBuffer(candidatePacket["payload"])
            ? "buffer"
            : candidatePacket["payload"] instanceof Uint8Array
              ? "uint8array"
              : typeof candidatePacket["payload"]
        },
        "Observed level_chunk packet shape for navigation"
      );
    }
    terrainMap.observeLevelChunk(packet);
    if (!packet || typeof packet !== "object") return;
    const candidatePacket = packet as Record<string, unknown>;
    if (toIntegerLikeNumber(candidatePacket["sub_chunk_count"]) !== -2) return;
    const chunkX = toIntegerLikeNumber(candidatePacket["x"]);
    const chunkZ = toIntegerLikeNumber(candidatePacket["z"]);
    if (chunkX === null || chunkZ === null) return;
    const chunkKey = toChunkKey(chunkX, chunkZ);
    if (requestedSubChunkColumns.has(chunkKey)) return;
    if (requestedSubChunkColumns.size >= subChunkRequestColumnLimit) return;
    const sectionCount = resolveSubChunkSectionCount(
      candidatePacket,
      subChunkRequestSectionCountFallback,
      subChunkRequestSectionCountLimit
    );
    if (sectionCount <= 0) return;
    const dimension = toIntegerLikeNumber(candidatePacket["dimension"]) ?? 0;
    const requestPayload: SubChunkRequestPayload = {
      dimension,
      origin: { x: chunkX, y: subChunkRequestMinSectionY, z: chunkZ },
      requests: createSubChunkRequests(sectionCount)
    };
    requestedSubChunkColumns.add(chunkKey);
    queueSubChunkRequest(requestPayload);
    subChunkRequestCount += 1;
    if (subChunkRequestCount === 1 || subChunkRequestCount % 16 === 0) {
      logger.info(
        {
          event: "navigation_subchunk_request",
          chunkX,
          chunkZ,
          sectionCount,
          dimension,
          requestedColumns: subChunkRequestCount
        },
        "Requested subchunk data for navigation"
      );
    }
  };
  const onSubChunk = (packet: unknown): void => {
    if (!isSubChunkPacket(packet)) return;
    if (!subChunkShapeLogged && packet && typeof packet === "object") {
      subChunkShapeLogged = true;
      const candidatePacket = packet as Record<string, unknown>;
      const firstEntry = Array.isArray(candidatePacket["entries"])
        ? candidatePacket["entries"][0]
        : null;
      const firstEntryRecord = firstEntry && typeof firstEntry === "object"
        ? firstEntry as Record<string, unknown>
        : null;
      const firstPayload = firstEntryRecord ? firstEntryRecord["payload"] : null;
      const firstPayloadBuffer = Buffer.isBuffer(firstPayload)
        ? firstPayload
        : firstPayload instanceof Uint8Array
          ? Buffer.from(firstPayload)
          : null;
      logger.info(
        {
          event: "navigation_subchunk_shape",
          keys: Object.keys(candidatePacket).slice(0, 8),
          cacheEnabled: candidatePacket["cache_enabled"] ?? null,
          entryCount: Array.isArray(candidatePacket["entries"]) ? candidatePacket["entries"].length : null,
          originY: toIntegerLikeNumber(
            candidatePacket["origin"] && typeof candidatePacket["origin"] === "object"
              ? (candidatePacket["origin"] as Record<string, unknown>)["y"]
              : null
          ),
          firstDy: firstEntryRecord ? toIntegerLikeNumber(firstEntryRecord["dy"]) : null,
          firstResult: firstEntryRecord?.["result"] ?? null,
          firstPayloadType: firstPayloadBuffer
            ? "buffer"
              : typeof firstPayload,
          firstPayloadLength: firstPayloadBuffer
            ? firstPayloadBuffer.length
            : null,
          firstPayloadPrefixHex: firstPayloadBuffer
            ? firstPayloadBuffer.subarray(0, 16).toString("hex")
            : null
        },
        "Observed subchunk packet shape for navigation"
      );
    }
    terrainMap.observeSubChunk(packet);
  };
  client.on?.("start_game", onStartGame);
  client.on?.("level_chunk", onLevelChunk);
  client.on?.("subchunk", onSubChunk);
  return {
    resolveWaypoint: (position, target) => {
      if (!target) {
        waitingForChunksLogged = false;
        waitingForChunksSinceMs = null;
        return null;
      }
      if (runtimeIdModeError) throw runtimeIdModeError;
      if (terrainMap.getLoadedChunkCount() > 0) {
        waitingForChunksLogged = false;
        waitingForChunksSinceMs = null;
        return waypointResolver.resolveWaypoint(position, target);
      }
      if (waitingForChunksSinceMs === null) waitingForChunksSinceMs = now();
      if (now() - waitingForChunksSinceMs >= chunkReadyTimeoutMs) {
        throw new Error("Navigation chunk data unavailable");
      }
      if (!waitingForChunksLogged) {
        waitingForChunksLogged = true;
        logger.info({ event: "navigation_waiting_for_chunks" }, "Navigation is waiting for decoded chunks");
      }
      return null;
    },
    cleanup: () => {
      client.removeListener("start_game", onStartGame);
      client.removeListener("level_chunk", onLevelChunk);
      client.removeListener("subchunk", onSubChunk);
      waypointResolver.clear();
    }
  };
};
