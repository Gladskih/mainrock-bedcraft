import assert from "node:assert/strict";
import { test } from "node:test";
import type { DataChannel, DataChannelInitConfig, DescriptionType, LocalDescriptionInit } from "node-datachannel";
import type { Logger } from "pino";
import { DEFAULT_NETHERNET_PORT } from "../../src/constants.js";
import type { DecodedDiscoveryPacket, DiscoveryPacket } from "../../src/nethernet/discoveryPackets.js";
import { NethernetRakClient, type DataChannelLike, type NethernetRakClientDependencies, type PeerConnectionLike } from "../../src/nethernet/nethernetRakClient.js";
import { NethernetSegmentReassembler, splitNethernetPayload } from "../../src/nethernet/segmentation.js";

const createLogger = (): Logger => ({
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
} as unknown as Logger);

class FakeDataChannel implements DataChannelLike {
  private openHandler: (() => void) | undefined;
  private closedHandler: (() => void) | undefined;
  private errorHandler: ((err: string) => void) | undefined;
  constructor(private readonly label: string) {}
  getLabel(): string {
    return this.label;
  }
  close(): void {
    return;
  }
  sendMessageBinary(_buffer: Buffer | Uint8Array): boolean {
    return true;
  }
  onOpen(cb: () => void): void {
    this.openHandler = cb;
  }
  onClosed(cb: () => void): void {
    this.closedHandler = cb;
  }
  onError(cb: (err: string) => void): void {
    this.errorHandler = cb;
  }
  onMessage(_cb: (msg: string | Buffer | ArrayBuffer) => void): void {
    return;
  }
  isOpen(): boolean {
    return false;
  }
  maxMessageSize(): number {
    return 1024;
  }
  emitOpen(): void {
    this.openHandler?.();
  }
  emitClosed(): void {
    this.closedHandler?.();
  }
  emitError(error: string): void {
    this.errorHandler?.(error);
  }
}

class FakeSocket {
  private messageHandler: ((message: Buffer, remote: { address: string; port: number }) => void) | undefined;
  private errorHandler: ((error: Error) => void) | undefined;
  on(event: "message", handler: (message: Buffer, remote: { address: string; port: number }) => void): void {
    if (event === "message") this.messageHandler = handler;
  }
  once(event: "error", handler: (error: Error) => void): void {
    if (event === "error") this.errorHandler = handler;
  }
  bind(_port: number, callback: () => void): void {
    callback();
  }
  close(): void {
    return;
  }
  send(_buffer: Buffer, _offset: number, _length: number, _port: number, _address: string): void {
    return;
  }
  emitMessage(message: Buffer): void {
    this.messageHandler?.(message, { address: "127.0.0.1", port: DEFAULT_NETHERNET_PORT });
  }
  emitError(error: Error): void {
    this.errorHandler?.(error);
  }
}

class FakePeerConnection implements PeerConnectionLike {
  private stateHandler: ((state: string) => void) | undefined;
  readonly createdChannels: FakeDataChannel[] = [];
  readonly addRemoteCandidateCalls: Array<{ candidate: string; mid: string }> = [];
  close(): void {
    return;
  }
  setLocalDescription(_type?: DescriptionType, _init?: LocalDescriptionInit): void {
    return;
  }
  setRemoteDescription(_sdp: string, _type: DescriptionType): void {
    return;
  }
  addRemoteCandidate(candidate: string, mid: string): void {
    this.addRemoteCandidateCalls.push({ candidate, mid });
  }
  createDataChannel(label: string, _config?: DataChannelInitConfig): DataChannel {
    const channel = new FakeDataChannel(label);
    this.createdChannels.push(channel);
    return channel as unknown as DataChannel;
  }
  onLocalDescription(_cb: (sdp: string, type: DescriptionType) => void): void {
    return;
  }
  onLocalCandidate(_cb: (candidate: string, mid: string) => void): void {
    return;
  }
  onStateChange(cb: (state: string) => void): void {
    this.stateHandler = cb;
  }
  emitStateChange(state: string): void {
    this.stateHandler?.(state);
  }
}

const createDependencies = (
  socket: FakeSocket,
  peer: FakePeerConnection,
  decodeResultProvider: () => DecodedDiscoveryPacket | null
): NethernetRakClientDependencies => ({
  createSocket: () => socket as unknown as ReturnType<NethernetRakClientDependencies["createSocket"]>,
  createPeerConnection: () => peer,
  encodeDiscoveryPacket: (_senderId: bigint, _packet: DiscoveryPacket) => Buffer.from([0x01]),
  decodeDiscoveryPacket: () => decodeResultProvider(),
  splitNethernetPayload,
  createReassembler: () => new NethernetSegmentReassembler(),
  now: () => 1000
});

void test("NethernetRakClient closes on socket error", () => {
  const socket = new FakeSocket();
  const peer = new FakePeerConnection();
  const client = new NethernetRakClient(
    { host: "192.168.0.10", port: DEFAULT_NETHERNET_PORT, clientId: 1n, serverId: 2n, logger: createLogger() },
    createDependencies(socket, peer, () => null)
  );
  let reason: string | undefined;
  client.onCloseConnection = (value) => {
    reason = value;
  };
  client.connect();
  socket.emitError(new Error("boom"));
  assert.equal(reason, "NetherNet socket error");
});

void test("NethernetRakClient closes on channel closed", () => {
  const socket = new FakeSocket();
  const peer = new FakePeerConnection();
  const client = new NethernetRakClient(
    { host: "192.168.0.10", port: DEFAULT_NETHERNET_PORT, clientId: 1n, serverId: 2n, logger: createLogger() },
    createDependencies(socket, peer, () => null)
  );
  let reason: string | undefined;
  client.onCloseConnection = (value) => {
    reason = value;
  };
  client.connect();
  const channel = peer.createdChannels.find((created) => created.getLabel() === "ReliableDataChannel");
  if (!channel) throw new Error("Expected data channel");
  channel.emitClosed();
  assert.equal(reason, "NetherNet channel closed");
});

void test("NethernetRakClient closes on channel error", () => {
  const socket = new FakeSocket();
  const peer = new FakePeerConnection();
  const client = new NethernetRakClient(
    { host: "192.168.0.10", port: DEFAULT_NETHERNET_PORT, clientId: 1n, serverId: 2n, logger: createLogger() },
    createDependencies(socket, peer, () => null)
  );
  let reason: string | undefined;
  client.onCloseConnection = (value) => {
    reason = value;
  };
  client.connect();
  const channel = peer.createdChannels.find((created) => created.getLabel() === "ReliableDataChannel");
  if (!channel) throw new Error("Expected data channel");
  channel.emitError("boom");
  assert.equal(reason, "NetherNet channel error");
});

void test("NethernetRakClient handles CANDIDATEADD discovery messages", () => {
  const socket = new FakeSocket();
  const peer = new FakePeerConnection();
  let decoded: DecodedDiscoveryPacket | null = null;
  const client = new NethernetRakClient(
    { host: "192.168.0.10", port: DEFAULT_NETHERNET_PORT, clientId: 1n, serverId: 2n, logger: createLogger() },
    createDependencies(socket, peer, () => decoded)
  );
  (client as unknown as { sessionId: bigint }).sessionId = 10n;
  client.connect();
  decoded = { senderId: 2n, packet: { id: "message", recipientId: 1n, message: "CANDIDATEADD 10 candidate1" } };
  socket.emitMessage(Buffer.from([0x00]));
  assert.deepEqual(peer.addRemoteCandidateCalls, [{ candidate: "candidate1", mid: "0" }]);
});
