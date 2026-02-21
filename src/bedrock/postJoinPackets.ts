import type { Logger } from "pino";
import { MAX_CHUNK_RADIUS_REQUEST_CHUNKS } from "../constants.js";
import type { ClientLike } from "./clientTypes.js";

const safeWrite = (client: ClientLike, name: string, params: object): void => {
  if (typeof client.write !== "function") return;
  client.write(name, params);
};

const safeQueue = (client: ClientLike, name: string, params: object): void => {
  if (typeof client.queue === "function") return client.queue(name, params);
  return safeWrite(client, name, params);
};

const readChunkRadiusValue = (packet: unknown): number | null => {
  if (!packet || typeof packet !== "object" || !("chunk_radius" in packet)) return null;
  const rawChunkRadius = (packet as Record<string, unknown>)["chunk_radius"];
  if (typeof rawChunkRadius === "number" && Number.isFinite(rawChunkRadius)) return Math.trunc(rawChunkRadius);
  if (typeof rawChunkRadius === "bigint") return Number(rawChunkRadius);
  if (typeof rawChunkRadius === "string") {
    const parsedChunkRadius = Number.parseInt(rawChunkRadius, 10);
    return Number.isNaN(parsedChunkRadius) ? null : parsedChunkRadius;
  }
  return null;
};

export const configurePostJoinPackets = (
  client: ClientLike,
  logger: Logger,
  requestChunkRadiusDelayMs: number,
  viewDistanceChunks: number
): { cleanup: () => void } => {
  let requestTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let cacheStatusSent = false;
  let chunkRadiusScheduled = false;
  let lastRequestedChunkRadius: number | null = null;
  const sendResourcePackResponse = () => safeWrite(client, "resource_pack_client_response", { response_status: "completed", resourcepackids: [] });
  const queueChunkRadiusRequest = (chunkRadius: number): void => {
    lastRequestedChunkRadius = chunkRadius;
    safeQueue(client, "request_chunk_radius", { chunk_radius: chunkRadius, max_radius: chunkRadius });
  };
  const ensureClientCacheStatus = () => {
    if (cacheStatusSent) return;
    cacheStatusSent = true;
    safeQueue(client, "client_cache_status", { enabled: false });
  };
  const scheduleChunkRadiusRequest = () => {
    if (chunkRadiusScheduled) return;
    chunkRadiusScheduled = true;
    requestTimeoutId = setTimeout(() => {
      requestTimeoutId = null;
      queueChunkRadiusRequest(MAX_CHUNK_RADIUS_REQUEST_CHUNKS);
      logger.info(
        {
          event: "chunk_radius_probe_request",
          requestedChunkRadius: MAX_CHUNK_RADIUS_REQUEST_CHUNKS,
          chunkRadiusSoftCap: viewDistanceChunks
        },
        "Requesting maximum chunk radius from server"
      );
    }, requestChunkRadiusDelayMs);
  };
  const onChunkRadiusUpdate = (packet: unknown): void => {
    const serverChunkRadius = readChunkRadiusValue(packet);
    if (serverChunkRadius === null) return;
    const effectiveChunkRadius = Math.min(serverChunkRadius, viewDistanceChunks);
    logger.info(
      {
        event: "chunk_radius_update",
        serverChunkRadius,
        effectiveChunkRadius,
        chunkRadiusSoftCap: viewDistanceChunks
      },
      "Received chunk radius update"
    );
    if (effectiveChunkRadius >= serverChunkRadius) return;
    if (lastRequestedChunkRadius === effectiveChunkRadius) return;
    queueChunkRadiusRequest(effectiveChunkRadius);
    logger.info(
      {
        event: "chunk_radius_cap_request",
        requestedChunkRadius: effectiveChunkRadius,
        serverChunkRadius,
        chunkRadiusSoftCap: viewDistanceChunks
      },
      "Applying local chunk radius cap"
    );
  };
  const onJoin = () => {
    ensureClientCacheStatus();
    scheduleChunkRadiusRequest();
  };
  const onResourcePacksInfo = () => {
    logger.info({ event: "resource_packs_info" }, "Received resource packs info");
    sendResourcePackResponse();
  };
  const onResourcePackStack = () => {
    logger.info({ event: "resource_pack_stack" }, "Received resource pack stack");
    sendResourcePackResponse();
    ensureClientCacheStatus();
    scheduleChunkRadiusRequest();
  };
  client.on?.("join", onJoin);
  client.on?.("chunk_radius_update", onChunkRadiusUpdate);
  client.once?.("resource_packs_info", onResourcePacksInfo);
  client.once?.("resource_pack_stack", onResourcePackStack);
  return {
    cleanup: () => {
      if (requestTimeoutId) clearTimeout(requestTimeoutId);
      client.removeListener("join", onJoin);
      client.removeListener("chunk_radius_update", onChunkRadiusUpdate);
      client.removeListener("resource_packs_info", onResourcePacksInfo);
      client.removeListener("resource_pack_stack", onResourcePackStack);
    }
  };
};
