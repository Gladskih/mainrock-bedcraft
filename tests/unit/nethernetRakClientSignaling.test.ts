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
  private open = false;
  private openHandler: (() => void) | undefined;
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
  onClosed(_cb: () => void): void {
    return;
  }
  onError(_cb: (err: string) => void): void {
    return;
  }
  onMessage(_cb: (msg: string | Buffer | ArrayBuffer) => void): void {
    return;
  }
  isOpen(): boolean {
    return this.open;
  }
  maxMessageSize(): number {
    return 1024;
  }
  emitOpen(): void {
    this.open = true;
    this.openHandler?.();
  }
}

class FakeSocket {
  boundPort: number | null = null;
  closed = false;
  readonly sendCalls: Array<{ port: number; address: string; buffer: Buffer }> = [];
  private messageHandler: ((message: Buffer, remote: { address: string; port: number }) => void) | undefined;
  on(event: "message", handler: (message: Buffer, remote: { address: string; port: number }) => void): void {
    if (event === "message") this.messageHandler = handler;
  }
  once(_event: "error", _handler: (error: Error) => void): void {
    return;
  }
  bind(port: number, callback: () => void): void {
    this.boundPort = port;
    callback();
  }
  close(): void {
    this.closed = true;
  }
  send(buffer: Buffer, offset: number, length: number, port: number, address: string): void {
    this.sendCalls.push({ port, address, buffer: Buffer.from(buffer.subarray(offset, offset + length)) });
  }
  emitMessage(message: Buffer): void {
    this.messageHandler?.(message, { address: "127.0.0.1", port: DEFAULT_NETHERNET_PORT });
  }
}

class FakePeerConnection implements PeerConnectionLike {
  localDescriptionSdp = "OFFER_SDP";
  localDescriptionType: DescriptionType = "offer";
  private localDescriptionHandler: ((sdp: string, type: DescriptionType) => void) | undefined;
  private localCandidateHandler: ((candidate: string, mid: string) => void) | undefined;
  private stateChangeHandler: ((state: string) => void) | undefined;
  readonly createdChannels: FakeDataChannel[] = [];
  readonly setRemoteDescriptionCalls: Array<{ sdp: string; type: DescriptionType }> = [];
  readonly addRemoteCandidateCalls: Array<{ candidate: string; mid: string }> = [];
  closed = false;
  close(): void {
    this.closed = true;
  }
  setLocalDescription(_type?: DescriptionType, _init?: LocalDescriptionInit): void {
    this.localDescriptionHandler?.(this.localDescriptionSdp, this.localDescriptionType);
  }
  setRemoteDescription(sdp: string, type: DescriptionType): void {
    this.setRemoteDescriptionCalls.push({ sdp, type });
  }
  addRemoteCandidate(candidate: string, mid: string): void {
    this.addRemoteCandidateCalls.push({ candidate, mid });
  }
  createDataChannel(label: string, _config?: DataChannelInitConfig): DataChannel {
    const channel = new FakeDataChannel(label);
    this.createdChannels.push(channel);
    return channel as unknown as DataChannel;
  }
  onLocalDescription(cb: (sdp: string, type: DescriptionType) => void): void {
    this.localDescriptionHandler = cb;
  }
  onLocalCandidate(cb: (candidate: string, mid: string) => void): void {
    this.localCandidateHandler = cb;
  }
  onStateChange(cb: (state: string) => void): void {
    this.stateChangeHandler = cb;
  }
  emitLocalCandidate(candidate: string, mid: string): void {
    this.localCandidateHandler?.(candidate, mid);
  }
  emitStateChange(state: string): void {
    this.stateChangeHandler?.(state);
  }
}

type EncodeCall = { senderId: bigint; packet: DiscoveryPacket };

