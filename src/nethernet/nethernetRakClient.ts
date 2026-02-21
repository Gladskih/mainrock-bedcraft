import dgram from "node:dgram";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import type nodeDataChannelType from "node-datachannel";
import type { DataChannelInitConfig, DescriptionType } from "node-datachannel";
import type { Logger } from "pino";
import { APPLICATION_ID, DEFAULT_NETHERNET_PORT, NETHERNET_MAX_SEGMENT_BYTES } from "../constants.js";
import { decodeDiscoveryPacket, encodeDiscoveryPacket } from "./discoveryPackets.js";
import { NethernetSegmentReassembler, splitNethernetPayload } from "./segmentation.js";
import type { DataChannelLike, DatagramRemoteInfo, DatagramSocketLike, EncapsulatedPacketLike, PeerConnectionLike } from "./nethernetRakClientTypes.js";
export type { DataChannelLike, EncapsulatedPacketLike, PeerConnectionLike } from "./nethernetRakClientTypes.js";

const require = createRequire(import.meta.url);
let cachedNodeDataChannel: typeof nodeDataChannelType | null = null;

const RELIABLE_DATA_CHANNEL_LABEL = "ReliableDataChannel";
const UNRELIABLE_DATA_CHANNEL_LABEL = "UnreliableDataChannel";
const DEFAULT_SDP_MID = "0";
const DISCOVERY_MESSAGE_SEPARATOR = " ";
const MIN_DISCOVERY_MESSAGE_PARTS = 2;
const PACKET_LOG_SAMPLE_LIMIT = 5; // Limit packet summary logs to avoid log spam during join.
const SEGMENT_LOG_SAMPLE_LIMIT = 60; // Log initial NetherNet segments to debug large packets (e.g. login/resource packs) without flooding.

const getNodeDataChannel = (): typeof nodeDataChannelType => {
  if (cachedNodeDataChannel) return cachedNodeDataChannel;
  cachedNodeDataChannel = require("node-datachannel") as typeof nodeDataChannelType;
  return cachedNodeDataChannel;
};

export type NethernetRakClientOptions = {
  host: string;
  port?: number;
  clientId: bigint;
  serverId: bigint;
  logger: Logger;
};

export type NethernetRakClientDependencies = {
  createSocket: () => DatagramSocketLike;
  createPeerConnection: () => PeerConnectionLike;
  cleanupRuntime?: () => void;
  encodeDiscoveryPacket: typeof encodeDiscoveryPacket;
  decodeDiscoveryPacket: typeof decodeDiscoveryPacket;
  splitNethernetPayload: typeof splitNethernetPayload;
  createReassembler: () => NethernetSegmentReassembler;
  now: () => number;
};

const createPeerConnection = (): PeerConnectionLike => {
  const nodeDataChannel = getNodeDataChannel();
  nodeDataChannel.preload();
  return new nodeDataChannel.PeerConnection(APPLICATION_ID, { iceServers: [] });
};

const defaultNethernetRakClientDependencies: NethernetRakClientDependencies = {
  createSocket: () => dgram.createSocket({ type: "udp4", reuseAddr: true }),
  createPeerConnection,
  cleanupRuntime: () => getNodeDataChannel().cleanup(),
  encodeDiscoveryPacket,
  decodeDiscoveryPacket,
  splitNethernetPayload,
  createReassembler: () => new NethernetSegmentReassembler(),
  now: () => Date.now()
};

const toUint64 = (): bigint => randomBytes(8).readBigUInt64BE();

const toBuffer = (value: string | Buffer | ArrayBuffer): Buffer => {
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (value instanceof Buffer) return value;
  return Buffer.from(new Uint8Array(value));
};

const parseDiscoveryMessage = (message: string): { type: string; sessionId: string; data: string } | null => {
  const parts = message.split(DISCOVERY_MESSAGE_SEPARATOR);
  if (parts.length < MIN_DISCOVERY_MESSAGE_PARTS) return null;
  const [type, sessionId, ...rest] = parts;
  if (!type || !sessionId) return null;
  return { type, sessionId, data: rest.join(DISCOVERY_MESSAGE_SEPARATOR) };
};

export class NethernetRakClient {
  connected = false;
  onConnected: () => void = () => undefined;
  onCloseConnection: (reason?: string) => void = () => undefined;
  onEncapsulated: (packet: EncapsulatedPacketLike, address: string) => void = () => undefined;

  private socket: DatagramSocketLike | null = null;
  private peer: PeerConnectionLike | null = null;
  private reliableChannel: DataChannelLike | null = null;
  private unreliableChannel: DataChannelLike | null = null;
  private sessionId: bigint = toUint64();
  private mid: string = DEFAULT_SDP_MID;
  private reliableReassembler: NethernetSegmentReassembler;
  private unreliableReassembler: NethernetSegmentReassembler;
  private connectedAtMs: number | null = null;
  private connectStarted = false;
  private closed = false;
  private sentPacketLogs = 0;
  private receivedPacketLogs = 0;
  private sentSegmentLogs = 0;
  private receivedSegmentLogs = 0;

