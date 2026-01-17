import { createClient } from "bedrock-protocol";
import { randomBytes } from "node:crypto";
import type { ClientOptions } from "bedrock-protocol";
import type { Authflow } from "prismarine-auth";
import type { Logger } from "pino";
import { DEFAULT_JOIN_TIMEOUT_MS, DEFAULT_REQUEST_CHUNK_RADIUS_DELAY_MS, DEFAULT_VIEW_DISTANCE_CHUNKS, type RaknetBackend } from "../constants.js";
import type { AuthenticatedClientOptions } from "./authenticatedClientOptions.js";
import type { ClientLike } from "./clientTypes.js";
import { configurePostJoinPackets } from "./postJoinPackets.js";
import { createNethernetClient } from "./nethernetClientFactory.js";

export { createNethernetClient, disableBedrockEncryptionForNethernet } from "./nethernetClientFactory.js";
export type { CreateNethernetClientDependencies } from "./nethernetClientFactory.js";

export type JoinOptions = {
  host: string;
  port: number;
  accountName: string;
  authflow: Authflow;
  logger: Logger;
  serverName: string | undefined;
  disconnectAfterFirstChunk: boolean;
  skipPing: boolean;
  raknetBackend: RaknetBackend;
  transport: "raknet" | "nethernet";
  minecraftVersion?: string;
  joinTimeoutMs?: number;
  viewDistanceChunks?: number;
  nethernetServerId?: bigint;
  nethernetClientId?: bigint;
  clientFactory?: (options: AuthenticatedClientOptions) => ClientLike;
  nethernetClientFactory?: (
    options: AuthenticatedClientOptions,
    logger: Logger,
    serverId: bigint,
    clientId: bigint
  ) => ClientLike;
};

type Vector3 = { x: number; y: number; z: number };

type StartGamePacket = {
  player_position?: Vector3;
  dimension?: string;
  level_id?: string;
  world_name?: string;
};

type LevelChunkPacket = {
  x?: number;
  z?: number;
};

const isVector3 = (value: unknown): value is Vector3 => {
  if (!value || typeof value !== "object") return false;
  return "x" in value && "y" in value && "z" in value;
};

const isStartGamePacket = (value: unknown): value is StartGamePacket => {
  if (!value || typeof value !== "object") return false;
  return true;
};

const isLevelChunkPacket = (value: unknown): value is LevelChunkPacket => {
  if (!value || typeof value !== "object") return false;
  return "x" in value && "z" in value;
};

const readOptionalStringField = (packet: unknown, fieldName: string): string | null => {
  if (!packet || typeof packet !== "object") return null;
  if (!(fieldName in packet)) return null;
  const value = (packet as Record<string, unknown>)[fieldName];
  return typeof value === "string" ? value : null;
};

const readPacketEventName = (packet: unknown): string | null => {
  if (!packet || typeof packet !== "object") return null;
  if (!("data" in packet)) return null;
  return readOptionalStringField((packet as { data?: unknown }).data, "name");
};

const getProfileName = (client: unknown): string => {
  if (!client || typeof client !== "object" || !("profile" in client)) return "unknown";
  const profile = (client as { profile?: { name?: string } }).profile;
  return profile?.name ?? "unknown";
};

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

export const joinBedrockServer = async (options: JoinOptions): Promise<void> => new Promise((resolve, reject) => {
  const resolvedClientFactory = options.transport === "nethernet"
    ? () => {
      if (!options.nethernetServerId) throw new Error("NetherNet join requires serverId from discovery");
      return (options.nethernetClientFactory ?? createNethernetClient)(
        toClientOptions({ ...options, skipPing: true }),
        options.logger,
        options.nethernetServerId,
        options.nethernetClientId ?? createRandomSenderId()
      );
    }
    : () => (options.clientFactory ?? createClient)(toClientOptions(options)) as ClientLike;
  const client = resolvedClientFactory();
  let startGamePacket: StartGamePacket | null = null;
  let firstChunk = false;
  let finished = false;
  const joinTimeoutMs = options.joinTimeoutMs ?? DEFAULT_JOIN_TIMEOUT_MS;
  const viewDistanceChunks = options.viewDistanceChunks ?? DEFAULT_VIEW_DISTANCE_CHUNKS;
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
    client.disconnect();
  }, joinTimeoutMs);
  const packetLogLimit = 50; // Log first few inbound packet names at debug to help diagnose join stalls without flooding.
  let packetLogs = 0;
  const postJoin = configurePostJoinPackets(client, options.logger, requestChunkRadiusDelayMs, viewDistanceChunks);
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
    options.logger.info({ event: "signal", signal: "SIGINT" }, "Disconnecting from server");
    client.disconnect();
  };
  const cleanup = () => {
    process.removeListener("SIGINT", handleSignal);
    if (joinTimeoutId) clearTimeout(joinTimeoutId);
    joinTimeoutId = null;
    postJoin.cleanup();
  };
  process.once("SIGINT", handleSignal);
  options.logger.info(
    {
      event: "connect",
      host: options.host,
      port: options.port,
      serverName: options.serverName ?? null,
      serverId: options.nethernetServerId ? options.nethernetServerId.toString() : null
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
    options.logger.debug({ event: "packet_in", name }, "Received packet");
  });
  client.on("loggingIn", () => {
    options.logger.info({ event: "logging_in" }, "Sending login");
  });
  client.on("client.server_handshake", () => {
    options.logger.info({ event: "server_handshake" }, "Received server handshake");
  });
  client.on("play_status", (packet) => {
    options.logger.info({ event: "play_status", status: readOptionalStringField(packet, "status") }, "Received play status");
  });
  client.on("join", () => {
    options.logger.info({ event: "join", playerName: getProfileName(client) }, "Authenticated with server");
  });
  client.on("start_game", (packet) => {
    if (!isStartGamePacket(packet)) return;
    startGamePacket = packet;
    const position = isVector3(packet.player_position) ? packet.player_position : null;
    options.logger.info(
      {
        event: "start_game",
        playerName: getProfileName(client),
        dimension: packet.dimension ?? null,
        position,
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
    options.logger.info(
      { event: "spawn", playerName: getProfileName(client), dimension: startGamePacket?.dimension ?? null, position },
      "Spawn confirmed"
    );
  });
  client.on("level_chunk", (packet) => {
    if (firstChunk) return;
    if (!isLevelChunkPacket(packet)) return;
    firstChunk = true;
    options.logger.info(
      { event: "chunk", chunkX: packet.x ?? null, chunkZ: packet.z ?? null },
      "Received first chunk"
    );
    finish();
    if (options.disconnectAfterFirstChunk) client.disconnect();
  });
  client.on("close", (reason) => {
    if (finished) return;
    fail(new Error(`Server closed connection: ${reason ?? "unknown"}`));
  });
  client.on("error", (error) => {
    if (error instanceof Error) return fail(error);
    return fail(new Error(String(error)));
  });
});
