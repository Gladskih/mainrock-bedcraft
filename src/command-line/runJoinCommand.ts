import type { Logger } from "pino";
import {
  APPLICATION_ID,
  DEFAULT_RECONNECT_BASE_DELAY_MS,
  DEFAULT_RECONNECT_JITTER_RATIO,
  DEFAULT_RECONNECT_MAX_DELAY_MS,
  DEFAULT_RECONNECT_MAX_RETRIES,
  type MovementGoal,
  type RaknetBackend
} from "../constants.js";
import { createAuthFlow } from "../authentication/authFlow.js";
import { resolveCachePaths } from "../authentication/cachePaths.js";
import { discoverLanServers } from "../bedrock/lanDiscovery.js";
import { joinBedrockServer } from "../bedrock/joinClient.js";
import { calculateReconnectDelayMs } from "../bedrock/reconnectPolicy.js";
import { normalizeServerName, selectServerByName } from "../bedrock/serverSelection.js";
import { discoverNethernetLanServers } from "../nethernet/lanDiscovery.js";

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
  const cachePaths = dependencies.resolveCachePaths(APPLICATION_ID);
  const cacheDirectory = options.cacheDirectory ?? cachePaths.cacheDirectory;
  const keyFilePath = options.keyFilePath ?? cachePaths.keyFilePath;
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
  const reconnectMaxRetries = options.reconnectMaxRetries ?? DEFAULT_RECONNECT_MAX_RETRIES;
  const reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS;
  const reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS;
  for (let attempt = 0; ; attempt += 1) {
    const target = options.transport === "nethernet"
      ? await resolveNethernetTarget(options, logger, dependencies)
      : await resolveRaknetTarget(options, logger, dependencies);
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
        ...(options.listPlayersOnly !== undefined ? { listPlayersOnly: options.listPlayersOnly } : {}),
        ...(options.playerListWaitMs !== undefined ? { playerListWaitMs: options.playerListWaitMs } : {}),
        ...(options.onPlayerListUpdate !== undefined ? { onPlayerListUpdate: options.onPlayerListUpdate } : {}),
        ...(options.minecraftVersion !== undefined ? { minecraftVersion: options.minecraftVersion } : {}),
        ...(target.nethernetServerId !== undefined ? { nethernetServerId: target.nethernetServerId } : {})
      });
      return;
    } catch (error) {
      if (attempt >= reconnectMaxRetries) throw error;
      const delayMs = calculateReconnectDelayMs({
        attempt,
        baseDelayMs: reconnectBaseDelayMs,
        maxDelayMs: reconnectMaxDelayMs,
        jitterRatio: DEFAULT_RECONNECT_JITTER_RATIO,
        random: dependencies.random
      });
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

type ResolvedTarget = {
  host: string;
  port: number;
  serverName: string | undefined;
  nethernetServerId?: bigint;
};

const resolveRaknetTarget = async (
  options: Pick<JoinCommandOptions, "host" | "port" | "serverName" | "discoveryTimeoutMs">,
  logger: Logger,
  dependencies: Pick<JoinDependencies, "discoverLanServers" | "selectServerByName">
): Promise<ResolvedTarget> => {
  if (options.host) return { host: options.host, port: options.port, serverName: options.serverName };
  return resolveRaknetServerByName(options.serverName ?? "", options.discoveryTimeoutMs, logger, dependencies);
};

const resolveRaknetServerByName = async (
  serverName: string,
  timeoutMs: number,
  logger: Logger,
  dependencies: Pick<JoinDependencies, "discoverLanServers" | "selectServerByName">
): Promise<ResolvedTarget> => {
  logger.info({ event: "discover", timeoutMs, transport: "raknet" }, "Searching for LAN server by name");
  const servers = await dependencies.discoverLanServers({ timeoutMs });
  const selection = dependencies.selectServerByName(servers, serverName);
  if (selection.matches.length === 0) throw new Error(`No LAN servers matched name: ${serverName}`);
  if (selection.matches.length > 1) throw new Error(`Multiple LAN servers matched name: ${serverName}`);
  const match = selection.matches[0];
  if (!match) throw new Error(`No LAN servers matched name: ${serverName}`);
  return { host: match.host, port: match.port, serverName: match.advertisement.motd };
};

const resolveNethernetTarget = async (
  options: Pick<JoinCommandOptions, "host" | "port" | "serverName" | "discoveryTimeoutMs">,
  logger: Logger,
  dependencies: Pick<JoinDependencies, "discoverNethernetLanServers">
): Promise<ResolvedTarget> => {
  if (options.host) return resolveNethernetServerByHost(
    options.host,
    options.port,
    options.discoveryTimeoutMs,
    logger,
    dependencies
  );
  return resolveNethernetServerByName(options.serverName ?? "", options.discoveryTimeoutMs, logger, dependencies);
};

const resolveNethernetServerByHost = async (
  host: string,
  port: number,
  timeoutMs: number,
  logger: Logger,
  dependencies: Pick<JoinDependencies, "discoverNethernetLanServers">
): Promise<ResolvedTarget> => {
  logger.info({ event: "discover", timeoutMs, transport: "nethernet", host, port }, "Requesting NetherNet server id");
  const servers = await dependencies.discoverNethernetLanServers({ timeoutMs, port, broadcastAddresses: [host] });
  if (servers.length === 0) throw new Error(`No NetherNet servers responded from host: ${host}`);
  if (servers.length > 1) throw new Error(`Multiple NetherNet servers responded from host: ${host}`);
  const match = servers[0];
  if (!match) throw new Error(`No NetherNet servers responded from host: ${host}`);
  return {
    host: match.host,
    port: match.port,
    serverName: match.serverData.serverName,
    nethernetServerId: match.senderId
  };
};

const resolveNethernetServerByName = async (
  serverName: string,
  timeoutMs: number,
  logger: Logger,
  dependencies: Pick<JoinDependencies, "discoverNethernetLanServers">
): Promise<ResolvedTarget> => {
  logger.info({ event: "discover", timeoutMs, transport: "nethernet" }, "Searching for LAN server by name");
  const normalizedTarget = normalizeServerName(serverName);
  const servers = await dependencies.discoverNethernetLanServers({ timeoutMs });
  const matches = servers.filter((server) => {
    return normalizeServerName(server.serverData.serverName).includes(normalizedTarget);
  });
  if (matches.length === 0) throw new Error(`No LAN servers matched name: ${serverName}`);
  if (matches.length > 1) throw new Error(`Multiple LAN servers matched name: ${serverName}`);
  const match = matches[0];
  if (!match) throw new Error(`No LAN servers matched name: ${serverName}`);
  return {
    host: match.host,
    port: match.port,
    serverName: match.serverData.serverName,
    nethernetServerId: match.senderId
  };
};
