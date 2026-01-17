import type { Logger } from "pino";
import type { ClientLike } from "./clientTypes.js";

const safeWrite = (client: ClientLike, name: string, params: object): void => {
  if (typeof client.write !== "function") return;
  client.write(name, params);
};

const safeQueue = (client: ClientLike, name: string, params: object): void => {
  if (typeof client.queue === "function") return client.queue(name, params);
  return safeWrite(client, name, params);
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
  const sendResourcePackResponse = () => safeWrite(client, "resource_pack_client_response", { response_status: "completed", resourcepackids: [] });
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
      safeQueue(client, "request_chunk_radius", { chunk_radius: viewDistanceChunks });
    }, requestChunkRadiusDelayMs);
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
  client.once?.("resource_packs_info", onResourcePacksInfo);
  client.once?.("resource_pack_stack", onResourcePackStack);
  return {
    cleanup: () => {
      if (requestTimeoutId) clearTimeout(requestTimeoutId);
    }
  };
};

