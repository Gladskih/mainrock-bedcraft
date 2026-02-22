import { isIP } from "node:net";
import type { Authflow } from "prismarine-auth";
import type { Logger } from "pino";
import {
  RAKNET_BACKEND_NODE,
  type MovementGoal,
  type MovementSpeedMode,
  type RaknetBackend
} from "../constants.js";
import type { AuthenticatedClientOptions } from "./authenticatedClientOptions.js";
import type { ClientLike } from "./clientTypes.js";
import type { Vector3 } from "./joinClientHelpers.js";
import { createJoinPromise, lookupHostAddress } from "./joinClientSession.js";

export { createNethernetClient, disableBedrockEncryptionForNethernet } from "./nethernetClientFactory.js";
export type { CreateNethernetClientDependencies } from "./nethernetClientFactory.js";

export type JoinConnectionState = "connecting" | "online" | "offline";

export type JoinConnectionStateChange = {
  state: JoinConnectionState;
  reason: string;
};

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
  movementGoal: MovementGoal;
  followPlayerName: string | undefined;
  followCoordinates: Vector3 | undefined;
  movementSpeedMode?: MovementSpeedMode;
  initialSpeedBlocksPerSecond?: number;
  onMovementSpeedCalibrated?: (speedBlocksPerSecond: number) => void | Promise<void>;
  listPlayersOnly?: boolean;
  playerListWaitMs?: number;
  onPlayerListUpdate?: (players: string[]) => void;
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
  onConnectionStateChange?: (stateChange: JoinConnectionStateChange) => void;
};

export const joinBedrockServer = async (options: JoinOptions): Promise<void> => {
  if (options.raknetBackend !== RAKNET_BACKEND_NODE || isIP(options.host) !== 0) return createJoinPromise(options);
  const resolvedHost = await (options.lookupHost ?? lookupHostAddress)(options.host);
  if (resolvedHost === options.host) return createJoinPromise(options);
  return createJoinPromise({ ...options, host: resolvedHost });
};
