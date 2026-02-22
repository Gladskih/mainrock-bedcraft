import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_NETHERNET_PORT } from "../../src/constants.js";
import { decodeDiscoveryPacket, encodeDiscoveryPacket, toDefaultNethernetEndpoint, type NethernetServerData } from "../../src/nethernet/discoveryPackets.js";
import { computeDiscoveryChecksum, decryptDiscoveryPayload, encryptDiscoveryPayload } from "../../src/nethernet/discoveryCrypto.js";

const CHECKSUM_LENGTH_BYTES = 32;
const LENGTH_PREFIX_BYTES = 2;
const PACKET_ID_BYTES = 2;
const SENDER_ID_BYTES = 8;
const PADDING_BYTES = 8;
const RESPONSE_PACKET_ID = 1;
const RESPONSE_HEX_LENGTH_BYTES = 4;

const encodeVaruint32 = (value: number): Buffer => {
  const bytes: number[] = [];
  let remaining = value >>> 0;
  while (remaining >= 0x80) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  bytes.push(remaining);
  return Buffer.from(bytes);
};

const encodeMinecraftLanServerData = (serverData: Omit<NethernetServerData, "transportLayer">): Buffer => {
  const serverNameBytes = Buffer.from(serverData.serverName, "utf8");
  const levelNameBytes = Buffer.from(serverData.levelName, "utf8");
  const gameData = Buffer.alloc(1 + 4 + 4 + 1);
  gameData.writeUInt8(serverData.gameType, 0);
  gameData.writeInt32LE(serverData.playersOnline, 1);
  gameData.writeInt32LE(serverData.playersMax, 5);
  gameData.writeUInt8(serverData.editorWorld ? 1 : 0, 9);
  return Buffer.concat([
    Buffer.from([serverData.nethernetVersion]),
    encodeVaruint32(serverNameBytes.length),
    serverNameBytes,
    encodeVaruint32(levelNameBytes.length),
    levelNameBytes,
    gameData
  ]);
};

const encodeMinecraftLanResponsePacket = (senderId: bigint, serverData: Omit<NethernetServerData, "transportLayer">): Buffer => {
  const serverDataHex = Buffer.from(encodeMinecraftLanServerData(serverData).toString("hex"), "utf8");
  const responsePayload = Buffer.alloc(RESPONSE_HEX_LENGTH_BYTES + serverDataHex.length);
  responsePayload.writeUInt32LE(serverDataHex.length, 0);
  serverDataHex.copy(responsePayload, RESPONSE_HEX_LENGTH_BYTES);
  const payloadLength = LENGTH_PREFIX_BYTES + PACKET_ID_BYTES + SENDER_ID_BYTES + PADDING_BYTES + responsePayload.length;
  const payload = Buffer.alloc(payloadLength);
  payload.writeUInt16LE(payloadLength, 0);
  payload.writeUInt16LE(RESPONSE_PACKET_ID, LENGTH_PREFIX_BYTES);
  payload.writeBigUInt64LE(senderId, LENGTH_PREFIX_BYTES + PACKET_ID_BYTES);
  responsePayload.copy(payload, LENGTH_PREFIX_BYTES + PACKET_ID_BYTES + SENDER_ID_BYTES + PADDING_BYTES);
  return encodeWithCrypto(payload);
};

const encodeWithCrypto = (payload: Buffer): Buffer => {
  const encrypted = encryptDiscoveryPayload(payload);
  return Buffer.concat([computeDiscoveryChecksum(payload), encrypted]);
};

const transformDiscoveryPayload = (encoded: Buffer, transform: (payload: Buffer) => void): Buffer => {
  const encrypted = encoded.subarray(CHECKSUM_LENGTH_BYTES);
  const payload = decryptDiscoveryPayload(encrypted);
  transform(payload);
  return encodeWithCrypto(payload);
};

void test("encodeDiscoveryPacket and decodeDiscoveryPacket round trip request", () => {
  const senderId = 1n;
  const encoded = encodeDiscoveryPacket(senderId, { id: "request" });
  const decoded = decodeDiscoveryPacket(encoded);
  assert.deepEqual(decoded, { senderId, packet: { id: "request" } });
});

void test("encodeDiscoveryPacket and decodeDiscoveryPacket round trip message", () => {
  const senderId = 2n;
  const packet = { id: "message" as const, recipientId: 3n, message: "CONNECTREQUEST 10 SDP" };
  const encoded = encodeDiscoveryPacket(senderId, packet);
  const decoded = decodeDiscoveryPacket(encoded);
  assert.deepEqual(decoded, { senderId, packet });
});

void test("encodeDiscoveryPacket and decodeDiscoveryPacket round trip response", () => {
  const senderId = 4n;
  const serverData: NethernetServerData = {
    nethernetVersion: 2,
    serverName: "Test Server",
    levelName: "World",
    gameType: 0,
    playersOnline: 1,
    playersMax: 10,
    editorWorld: false,
    transportLayer: 2
  };
  const encoded = encodeDiscoveryPacket(senderId, { id: "response", serverData });
  const decoded = decodeDiscoveryPacket(encoded);
  assert.deepEqual(decoded, { senderId, packet: { id: "response", serverData } });
});