const createDependencies = (
  socket: FakeSocket,
  peer: FakePeerConnection,
  encodeCalls: EncodeCall[],
  decodeResultProvider: () => DecodedDiscoveryPacket | null
): NethernetRakClientDependencies => ({
  createSocket: () => socket as unknown as ReturnType<NethernetRakClientDependencies["createSocket"]>,
  createPeerConnection: () => peer,
  encodeDiscoveryPacket: (senderId: bigint, packet: DiscoveryPacket) => {
    encodeCalls.push({ senderId, packet });
    return Buffer.from([0x01, 0x02]);
  },
  decodeDiscoveryPacket: () => decodeResultProvider(),
  splitNethernetPayload,
  createReassembler: () => new NethernetSegmentReassembler(),
  now: () => 1000
});

void test("NethernetRakClient connect sends CONNECTREQUEST offer", () => {
  const socket = new FakeSocket();
  const peer = new FakePeerConnection();
  const encodeCalls: EncodeCall[] = [];
  const client = new NethernetRakClient(
    { host: "192.168.0.10", port: DEFAULT_NETHERNET_PORT, clientId: 1n, serverId: 2n, logger: createLogger() },
    createDependencies(socket, peer, encodeCalls, () => null)
  );
  (client as unknown as { sessionId: bigint }).sessionId = 10n;
  client.connect();
  assert.equal(socket.boundPort, 0);
  assert.equal(peer.createdChannels.some((channel) => channel.getLabel() === "ReliableDataChannel"), true);
  assert.equal(peer.createdChannels.some((channel) => channel.getLabel() === "UnreliableDataChannel"), true);
  assert.equal(encodeCalls.length, 1);
  assert.equal(encodeCalls[0]?.packet.id, "message");
  assert.equal(encodeCalls[0]?.packet.message.startsWith("CONNECTREQUEST 10 "), true);
  assert.equal(socket.sendCalls.length, 1);
  assert.equal(socket.sendCalls[0]?.address, "192.168.0.10");
  assert.equal(socket.sendCalls[0]?.port, DEFAULT_NETHERNET_PORT);
});

void test("NethernetRakClient connect is idempotent", () => {
  const socket = new FakeSocket();
  const peer = new FakePeerConnection();
  const encodeCalls: EncodeCall[] = [];
  let createdSockets = 0;
  const client = new NethernetRakClient(
    { host: "192.168.0.10", port: DEFAULT_NETHERNET_PORT, clientId: 1n, serverId: 2n, logger: createLogger() },
    {
      ...createDependencies(socket, peer, encodeCalls, () => null),
      createSocket: () => {
        createdSockets += 1;
        return socket as unknown as ReturnType<NethernetRakClientDependencies["createSocket"]>;
      }
    }
  );
  client.connect();
  client.connect();
  assert.equal(createdSockets, 1);
});

void test("NethernetRakClient sends CANDIDATEADD and tracks mid", () => {
  const socket = new FakeSocket();
  const peer = new FakePeerConnection();
  const encodeCalls: EncodeCall[] = [];
  const client = new NethernetRakClient(
    { host: "192.168.0.10", port: DEFAULT_NETHERNET_PORT, clientId: 1n, serverId: 2n, logger: createLogger() },
    createDependencies(socket, peer, encodeCalls, () => null)
  );
  (client as unknown as { sessionId: bigint }).sessionId = 10n;
  peer.localDescriptionType = "answer";
  client.connect();
  peer.emitLocalCandidate("cand1", "");
  const lastCall = encodeCalls[encodeCalls.length - 1];
  if (!lastCall || lastCall.packet.id !== "message") throw new Error("Expected message packet");
  assert.equal(lastCall.packet.message.startsWith("CANDIDATEADD 10 "), true);
  assert.equal((client as unknown as { mid: string }).mid, "0");
});

void test("NethernetRakClient state change failed closes connection", () => {
  const socket = new FakeSocket();
  const peer = new FakePeerConnection();
  const encodeCalls: EncodeCall[] = [];
  const client = new NethernetRakClient(
    { host: "192.168.0.10", port: DEFAULT_NETHERNET_PORT, clientId: 1n, serverId: 2n, logger: createLogger() },
    createDependencies(socket, peer, encodeCalls, () => null)
  );
  let closeReason: string | undefined;
  client.onCloseConnection = (reason) => {
    closeReason = reason;
  };
  client.connect();
  peer.emitStateChange("failed");
  assert.equal(socket.closed, true);
  assert.equal(peer.closed, true);
  assert.equal(typeof closeReason, "string");
});