  constructor(
    private readonly options: NethernetRakClientOptions,
    private readonly dependencies: NethernetRakClientDependencies = defaultNethernetRakClientDependencies
  ) {
    this.reliableReassembler = dependencies.createReassembler();
    this.unreliableReassembler = dependencies.createReassembler();
  }

  connect(): void {
    if (this.connectStarted) return;
    this.connectStarted = true;
    this.socket = this.dependencies.createSocket();
    this.peer = this.dependencies.createPeerConnection();
    this.registerPeerEvents(this.peer);
    this.registerSocketEvents(this.socket);
    this.socket.bind(0, () => {
      if (!this.peer) return;
      this.createChannels(this.peer);
      this.peer.setLocalDescription("offer");
      this.options.logger.info({ event: "nethernet_offer", sessionId: this.sessionId.toString() }, "NetherNet offer created");
    });
  }

  close(reason?: string): void {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    this.reliableChannel?.close();
    this.unreliableChannel?.close();
    this.peer?.close();
    this.socket?.close();
    try {
      (this.dependencies.cleanupRuntime ?? defaultNethernetRakClientDependencies.cleanupRuntime)?.();
    } catch (error) {
      this.options.logger.warn({ event: "nethernet_cleanup_error", error: error instanceof Error ? error.message : String(error) }, "NetherNet cleanup failed");
    }
    this.onCloseConnection(reason);
  }

  ping(_timeout?: number): Promise<string> {
    return Promise.reject(new Error("NetherNet ping is not supported via bedrock-protocol"));
  }

  sendReliable(buffer: Buffer): void {
    if (!this.reliableChannel || !this.reliableChannel.isOpen()) return;
    if (buffer.length < 2 || buffer.readUInt8(0) !== 0xfe) return;
    const payload = buffer.subarray(1);
    if (this.sentPacketLogs < PACKET_LOG_SAMPLE_LIMIT) {
      this.sentPacketLogs += 1;
      const firstByte = payload.length > 0 ? payload.readUInt8(0) : null;
      const hexPrefix = payload.subarray(0, Math.min(8, payload.length)).toString("hex");
      this.options.logger.debug(
        { event: "nethernet_send", label: RELIABLE_DATA_CHANNEL_LABEL, bytes: payload.length, firstByte, hexPrefix },
        "NetherNet outbound packet"
      );
    }
    const maxSegmentBytes = Math.min(
      NETHERNET_MAX_SEGMENT_BYTES,
      Math.max(1, this.reliableChannel.maxMessageSize() - 1)
    );
    for (const segment of this.dependencies.splitNethernetPayload(payload, maxSegmentBytes)) {
      if (this.sentSegmentLogs < SEGMENT_LOG_SAMPLE_LIMIT) {
        this.sentSegmentLogs += 1;
        this.options.logger.debug(
          { event: "nethernet_segment_send", label: RELIABLE_DATA_CHANNEL_LABEL, bytes: segment.length, remainingSegments: segment.readUInt8(0) },
          "NetherNet outbound segment"
        );
      }
      const ok = this.reliableChannel.sendMessageBinary(segment);
      if (!ok) this.close("NetherNet send failed");
    }
  }

  private registerSocketEvents(socket: DatagramSocketLike): void {
    socket.on("message", (message: Buffer, remote: DatagramRemoteInfo) => this.handleDiscoveryPacket(message, remote));
    socket.once("error", (error: Error) => {
      this.options.logger.error({ event: "nethernet_socket_error", error: error.message }, "NetherNet socket error");
      this.close("NetherNet socket error");
    });
  }

  private registerPeerEvents(peer: PeerConnectionLike): void {
    peer.onLocalDescription((sdp: string, type: DescriptionType) => {
      if (type !== "offer") return;
      this.sendDiscoveryMessage(`CONNECTREQUEST ${this.sessionId.toString()} ${sdp}`);
    });
    peer.onLocalCandidate((candidate: string, mid: string) => {
      this.mid = mid || DEFAULT_SDP_MID;
      this.sendDiscoveryMessage(`CANDIDATEADD ${this.sessionId.toString()} ${candidate}`);
    });
    peer.onStateChange((state: string) => {
      if (state === "failed" || state === "closed") this.close(`NetherNet peer state: ${state}`);
    });
  }