void test("decodeDiscoveryPacket returns null on checksum mismatch", () => {
  const senderId = 5n;
  const encoded = encodeDiscoveryPacket(senderId, { id: "request" });
  const tampered = Buffer.from(encoded);
  tampered[tampered.length - 1] = tampered[tampered.length - 1] === 0 ? 1 : 0;
  assert.equal(decodeDiscoveryPacket(tampered), null);
});

void test("decodeDiscoveryPacket returns null on decrypt error", () => {
  assert.equal(decodeDiscoveryPacket(Buffer.concat([Buffer.alloc(CHECKSUM_LENGTH_BYTES), Buffer.alloc(17)])), null);
});

void test("decodeDiscoveryPacket returns null on too-short payload", () => {
  assert.equal(decodeDiscoveryPacket(encodeWithCrypto(Buffer.alloc(1))), null);
});

void test("decodeDiscoveryPacket returns null on invalid length prefix", () => {
  const senderId = 6n;
  const encoded = encodeDiscoveryPacket(senderId, { id: "request" });
  const mutated = transformDiscoveryPayload(encoded, (payload) => {
    payload.writeUInt16LE(payload.readUInt16LE(0) + 1, 0);
  });
  assert.equal(decodeDiscoveryPacket(mutated), null);
});

void test("decodeDiscoveryPacket returns null on unknown packet type", () => {
  const senderId = 7n;
  const encoded = encodeDiscoveryPacket(senderId, { id: "request" });
  const mutated = transformDiscoveryPayload(encoded, (payload) => payload.writeUInt16LE(999, 2));
  assert.equal(decodeDiscoveryPacket(mutated), null);
});

void test("decodeDiscoveryPacket returns null on invalid response payload", () => {
  const senderId = 8n;
  const serverData: NethernetServerData = {
    nethernetVersion: 2,
    serverName: "Test Server",
    levelName: "World",
    gameType: 0,
    playersOnline: 1,
    playersMax: 10,
    editorWorld: false,
    transportLayer: 2
  };
  const encoded = encodeDiscoveryPacket(senderId, { id: "response", serverData });
  const mutated = transformDiscoveryPayload(encoded, (payload) => payload.writeUInt32LE(999999, 20));
  assert.equal(decodeDiscoveryPacket(mutated), null);
});

void test("encodeDiscoveryPacket supports multi-byte varuint lengths", () => {
  const senderId = 9n;
  const serverData: NethernetServerData = {
    nethernetVersion: 2,
    serverName: "s".repeat(200),
    levelName: "w".repeat(200),
    gameType: 0,
    playersOnline: 1,
    playersMax: 10,
    editorWorld: false,
    transportLayer: 2
  };
  const encoded = encodeDiscoveryPacket(senderId, { id: "response", serverData });
  const decoded = decodeDiscoveryPacket(encoded);
  assert.deepEqual(decoded, { senderId, packet: { id: "response", serverData } });
});

void test("decodeDiscoveryPacket decodes Minecraft LAN response packet", () => {
  const encoded = encodeMinecraftLanResponsePacket(11n, {
    nethernetVersion: 4,
    serverName: "targetplayer",
    levelName: "Coast",
    gameType: 0,
    playersOnline: 1,
    playersMax: 8,
    editorWorld: false
  });
  const decoded = decodeDiscoveryPacket(encoded);
  assert.ok(decoded);
  assert.equal(decoded.senderId, 11n);
  assert.equal(decoded.packet.id, "response");
  assert.equal(decoded.packet.serverData.nethernetVersion, 4);
  assert.equal(decoded.packet.serverData.serverName, "targetplayer");
  assert.equal(decoded.packet.serverData.levelName, "Coast");
  assert.equal(decoded.packet.serverData.gameType, 0);
  assert.equal(decoded.packet.serverData.playersOnline, 1);
  assert.equal(decoded.packet.serverData.playersMax, 8);
  assert.equal(decoded.packet.serverData.editorWorld, false);
  assert.equal(decoded.packet.serverData.transportLayer, null);
});

void test("encodeDiscoveryPacket rejects ServerData without transportLayer", () => {
  assert.throws(() => encodeDiscoveryPacket(10n, {
    id: "response",
    serverData: {
      nethernetVersion: 4,
      serverName: "Server",
      levelName: "World",
      gameType: 0,
      playersOnline: 1,
      playersMax: 8,
      editorWorld: false,
      transportLayer: null
    }
  }));
});

void test("toDefaultNethernetEndpoint returns UDP 7551 endpoint", () => {
  assert.deepEqual(toDefaultNethernetEndpoint("192.168.0.10"), { host: "192.168.0.10", port: DEFAULT_NETHERNET_PORT });
});
