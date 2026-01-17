import assert from "node:assert/strict";
import { test } from "node:test";
import { BEDROCK_LAN_MULTICAST_ADDRESS_V4, RAKNET_LONG_LENGTH_BYTES, RAKNET_MAGIC, RAKNET_MAGIC_LENGTH_BYTES, RAKNET_UNCONNECTED_PONG_ID } from "../../src/constants.js";
import { discoverLanServers, type SocketLike } from "../../src/bedrock/lanDiscovery.js";
import { parseAdvertisementString } from "../../src/bedrock/advertisementParser.js";
import { createRandomClientGuid, createUnconnectedPingPacket, parseUnconnectedPongPacket } from "../../src/bedrock/raknetOfflinePackets.js";

const STRING_LENGTH_BYTES = 2;

const buildUnconnectedPong = (serverName: string): Buffer => {
  const nameBuffer = Buffer.from(serverName, "utf8");
  const length = 1
    + RAKNET_LONG_LENGTH_BYTES
    + RAKNET_LONG_LENGTH_BYTES
    + RAKNET_MAGIC_LENGTH_BYTES
    + STRING_LENGTH_BYTES
    + nameBuffer.length;
  const buffer = Buffer.alloc(length);
  buffer.writeUInt8(RAKNET_UNCONNECTED_PONG_ID, 0);
  buffer.writeBigUInt64BE(1n, 1);
  buffer.writeBigUInt64BE(2n, 1 + RAKNET_LONG_LENGTH_BYTES);
  RAKNET_MAGIC.copy(buffer, 1 + RAKNET_LONG_LENGTH_BYTES + RAKNET_LONG_LENGTH_BYTES);
  const lengthOffset = 1 + RAKNET_LONG_LENGTH_BYTES + RAKNET_LONG_LENGTH_BYTES + RAKNET_MAGIC_LENGTH_BYTES;
  buffer.writeUInt16BE(nameBuffer.length, lengthOffset);
  nameBuffer.copy(buffer, lengthOffset + STRING_LENGTH_BYTES);
  return buffer;
};

class FakeSocket implements SocketLike {
  private messageHandler: ((message: Buffer, remote: { address: string; port: number }) => void) | undefined;
  private errorHandler: ((error: Error) => void) | undefined;
  membershipCalls: Array<{ address: string; multicastInterface?: string }> = [];
  on(event: "message", handler: (message: Buffer, remote: { address: string; port: number }) => void): void {
    if (event === "message") this.messageHandler = handler;
  }
  once(event: "error", handler: (error: Error) => void): void {
    if (event === "error") this.errorHandler = handler;
  }
  bind(_port: number, callback: () => void): void {
    callback();
  }
  send(_buffer: Buffer, _offset: number, _length: number, _port: number, _address: string): void {
    return;
  }
  setBroadcast(_value: boolean): void {
    return;
  }
  addMembership(address: string, multicastInterface?: string): void {
    this.membershipCalls.push(multicastInterface ? { address, multicastInterface } : { address });
  }
  close(): void {
    return;
  }
  emitMessage(message: Buffer, remote: { address: string; port: number }): void {
    this.messageHandler?.(message, remote);
  }
  emitError(error: Error): void {
    this.errorHandler?.(error);
  }
}

void test("discoverLanServers collects pong data", async () => {
  const socket = new FakeSocket();
  const advertisement = "MCPE;Server;754;1.21.80;1;10;id;World;Survival;1;19132;";
  const promise = discoverLanServers({ timeoutMs: 10 }, {
    createSocket: () => socket,
    getBroadcastAddresses: () => ["255.255.255.255"],
    getMulticastInterfaces: () => [],
    now: () => 1000,
    createRandomClientGuid,
    createUnconnectedPingPacket,
    parseUnconnectedPongPacket,
    parseAdvertisementString: (message) => parseAdvertisementString(message)
  });
  socket.emitMessage(buildUnconnectedPong(advertisement), { address: "192.168.1.2", port: 19132 });
  const servers = await promise;
  assert.equal(servers.length, 1);
  const first = servers[0];
  assert.ok(first);
  assert.equal(first.host, "192.168.1.2");
});

void test("discoverLanServers uses remote port when advertisement omits ports", async () => {
  const socket = new FakeSocket();
  const advertisement = "MCPE;Server;754;1.21.80;1;10;id;World;Survival;1;;;";
  let broadcastCalls = 0;
  const promise = discoverLanServers({ timeoutMs: 10, port: 19133, broadcastAddresses: ["1.1.1.1"] }, {
    createSocket: () => socket,
    getBroadcastAddresses: () => {
      broadcastCalls += 1;
      return [];
    },
    getMulticastInterfaces: () => [],
    now: () => 1000,
    createRandomClientGuid,
    createUnconnectedPingPacket,
    parseUnconnectedPongPacket,
    parseAdvertisementString: (message) => parseAdvertisementString(message)
  });
  socket.emitMessage(buildUnconnectedPong(advertisement), { address: "192.168.1.3", port: 19134 });
  const servers = await promise;
  assert.equal(servers.length, 1);
  assert.equal(servers[0]?.port, 19134);
  assert.equal(broadcastCalls, 0);
});

