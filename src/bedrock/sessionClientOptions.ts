import type { ClientOptions } from "bedrock-protocol";
import { randomBytes } from "node:crypto";
import { DEFAULT_VIEW_DISTANCE_CHUNKS } from "../constants.js";
import type { JoinOptions } from "./joinClient.js";
import type { AuthenticatedClientOptions } from "./authenticatedClientOptions.js";

export const toClientOptions = (options: JoinOptions): AuthenticatedClientOptions => ({
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

export const createRandomSenderId = (): bigint => randomBytes(8).readBigUInt64BE();
