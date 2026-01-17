import type { Logger } from "pino";
import { DEFAULT_PING_THROTTLE_MS } from "../constants.js";
import { discoverLanServers } from "../bedrock/lanDiscovery.js";
import { normalizeServerName } from "../bedrock/serverSelection.js";
import { pingServerStatus } from "../bedrock/statusPing.js";
import { discoverNethernetLanServers, type DiscoveredNethernetLanServer } from "../nethernet/lanDiscovery.js";
import { delay } from "../util/timeouts.js";

export type ScanCommandOptions = {
  timeoutMs: number;
  serverNameFilter: string | undefined;
  transport: "raknet" | "nethernet";
};

export type ScanDependencies = {
  discoverLanServers: typeof discoverLanServers;
  discoverNethernetLanServers: typeof discoverNethernetLanServers;
  pingServerStatus: typeof pingServerStatus;
  delay: typeof delay;
};

const defaultScanDependencies: ScanDependencies = {
  discoverLanServers,
  discoverNethernetLanServers,
  pingServerStatus,
  delay
};

export const runScanCommand = async (
  options: ScanCommandOptions,
  logger: Logger,
  dependencies: ScanDependencies = defaultScanDependencies
): Promise<void> => {
  logger.info({ event: "scan_start", timeoutMs: options.timeoutMs, transport: options.transport }, "Scanning for Bedrock LAN servers");
  if (options.transport === "nethernet") return runNethernetScan(options, logger, dependencies);
  return runRaknetScan(options, logger, dependencies);
};

const runRaknetScan = async (
  options: ScanCommandOptions,
  logger: Logger,
  dependencies: ScanDependencies
): Promise<void> => {
  const servers = await dependencies.discoverLanServers({ timeoutMs: options.timeoutMs });
  if (servers.length === 0) {
    logger.info({ event: "scan_empty", transport: options.transport }, "No LAN servers discovered");
    return;
  }
  const serverNameFilter = options.serverNameFilter;
  const filteredServers = serverNameFilter
    ? servers.filter((server) => {
      return normalizeServerName(server.advertisement.motd).includes(
        normalizeServerName(serverNameFilter)
      );
    })
    : servers;
  if (filteredServers.length === 0) {
    logger.info({ event: "scan_no_match", transport: options.transport, serverNameFilter }, "No LAN servers matched the filter");
    return;
  }
  for (const server of filteredServers) {
    await pingRaknetServer(server.host, server.port, logger, dependencies);
    await dependencies.delay(DEFAULT_PING_THROTTLE_MS);
  }
};

const pingRaknetServer = async (
  host: string,
  port: number,
  logger: Logger,
  dependencies: Pick<ScanDependencies, "pingServerStatus">
): Promise<void> => {
  try {
    const status = await dependencies.pingServerStatus(host, port);
    logger.info({
      event: "scan_result",
      transport: "raknet",
      host: status.host,
      port: status.port,
      motd: status.advertisement.motd,
      levelName: status.advertisement.levelName,
      version: status.advertisement.version,
      protocol: status.advertisement.protocol,
      playersOnline: status.advertisement.playersOnline,
      playersMax: status.advertisement.playersMax,
      latencyMs: status.latencyMs
    }, "LAN server status");
  } catch (error) {
    logger.warn({ event: "scan_ping_failed", transport: "raknet", host, port, error: error instanceof Error ? error.message : String(error) }, "Ping failed");
  }
};

const runNethernetScan = async (
  options: ScanCommandOptions,
  logger: Logger,
  dependencies: ScanDependencies
): Promise<void> => {
  const loggedKeys = new Set<string>();
  const serverNameFilter = options.serverNameFilter;
  const normalizedFilter = serverNameFilter ? normalizeServerName(serverNameFilter) : null;
  const logServer = (server: DiscoveredNethernetLanServer) => {
    const key = `${server.host}:${server.port}`;
    if (loggedKeys.has(key)) return;
    if (normalizedFilter && !normalizeServerName(server.serverData.serverName).includes(normalizedFilter)) return;
    loggedKeys.add(key);
    logger.info({
      event: "scan_result",
      transport: "nethernet",
      host: server.host,
      port: server.port,
      serverId: server.senderId.toString(),
      serverName: server.serverData.serverName,
      levelName: server.serverData.levelName,
      gameType: server.serverData.gameType,
      playersOnline: server.serverData.playersOnline,
      playersMax: server.serverData.playersMax,
      editorWorld: server.serverData.editorWorld,
      transportLayer: server.serverData.transportLayer,
      nethernetVersion: server.serverData.nethernetVersion,
      latencyMs: server.latencyMs
    }, "LAN server status");
  };
  const servers = await dependencies.discoverNethernetLanServers({
    timeoutMs: options.timeoutMs,
    onServer: logServer
  });
  if (servers.length === 0) {
    logger.info({ event: "scan_empty", transport: options.transport }, "No LAN servers discovered");
    return;
  }
  for (const server of servers) {
    logServer(server);
  }
  if (loggedKeys.size === 0 && serverNameFilter) {
    logger.info({ event: "scan_no_match", transport: options.transport, serverNameFilter }, "No LAN servers matched the filter");
  }
};