void test("NethernetRakClient marks connected after both channels open", () => {
  const socket = new FakeSocket();
  const peer = new FakePeerConnection();
  const encodeCalls: EncodeCall[] = [];
  const client = new NethernetRakClient(
    { host: "192.168.0.10", port: DEFAULT_NETHERNET_PORT, clientId: 1n, serverId: 2n, logger: createLogger() },
    createDependencies(socket, peer, encodeCalls, () => null)
  );
  let connectedCount = 0;
  client.onConnected = () => {
    connectedCount += 1;
  };
  client.connect();
  const reliable = peer.createdChannels.find((channel) => channel.getLabel() === "ReliableDataChannel");
  const unreliable = peer.createdChannels.find((channel) => channel.getLabel() === "UnreliableDataChannel");
  if (!reliable || !unreliable) throw new Error("Expected channels");
  reliable.emitOpen();
  assert.equal(connectedCount, 0);
  unreliable.emitOpen();
  assert.equal(connectedCount, 1);
  reliable.emitOpen();
  unreliable.emitOpen();
  assert.equal(connectedCount, 1);
});

void test("NethernetRakClient handles CONNECTRESPONSE discovery messages", () => {
  const socket = new FakeSocket();
  const peer = new FakePeerConnection();
  const encodeCalls: EncodeCall[] = [];
  let decoded: DecodedDiscoveryPacket | null = null;
  const client = new NethernetRakClient(
    { host: "192.168.0.10", port: DEFAULT_NETHERNET_PORT, clientId: 1n, serverId: 2n, logger: createLogger() },
    createDependencies(socket, peer, encodeCalls, () => decoded)
  );
  (client as unknown as { sessionId: bigint }).sessionId = 10n;
  client.connect();
  decoded = { senderId: 2n, packet: { id: "message", recipientId: 1n, message: "CONNECTRESPONSE 10 ANSWER_SDP" } };
  socket.emitMessage(Buffer.from([0x00]));
  assert.equal(peer.setRemoteDescriptionCalls.length, 1);
  assert.equal(peer.setRemoteDescriptionCalls[0]?.sdp, "ANSWER_SDP");
  assert.equal(peer.setRemoteDescriptionCalls[0]?.type, "answer");
});

void test("NethernetRakClient ignores discovery messages for other recipients", () => {
  const socket = new FakeSocket();
  const peer = new FakePeerConnection();
  const encodeCalls: EncodeCall[] = [];
  const decoded: DecodedDiscoveryPacket = {
    senderId: 2n,
    packet: { id: "message", recipientId: 999n, message: "CONNECTRESPONSE 10 ANSWER_SDP" }
  };
  const client = new NethernetRakClient(
    { host: "192.168.0.10", port: DEFAULT_NETHERNET_PORT, clientId: 1n, serverId: 2n, logger: createLogger() },
    createDependencies(socket, peer, encodeCalls, () => decoded)
  );
  (client as unknown as { sessionId: bigint }).sessionId = 10n;
  client.connect();
  socket.emitMessage(Buffer.from([0x00]));
  assert.equal(peer.setRemoteDescriptionCalls.length, 0);
});

void test("NethernetRakClient closes on segment errors", () => {
  const socket = new FakeSocket();
  const peer = new FakePeerConnection();
  const encodeCalls: EncodeCall[] = [];
  const client = new NethernetRakClient(
    { host: "192.168.0.10", port: DEFAULT_NETHERNET_PORT, clientId: 1n, serverId: 2n, logger: createLogger() },
    createDependencies(socket, peer, encodeCalls, () => null)
  );
  let closeReason: string | undefined;
  client.onCloseConnection = (reason) => {
    closeReason = reason;
  };
  const invoke = (client as unknown as {
    handleChannelMessage: (label: string, payload: Buffer, reassembler: NethernetSegmentReassembler) => void;
  }).handleChannelMessage;
  invoke.call(client, "ReliableDataChannel", Buffer.alloc(0), new NethernetSegmentReassembler());
  assert.equal(closeReason, "NetherNet segment error");
});
