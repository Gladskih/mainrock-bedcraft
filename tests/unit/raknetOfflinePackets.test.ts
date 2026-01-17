import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RAKNET_LONG_LENGTH_BYTES,
  RAKNET_MAGIC,
  RAKNET_MAGIC_LENGTH_BYTES,
  RAKNET_UNCONNECTED_PONG_ID
} from "../../src/constants.js";
import { createUnconnectedPingPacket, parseUnconnectedPongPacket } from "../../src/bedrock/raknetOfflinePackets.js";

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

void test("parseUnconnectedPongPacket returns server name", () => {
  const serverName = "MCPE;Server;754;1.21.80;1;10;id;World;Survival;1;19132;19133;";
  const parsed = parseUnconnectedPongPacket(buildUnconnectedPong(serverName));
  assert.ok(parsed);
  assert.equal(parsed.serverName, serverName);
});

void test("parseUnconnectedPongPacket rejects wrong header", () => {
  const buffer = buildUnconnectedPong("MCPE;Server;754;1.21.80;1;10;id;World;Survival;1;19132;");
  buffer.writeUInt8(0x00, 0);
  assert.equal(parseUnconnectedPongPacket(buffer), null);
});

void test("parseUnconnectedPongPacket rejects wrong magic", () => {
  const buffer = buildUnconnectedPong("MCPE;Server;754;1.21.80;1;10;id;World;Survival;1;19132;");
  buffer.writeUInt8(0xff, 1 + RAKNET_LONG_LENGTH_BYTES + RAKNET_LONG_LENGTH_BYTES);
  assert.equal(parseUnconnectedPongPacket(buffer), null);
});

void test("parseUnconnectedPongPacket rejects short buffer", () => {
  const buffer = buildUnconnectedPong("MCPE;Server;754;1.21.80;1;10;id;World;Survival;1;19132;");
  assert.equal(parseUnconnectedPongPacket(buffer.subarray(0, 5)), null);
});

void test("parseUnconnectedPongPacket rejects truncated string payload", () => {
  const buffer = buildUnconnectedPong("MCPE;Server;754;1.21.80;1;10;id;World;Survival;1;19132;");
  const lengthOffset = 1 + RAKNET_LONG_LENGTH_BYTES + RAKNET_LONG_LENGTH_BYTES + RAKNET_MAGIC_LENGTH_BYTES;
  buffer.writeUInt16BE(999, lengthOffset);
  assert.equal(parseUnconnectedPongPacket(buffer), null);
});

void test("createUnconnectedPingPacket sets header byte", () => {
  const packet = createUnconnectedPingPacket(1n, 2n);
  assert.equal(packet.readUInt8(0), 0x01);
});
