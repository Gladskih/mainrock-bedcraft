import assert from "node:assert/strict";
import { test } from "node:test";
import { discoverNethernetLanServers, type SocketLike } from "../../src/nethernet/lanDiscovery.js";
import { decodeDiscoveryPacket, encodeDiscoveryPacket, type NethernetServerData } from "../../src/nethernet/discoveryPackets.js";

class FakeSocket implements SocketLike {
  private messageHandler: ((message: Buffer, remote: { address: string; port: number }) => void) | undefined;
  private errorHandler: ((error: Error) => void) | undefined;
  boundPort: number | null = null;
  closeCalls = 0;
  readonly sendCalls: Array<{ address: string; port: number; buffer: Buffer }> = [];
  on(event: "message", handler: (message: Buffer, remote: { address: string; port: number }) => void): void {
    if (event === "message") this.messageHandler = handler;
  }
  once(event: "error", handler: (error: Error) => void): void {
    if (event === "error") this.errorHandler = handler;
  }
  bind(_port: number, callback: () => void): void {
    this.boundPort = _port;
    callback();
  }
  send(_buffer: Buffer, _offset: number, _length: number, _port: number, _address: string): void {
    this.sendCalls.push({
      address: _address,
      port: _port,
      buffer: Buffer.from(_buffer.subarray(_offset, _offset + _length))
    });
  }
  setBroadcast(_value: boolean): void {
    return;
  }
  close(): void {
    this.closeCalls += 1;
  }
  emitMessage(message: Buffer, remote: { address: string; port: number }): void {
    this.messageHandler?.(message, remote);
  }
  emitError(error: Error): void {
    this.errorHandler?.(error);
  }
}

const createServerData = (): NethernetServerData => ({
  nethernetVersion: 2,
  serverName: "Server",
  levelName: "World",
  gameType: 0,
  playersOnline: 1,
  playersMax: 10,
  editorWorld: false,
  transportLayer: 2
});

void test("discoverNethernetLanServers collects response packets", async () => {
  const socket = new FakeSocket();
  const serverData = createServerData();
  const promise = discoverNethernetLanServers({ timeoutMs: 10, broadcastAddresses: ["255.255.255.255"] }, {
    createSocket: () => socket,
    getBroadcastAddresses: () => [],
    now: () => 1000,
    createRandomSenderId: () => 123n,
    encodeDiscoveryPacket,
    decodeDiscoveryPacket
  });
  socket.emitMessage(encodeDiscoveryPacket(999n, { id: "response", serverData }), { address: "192.168.1.2", port: 7551 });
  const servers = await promise;
  assert.equal(servers.length, 1);
  assert.equal(servers[0]?.host, "192.168.1.2");
  assert.equal(servers[0]?.senderId, 999n);
});

void test("discoverNethernetLanServers ignores non-response packets", async () => {
  const socket = new FakeSocket();
  const promise = discoverNethernetLanServers({ timeoutMs: 10, broadcastAddresses: ["255.255.255.255"] }, {
    createSocket: () => socket,
    getBroadcastAddresses: () => [],
    now: () => 1000,
    createRandomSenderId: () => 123n,
    encodeDiscoveryPacket,
    decodeDiscoveryPacket
  });
  socket.emitMessage(encodeDiscoveryPacket(999n, { id: "request" }), { address: "192.168.1.3", port: 7551 });
  const servers = await promise;
  assert.equal(servers.length, 0);
});

void test("discoverNethernetLanServers rejects on socket error", async () => {
  const socket = new FakeSocket();
  const promise = discoverNethernetLanServers({ timeoutMs: 10, broadcastAddresses: ["255.255.255.255"] }, {
    createSocket: () => socket,
    getBroadcastAddresses: () => [],
    now: () => 1000,
    createRandomSenderId: () => 123n,
    encodeDiscoveryPacket,
    decodeDiscoveryPacket
  });
  socket.emitError(new Error("boom"));
  await assert.rejects(() => promise);
});

void test("discoverNethernetLanServers uses default broadcast addresses", async () => {
  const socket = new FakeSocket();
  const promise = discoverNethernetLanServers({ timeoutMs: 1 }, {
    createSocket: () => socket,
    getBroadcastAddresses: () => ["192.168.1.255"],
    now: () => 1000,
    createRandomSenderId: () => 123n,
    encodeDiscoveryPacket,
    decodeDiscoveryPacket
  });
  await promise;
  assert.equal(socket.sendCalls.some((call) => call.address === "192.168.1.255"), true);
});

void test("discoverNethernetLanServers binds to configured listenPort and sends to configured port", async () => {
  const socket = new FakeSocket();
  const promise = discoverNethernetLanServers({ timeoutMs: 1, port: 9999, listenPort: 8888, broadcastAddresses: ["255.255.255.255"] }, {
    createSocket: () => socket,
    getBroadcastAddresses: () => [],
    now: () => 1000,
    createRandomSenderId: () => 123n,
    encodeDiscoveryPacket,
    decodeDiscoveryPacket
  });
  await promise;
  assert.equal(socket.boundPort, 8888);
  assert.equal(socket.sendCalls[0]?.port, 9999);
});

void test("discoverNethernetLanServers ignores invalid packets", async () => {
  const socket = new FakeSocket();
  const promise = discoverNethernetLanServers({ timeoutMs: 10, broadcastAddresses: ["255.255.255.255"] }, {
    createSocket: () => socket,
    getBroadcastAddresses: () => [],
    now: () => 1000,
    createRandomSenderId: () => 123n,
    encodeDiscoveryPacket,
    decodeDiscoveryPacket
  });
  socket.emitMessage(Buffer.from([0x00]), { address: "192.168.1.3", port: 7551 });
  const servers = await promise;
  assert.equal(servers.length, 0);
});

void test("discoverNethernetLanServers closes socket only once", async () => {
  const socket = new FakeSocket();
  const promise = discoverNethernetLanServers({ timeoutMs: 1, broadcastAddresses: ["255.255.255.255"] }, {
    createSocket: () => socket,
    getBroadcastAddresses: () => [],
    now: () => 1000,
    createRandomSenderId: () => 123n,
    encodeDiscoveryPacket,
    decodeDiscoveryPacket
  });
  await promise;
  socket.emitError(new Error("boom"));
  assert.equal(socket.closeCalls, 1);
});
