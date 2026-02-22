import type { Logger } from "pino";
import type { JoinCommandOptions, JoinDependencies } from "./runJoinCommand.js";
import { normalizeServerName } from "../bedrock/serverSelection.js";

export type ResolvedTarget = {
  host: string;
  port: number;
  serverName: string | undefined;
  speedProfileServerId?: string;
  nethernetServerId?: bigint;
};

export const resolveRaknetTarget = async (
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
  return {
    host: match.host,
    port: match.port,
    serverName: match.advertisement.motd,
    speedProfileServerId: match.advertisement.serverId
  };
};

export const resolveNethernetTarget = async (
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
    speedProfileServerId: match.senderId.toString(),
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
    speedProfileServerId: match.senderId.toString(),
    nethernetServerId: match.senderId
  };
};