  private createChannels(peer: PeerConnectionLike): void {
    const reliable = peer.createDataChannel(RELIABLE_DATA_CHANNEL_LABEL) as unknown as DataChannelLike;
    const unreliable = peer.createDataChannel(
      UNRELIABLE_DATA_CHANNEL_LABEL,
      { unordered: true, maxRetransmits: 0 } satisfies DataChannelInitConfig
    ) as unknown as DataChannelLike;
    this.reliableChannel = reliable;
    this.unreliableChannel = unreliable;
    this.registerChannelEvents(reliable, this.reliableReassembler);
    this.registerChannelEvents(unreliable, this.unreliableReassembler);
  }

  private registerChannelEvents(channel: DataChannelLike, reassembler: NethernetSegmentReassembler): void {
    channel.onOpen(() => {
      this.options.logger.info({ event: "nethernet_channel_open", label: channel.getLabel() }, "NetherNet data channel open");
      this.maybeMarkConnected();
    });
    channel.onClosed(() => {
      this.options.logger.info({ event: "nethernet_channel_closed", label: channel.getLabel() }, "NetherNet data channel closed");
      this.close("NetherNet channel closed");
    });
    channel.onError((error: string) => {
      this.options.logger.error({ event: "nethernet_channel_error", label: channel.getLabel(), error }, "NetherNet data channel error");
      this.close("NetherNet channel error");
    });
    channel.onMessage((message) => this.handleChannelMessage(channel.getLabel(), toBuffer(message), reassembler));
  }

  private maybeMarkConnected(): void {
    if (!this.reliableChannel || !this.reliableChannel.isOpen()) return;
    if (!this.unreliableChannel || !this.unreliableChannel.isOpen()) return;
    if (this.connectedAtMs !== null) return;
    this.connected = true;
    this.connectedAtMs = this.dependencies.now();
    this.options.logger.info({ event: "nethernet_connected", sessionId: this.sessionId.toString() }, "NetherNet transport ready");
    this.onConnected();
  }

  private handleChannelMessage(label: string, payload: Buffer, reassembler: NethernetSegmentReassembler): void {
    try {
      if (this.receivedSegmentLogs < SEGMENT_LOG_SAMPLE_LIMIT) {
        this.receivedSegmentLogs += 1;
        this.options.logger.debug(
          { event: "nethernet_segment_receive", label, bytes: payload.length, remainingSegments: payload.length > 0 ? payload.readUInt8(0) : null },
          "NetherNet inbound segment"
        );
      }
      const completed = reassembler.consume(payload);
      if (!completed) return;
      const packet = Buffer.concat([Buffer.from([0xfe]), completed]);
      if (this.receivedPacketLogs < PACKET_LOG_SAMPLE_LIMIT) {
        this.receivedPacketLogs += 1;
        const firstByte = completed.length > 0 ? completed.readUInt8(0) : null;
        const hexPrefix = completed.subarray(0, Math.min(8, completed.length)).toString("hex");
        this.options.logger.debug(
          { event: "nethernet_receive", label, bytes: completed.length, firstByte, hexPrefix },
          "NetherNet inbound packet"
        );
      }
      this.onEncapsulated({ buffer: packet }, `${this.options.host}:${this.options.port ?? DEFAULT_NETHERNET_PORT}`);
    } catch (error) {
      this.options.logger.warn({ event: "nethernet_segment_error", label, error: error instanceof Error ? error.message : String(error) }, "NetherNet segment error");
      this.close("NetherNet segment error");
    }
  }

  private handleDiscoveryPacket(message: Buffer, _remote: DatagramRemoteInfo): void {
    const decoded = this.dependencies.decodeDiscoveryPacket(message);
    if (!decoded) return;
    if (decoded.packet.id !== "message") return;
    if (decoded.packet.recipientId !== this.options.clientId) return;
    const parsed = parseDiscoveryMessage(decoded.packet.message);
    if (!parsed) return;
    if (parsed.sessionId !== this.sessionId.toString()) return;
    if (parsed.type === "CONNECTRESPONSE") this.handleConnectResponse(parsed.data);
    if (parsed.type === "CANDIDATEADD") this.handleRemoteCandidate(parsed.data);
  }

  private handleConnectResponse(sdp: string): void {
    if (!this.peer) return;
    this.peer.setRemoteDescription(sdp, "answer");
    this.options.logger.info({ event: "nethernet_answer" }, "NetherNet answer received");
  }

  private handleRemoteCandidate(candidate: string): void {
    if (!this.peer) return;
    this.peer.addRemoteCandidate(candidate, this.mid || DEFAULT_SDP_MID);
  }

  private sendDiscoveryMessage(message: string): void {
    if (!this.socket) return;
    const packet = this.dependencies.encodeDiscoveryPacket(this.options.clientId, { id: "message", recipientId: this.options.serverId, message });
    this.socket.send(packet, 0, packet.length, this.options.port ?? DEFAULT_NETHERNET_PORT, this.options.host);
  }
}
