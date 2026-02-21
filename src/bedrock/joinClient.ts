import { createClient } from "bedrock-protocol";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { randomBytes } from "node:crypto";
import type { ClientOptions } from "bedrock-protocol";
import type { Authflow } from "prismarine-auth";
import type { Logger } from "pino";
import { DEFAULT_JOIN_TIMEOUT_MS, DEFAULT_REQUEST_CHUNK_RADIUS_DELAY_MS, DEFAULT_VIEW_DISTANCE_CHUNKS, RAKNET_BACKEND_NODE, type RaknetBackend } from "../constants.js";
import type { AuthenticatedClientOptions } from "./authenticatedClientOptions.js";
import { disconnectClient, isRecoverableReadError } from "./clientConnectionCleanup.js";
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
  lookupHost?: (hostname: string) => Promise<string>;
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

const toError = (value: unknown): Error => {
  if (value instanceof Error) return value;
  return new Error(String(value));
};
const lookupHostAddress = async (hostname: string): Promise<string> => {
  return (await lookup(hostname, { family: 4 })).address;
};
const createJoinPromise = (resolvedOptions: JoinOptions): Promise<void> => new Promise((resolve, reject) => {
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
    let packetLogs = 0;
    const postJoin = configurePostJoinPackets(
      client,
      resolvedOptions.logger,
      requestChunkRadiusDelayMs,
      viewDistanceChunks
    );
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
      resolvedOptions.logger.info({ event: "signal", signal: "SIGINT" }, "Disconnecting from server");
      disconnectClient(client);
    };
    const cleanup = () => {
      process.removeListener("SIGINT", handleSignal);
      removeProcessErrorHandlers();
      if (joinTimeoutId) clearTimeout(joinTimeoutId);
      joinTimeoutId = null;
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
      const position = isVector3(packet.player_position) ? packet.player_position : null;
      resolvedOptions.logger.info(
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
      resolvedOptions.logger.info(
        { event: "spawn", playerName: getProfileName(client), dimension: startGamePacket?.dimension ?? null, position },
        "Spawn confirmed"
      );
    });
    client.on("level_chunk", (packet) => {
      if (firstChunk) return;
      if (!isLevelChunkPacket(packet)) return;
      firstChunk = true;
      resolvedOptions.logger.info(
        { event: "chunk", chunkX: packet.x ?? null, chunkZ: packet.z ?? null },
        "Received first chunk"
      );
      finish();
      if (resolvedOptions.disconnectAfterFirstChunk) disconnectClient(client);
    });
    client.on("close", (reason) => {
      if (finished) return;
      fail(new Error(`Server closed connection: ${reason ?? "unknown"}`));
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

export const joinBedrockServer = async (options: JoinOptions): Promise<void> => {
  if (options.raknetBackend !== RAKNET_BACKEND_NODE || isIP(options.host) !== 0) return createJoinPromise(options);
  const resolvedHost = await (options.lookupHost ?? lookupHostAddress)(options.host);
  if (resolvedHost === options.host) return createJoinPromise(options);
  return createJoinPromise({ ...options, host: resolvedHost });
};