void test("discoverLanServers uses ipv6 port when ipv4 missing", async () => {
  const socket = new FakeSocket();
  const advertisement = "MCPE;Server;754;1.21.80;1;10;id;World;Survival;1;;7551;";
  const promise = discoverLanServers({ timeoutMs: 10 }, {
    createSocket: () => socket,
    getBroadcastAddresses: () => ["255.255.255.255"],
    getMulticastInterfaces: () => [],
    now: () => 1000,
    createRandomClientGuid,
    createUnconnectedPingPacket,
    parseUnconnectedPongPacket,
    parseAdvertisementString: (message) => parseAdvertisementString(message)
  });
  socket.emitMessage(buildUnconnectedPong(advertisement), { address: "192.168.1.4", port: 19132 });
  const servers = await promise;
  assert.equal(servers.length, 1);
  assert.equal(servers[0]?.port, 7551);
});

void test("discoverLanServers accepts raw advertisement string", async () => {
  const socket = new FakeSocket();
  const advertisement = "MCPE;Server;754;1.21.80;1;10;id;World;Survival;1;19132;";
  const promise = discoverLanServers({ timeoutMs: 10 }, {
    createSocket: () => socket,
    getBroadcastAddresses: () => ["255.255.255.255"],
    getMulticastInterfaces: () => [],
    now: () => 1000,
    createRandomClientGuid,
    createUnconnectedPingPacket,
    parseUnconnectedPongPacket,
    parseAdvertisementString: (message) => parseAdvertisementString(message)
  });
  socket.emitMessage(Buffer.from(advertisement, "utf8"), { address: "192.168.1.5", port: 19132 });
  const servers = await promise;
  assert.equal(servers.length, 1);
  assert.equal(servers[0]?.host, "192.168.1.5");
});

void test("discoverLanServers rejects on error", async () => {
  const socket = new FakeSocket();
  const promise = discoverLanServers({ timeoutMs: 10 }, {
    createSocket: () => socket,
    getBroadcastAddresses: () => ["255.255.255.255"],
    getMulticastInterfaces: () => [],
    now: () => 1000,
    createRandomClientGuid,
    createUnconnectedPingPacket,
    parseUnconnectedPongPacket: () => null,
    parseAdvertisementString: () => null
  });
  socket.emitError(new Error("boom"));
  await assert.rejects(() => promise);
});

void test("discoverLanServers ignores invalid pong packets", async () => {
  const socket = new FakeSocket();
  const promise = discoverLanServers({ timeoutMs: 10 }, {
    createSocket: () => socket,
    getBroadcastAddresses: () => ["255.255.255.255"],
    getMulticastInterfaces: () => [],
    now: () => 1000,
    createRandomClientGuid,
    createUnconnectedPingPacket,
    parseUnconnectedPongPacket,
    parseAdvertisementString: (message) => parseAdvertisementString(message)
  });
  socket.emitMessage(Buffer.from([0x00]), { address: "192.168.1.2", port: 19132 });
  const servers = await promise;
  assert.equal(servers.length, 0);
});

void test("discoverLanServers ignores invalid advertisement payloads", async () => {
  const socket = new FakeSocket();
  const invalidAdvertisement = "INVALID;payload";
  const promise = discoverLanServers({ timeoutMs: 10 }, {
    createSocket: () => socket,
    getBroadcastAddresses: () => ["255.255.255.255"],
    getMulticastInterfaces: () => [],
    now: () => 1000,
    createRandomClientGuid,
    createUnconnectedPingPacket,
    parseUnconnectedPongPacket,
    parseAdvertisementString: (message) => parseAdvertisementString(message)
  });
  socket.emitMessage(buildUnconnectedPong(invalidAdvertisement), { address: "192.168.1.2", port: 19132 });
  const servers = await promise;
  assert.equal(servers.length, 0);
});

void test("discoverLanServers joins multicast group when available", async () => {
  const socket = new FakeSocket();
  const promise = discoverLanServers({ timeoutMs: 5, multicastAddresses: [BEDROCK_LAN_MULTICAST_ADDRESS_V4], multicastInterfaces: ["10.0.0.5"] }, {
    createSocket: () => socket,
    getBroadcastAddresses: () => [],
    getMulticastInterfaces: () => [],
    now: () => 1000,
    createRandomClientGuid,
    createUnconnectedPingPacket,
    parseUnconnectedPongPacket,
    parseAdvertisementString: (message) => parseAdvertisementString(message)
  });
  await promise;
  assert.deepEqual(socket.membershipCalls, [
    { address: BEDROCK_LAN_MULTICAST_ADDRESS_V4 },
    { address: BEDROCK_LAN_MULTICAST_ADDRESS_V4, multicastInterface: "10.0.0.5" }
  ]);
});


