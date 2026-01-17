import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_NETHERNET_PORT } from "../../src/constants.js";
import { decodeDiscoveryPacket, encodeDiscoveryPacket, toDefaultNethernetEndpoint, type NethernetServerData } from "../../src/nethernet/discoveryPackets.js";
import { computeDiscoveryChecksum, decryptDiscoveryPayload, encryptDiscoveryPayload } from "../../src/nethernet/discoveryCrypto.js";

const CHECKSUM_LENGTH_BYTES = 32;

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
  const encoded = Buffer.from(
    "746522a2e8a2147562be4c730796c5acccce13ba61e8442340833b5a905f969538ecd77474970394b3830d4cbfbef009a1d0731415512b489ce0662fd2c83ba74e930803171a1d571bb300bf2a3109be6bf570f1754efc39ed128f0ca098cff3357f7462d44e06def7acb5e492e7c6bec48cf2c055bf6b49b80c2470088d784e",
    "hex"
  );
  const decoded = decodeDiscoveryPacket(encoded);
  assert.ok(decoded);
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
