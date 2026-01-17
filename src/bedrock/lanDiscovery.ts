import dgram from "node:dgram";
import { BEDROCK_LAN_MULTICAST_ADDRESS_V4, DEFAULT_BEDROCK_PORT, DEFAULT_DISCOVERY_TIMEOUT_MS, DEFAULT_LAN_DISCOVERY_PORT } from "../constants.js";
import { parseAdvertisementString, type LanServerAdvertisement } from "./advertisementParser.js";
import { createRandomClientGuid, createUnconnectedPingPacket, parseUnconnectedPongPacket } from "./raknetOfflinePackets.js";
import { getSystemBroadcastAddresses, getSystemIpv4InterfaceAddresses } from "../util/network.js";

export type LanDiscoveryOptions = {
  timeoutMs?: number;
  port?: number;
  broadcastAddresses?: string[];
  listenPort?: number;
  multicastAddresses?: string[];
  multicastInterfaces?: string[];
};

export type DiscoveredLanServer = {
  host: string;
  port: number;
  advertisement: LanServerAdvertisement;
  lastSeenMs: number;
};

export type SocketLike = {
  on: (event: "message", handler: (message: Buffer, remote: { address: string; port: number }) => void) => void;
  once: (event: "error", handler: (error: Error) => void) => void;
  bind: (port: number, callback: () => void) => void;
  send: (buffer: Buffer, offset: number, length: number, port: number, address: string) => void;
  setBroadcast: (value: boolean) => void;
  addMembership?: (multicastAddress: string, multicastInterface?: string) => void;
  close: () => void;
};

export type LanDiscoveryDependencies = {
  createSocket: () => SocketLike;
  getBroadcastAddresses: () => string[];
  getMulticastInterfaces: () => string[];
  now: () => number;
  createRandomClientGuid: typeof createRandomClientGuid;
  createUnconnectedPingPacket: typeof createUnconnectedPingPacket;
  parseUnconnectedPongPacket: typeof parseUnconnectedPongPacket;
  parseAdvertisementString: typeof parseAdvertisementString;
};

const defaultLanDiscoveryDependencies: LanDiscoveryDependencies = {
  createSocket: () => dgram.createSocket({ type: "udp4", reuseAddr: true }),
  getBroadcastAddresses: getSystemBroadcastAddresses,
  getMulticastInterfaces: getSystemIpv4InterfaceAddresses,
  now: () => Date.now(),
  createRandomClientGuid,
  createUnconnectedPingPacket,
  parseUnconnectedPongPacket,
  parseAdvertisementString
};

export const discoverLanServers = async (
  options: LanDiscoveryOptions = {},
  dependencies: LanDiscoveryDependencies = defaultLanDiscoveryDependencies
): Promise<DiscoveredLanServer[]> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS;
  const port = options.port ?? DEFAULT_BEDROCK_PORT;
  const listenPort = options.listenPort ?? DEFAULT_LAN_DISCOVERY_PORT;
  const broadcastAddresses = options.broadcastAddresses ?? dependencies.getBroadcastAddresses();
  const multicastAddresses = options.multicastAddresses ?? [BEDROCK_LAN_MULTICAST_ADDRESS_V4];
  const multicastInterfaces = options.multicastInterfaces ?? dependencies.getMulticastInterfaces();
  const socket = dependencies.createSocket();
  const servers = new Map<string, DiscoveredLanServer>();
  const pingPacket = dependencies.createUnconnectedPingPacket(
    BigInt(dependencies.now()),
    dependencies.createRandomClientGuid()
  );
  return new Promise<DiscoveredLanServer[]>((resolve, reject) => {
    let socketClosed = false;
    const closeSocket = () => {
      if (socketClosed) return;
      socketClosed = true;
      socket.close();
    };
    const finish = () => {
      closeSocket();
      resolve([...servers.values()]);
    };
    const timeoutId = setTimeout(finish, timeoutMs);
    socket.on("message", (message, remote) => {
      const pong = dependencies.parseUnconnectedPongPacket(message);
      const payload = pong?.serverName ?? message.toString("utf8");
      const advertisement = dependencies.parseAdvertisementString(payload);
      if (!advertisement) return;
      const advertisedPort = advertisement.portV4 ?? advertisement.portV6;
      const serverPort = advertisedPort ?? remote.port ?? port;
      const key = `${remote.address}:${serverPort}`;
      servers.set(key, { host: remote.address, port: serverPort, advertisement, lastSeenMs: dependencies.now() });
    });
    socket.once("error", (error) => {
      clearTimeout(timeoutId);
      closeSocket();
      reject(error);
    });
    socket.bind(listenPort, () => {
      if (socket.addMembership && multicastAddresses.length > 0) {
        for (const address of multicastAddresses) {
          try {
            socket.addMembership(address);
          } catch {
            // Ignore multicast join failures to keep broadcast discovery working.
          }
          for (const multicastInterface of multicastInterfaces) {
            try {
              socket.addMembership(address, multicastInterface);
            } catch {
              // Ignore multicast join failures to keep broadcast discovery working.
              continue;
            }
          }
        }
      }
      socket.setBroadcast(true);
      for (const address of broadcastAddresses) {
        socket.send(pingPacket, 0, pingPacket.length, port, address);
      }
    });
  });
};
