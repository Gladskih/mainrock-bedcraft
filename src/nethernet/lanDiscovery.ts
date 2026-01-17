import dgram from "node:dgram";
import { randomBytes } from "node:crypto";
import { DEFAULT_DISCOVERY_TIMEOUT_MS, DEFAULT_NETHERNET_DISCOVERY_REQUEST_INTERVAL_MS, DEFAULT_NETHERNET_PORT } from "../constants.js";
import { getSystemBroadcastAddresses } from "../util/network.js";
import { decodeDiscoveryPacket, encodeDiscoveryPacket, type NethernetServerData } from "./discoveryPackets.js";

export type NethernetLanDiscoveryOptions = {
  timeoutMs?: number;
  port?: number;
  listenPort?: number;
  broadcastAddresses?: string[];
  onServer?: (server: DiscoveredNethernetLanServer) => void;
};

export type DiscoveredNethernetLanServer = {
  host: string;
  port: number;
  senderId: bigint;
  serverData: NethernetServerData;
  lastSeenMs: number;
  latencyMs: number | null;
};

export type SocketLike = {
  on: (event: "message", handler: (message: Buffer, remote: { address: string; port: number }) => void) => void;
  once: (event: "error", handler: (error: Error) => void) => void;
  bind: (port: number, callback: () => void) => void;
  send: (buffer: Buffer, offset: number, length: number, port: number, address: string) => void;
  setBroadcast: (value: boolean) => void;
  close: () => void;
};

export type NethernetLanDiscoveryDependencies = {
  createSocket: () => SocketLike;
  getBroadcastAddresses: () => string[];
  now: () => number;
  createRandomSenderId: () => bigint;
  encodeDiscoveryPacket: typeof encodeDiscoveryPacket;
  decodeDiscoveryPacket: typeof decodeDiscoveryPacket;
};

const createRandomSenderId = (): bigint => randomBytes(8).readBigUInt64BE();

const defaultNethernetLanDiscoveryDependencies: NethernetLanDiscoveryDependencies = {
  createSocket: () => dgram.createSocket({ type: "udp4", reuseAddr: true }),
  getBroadcastAddresses: getSystemBroadcastAddresses,
  now: () => Date.now(),
  createRandomSenderId,
  encodeDiscoveryPacket,
  decodeDiscoveryPacket
};

export const discoverNethernetLanServers = async (
  options: NethernetLanDiscoveryOptions = {},
  dependencies: NethernetLanDiscoveryDependencies = defaultNethernetLanDiscoveryDependencies
): Promise<DiscoveredNethernetLanServer[]> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS;
  const port = options.port ?? DEFAULT_NETHERNET_PORT;
  const listenPort = options.listenPort ?? 0;
  const broadcastAddresses = options.broadcastAddresses ?? dependencies.getBroadcastAddresses();
  const socket = dependencies.createSocket();
  const servers = new Map<string, DiscoveredNethernetLanServer>();
  const senderId = dependencies.createRandomSenderId();
  const request = dependencies.encodeDiscoveryPacket(senderId, { id: "request" });
  return new Promise<DiscoveredNethernetLanServer[]>((resolve, reject) => {
    let socketClosed = false;
    let latestRequestSentAtMs = dependencies.now();
    let requestIntervalId: ReturnType<typeof setInterval> | null = null;
    const closeSocket = () => {
      if (socketClosed) return;
      socketClosed = true;
      if (requestIntervalId) clearInterval(requestIntervalId);
      socket.close();
    };
    const finish = () => {
      closeSocket();
      resolve([...servers.values()]);
    };
    const timeoutId = setTimeout(finish, timeoutMs);
    const sendRequest = () => {
      if (socketClosed) return;
      latestRequestSentAtMs = dependencies.now();
      for (const address of broadcastAddresses) {
        socket.send(request, 0, request.length, port, address);
      }
    };
    socket.on("message", (message, remote) => {
      const decoded = dependencies.decodeDiscoveryPacket(message);
      if (!decoded) return;
      if (decoded.packet.id !== "response") return;
      const key = `${remote.address}:${port}`;
      const alreadySeen = servers.has(key);
      const nowMs = dependencies.now();
      const server = {
        host: remote.address,
        port,
        senderId: decoded.senderId,
        serverData: decoded.packet.serverData,
        lastSeenMs: nowMs,
        latencyMs: Math.max(0, Math.round(nowMs - latestRequestSentAtMs))
      };
      servers.set(key, server);
      if (!alreadySeen && options.onServer) options.onServer(server);
    });
    socket.once("error", (error) => {
      clearTimeout(timeoutId);
      closeSocket();
      reject(error);
    });
    socket.bind(listenPort, () => {
      if (socketClosed) return;
      socket.setBroadcast(true);
      sendRequest();
      requestIntervalId = setInterval(sendRequest, DEFAULT_NETHERNET_DISCOVERY_REQUEST_INTERVAL_MS);
    });
  });
};
