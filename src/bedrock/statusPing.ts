import { performance } from "node:perf_hooks";
import { ping } from "bedrock-protocol";
import type { ServerAdvertisement } from "bedrock-protocol";
import { DEFAULT_BEDROCK_PORT, DEFAULT_PING_TIMEOUT_MS } from "../constants.js";
import type { LanServerAdvertisement } from "./advertisementParser.js";
import { withTimeout } from "../util/timeouts.js";

export type ServerStatus = {
  host: string;
  port: number;
  advertisement: LanServerAdvertisement;
  latencyMs: number;
};

const mapServerAdvertisement = (advertisement: ServerAdvertisement): LanServerAdvertisement => ({
  motd: advertisement.motd,
  levelName: advertisement.levelName,
  protocol: advertisement.protocol,
  version: advertisement.version,
  playersOnline: advertisement.playersOnline,
  playersMax: advertisement.playersMax,
  serverId: advertisement.serverId,
  gamemode: "",
  gamemodeId: advertisement.gamemodeId,
  portV4: advertisement.portV4,
  portV6: advertisement.portV6
});

export type StatusPingDependencies = {
  ping: (options: { host: string; port: number }) => Promise<ServerAdvertisement>;
  now: () => number;
  withTimeout: typeof withTimeout;
};

const defaultStatusPingDependencies: StatusPingDependencies = {
  ping,
  now: () => performance.now(),
  withTimeout
};

export const pingServerStatus = async (
  host: string,
  port: number = DEFAULT_BEDROCK_PORT,
  timeoutMs: number = DEFAULT_PING_TIMEOUT_MS,
  dependencies: StatusPingDependencies = defaultStatusPingDependencies
): Promise<ServerStatus> => {
  const start = dependencies.now();
  const advertisement = await dependencies.withTimeout(
    dependencies.ping({ host, port }),
    timeoutMs,
    "Server ping timed out"
  );
  return {
    host,
    port,
    advertisement: mapServerAdvertisement(advertisement),
    latencyMs: Math.round(dependencies.now() - start)
  };
};
