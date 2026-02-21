import assert from "node:assert/strict";
import { test } from "node:test";
import type { Logger } from "pino";
import { DEFAULT_NETHERNET_PORT } from "../../src/constants.js";
import { NethernetRakClient, type DataChannelLike } from "../../src/nethernet/nethernetRakClient.js";
import { NethernetSegmentReassembler } from "../../src/nethernet/segmentation.js";

const createLogger = (): Logger => ({
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
} as unknown as Logger);

class FakeDataChannel implements DataChannelLike {
  readonly sent: Buffer[] = [];
  constructor(
    private readonly label: string,
    private readonly messageSize: number,
    private readonly sendOk: boolean = true
  ) {}
  getLabel(): string {
    return this.label;
  }
  close(): void {
    return;
  }
  sendMessageBinary(buffer: Buffer | Uint8Array): boolean {
    this.sent.push(Buffer.from(buffer));
    return this.sendOk;
  }
  onOpen(_cb: () => void): void {
    return;
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
    return true;
  }
  maxMessageSize(): number {
    return this.messageSize;
  }
}

void test("NethernetRakClient sendReliable strips batch header and segments payload", () => {
  const client = new NethernetRakClient({
    host: "192.168.0.10",
    port: DEFAULT_NETHERNET_PORT,
    clientId: 1n,
    serverId: 2n,
    logger: createLogger()
  });
  const channel = new FakeDataChannel("ReliableDataChannel", 20);
  (client as unknown as { reliableChannel: DataChannelLike }).reliableChannel = channel;
  const payload = Buffer.alloc(30, 9);
  client.sendReliable(Buffer.concat([Buffer.from([0xfe]), payload]));
  assert.equal(channel.sent.length, 2);
  assert.equal(channel.sent[0]?.readUInt8(0), 1);
  assert.equal(channel.sent[1]?.readUInt8(0), 0);
  assert.equal(Buffer.concat([channel.sent[0]!.subarray(1), channel.sent[1]!.subarray(1)]).equals(payload), true);
});

void test("NethernetRakClient ignores non-batch buffers", () => {
  const client = new NethernetRakClient({
    host: "192.168.0.10",
    port: DEFAULT_NETHERNET_PORT,
    clientId: 1n,
    serverId: 2n,
    logger: createLogger()
  });
  const channel = new FakeDataChannel("ReliableDataChannel", 100);
  (client as unknown as { reliableChannel: DataChannelLike }).reliableChannel = channel;
  client.sendReliable(Buffer.from([0x00, 0x01]));
  assert.equal(channel.sent.length, 0);
});

void test("NethernetRakClient closes when send fails", () => {
  const client = new NethernetRakClient({
    host: "192.168.0.10",
    port: DEFAULT_NETHERNET_PORT,
    clientId: 1n,
    serverId: 2n,
    logger: createLogger()
  });
  let reason: string | undefined;
  client.onCloseConnection = (value) => {
    reason = value;
  };
  (client as unknown as { reliableChannel: DataChannelLike }).reliableChannel = new FakeDataChannel("ReliableDataChannel", 100, false);
  client.sendReliable(Buffer.concat([Buffer.from([0xfe]), Buffer.alloc(5, 1)]));
  assert.equal(reason, "NetherNet send failed");
});

void test("NethernetRakClient assembles segments and forwards to onEncapsulated", () => {
  const client = new NethernetRakClient({
    host: "192.168.0.10",
    port: DEFAULT_NETHERNET_PORT,
    clientId: 1n,
    serverId: 2n,
    logger: createLogger()
  });
  const received: Buffer[] = [];
  client.onEncapsulated = (packet) => {
    received.push(Buffer.from(packet.buffer));
  };
  const payload = Buffer.from([1, 2, 3]);
  const invoke = (client as unknown as {
    handleChannelMessage: (label: string, payload: Buffer, reassembler: NethernetSegmentReassembler) => void;
  }).handleChannelMessage;
  invoke.call(client, "ReliableDataChannel", Buffer.concat([Buffer.from([0]), payload]), new NethernetSegmentReassembler());
  const first = received[0];
  if (!first) throw new Error("Expected encapsulated payload");
  assert.equal(first.equals(Buffer.concat([Buffer.from([0xfe]), payload])), true);
});

void test("NethernetRakClient ping rejects", async () => {
  const client = new NethernetRakClient({
    host: "192.168.0.10",
    port: DEFAULT_NETHERNET_PORT,
    clientId: 1n,
    serverId: 2n,
    logger: createLogger()
  });
  await assert.rejects(() => client.ping());
});

void test("NethernetRakClient close handles cleanup errors", () => {
  let warned = false;
  const client = new NethernetRakClient({
    host: "192.168.0.10",
    port: DEFAULT_NETHERNET_PORT,
    clientId: 1n,
    serverId: 2n,
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => {
        warned = true;
      },
      error: () => undefined
    } as unknown as Logger
  });
  (client as unknown as { dependencies: { cleanupRuntime: () => void } }).dependencies.cleanupRuntime = () => {
    throw new Error("boom");
  };
  client.close("reason");
  assert.equal(warned, true);
});
