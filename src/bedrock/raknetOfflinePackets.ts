import { randomBytes } from "node:crypto";
import {
  RAKNET_LONG_LENGTH_BYTES,
  RAKNET_MAGIC,
  RAKNET_MAGIC_LENGTH_BYTES,
  RAKNET_UNCONNECTED_PING_ID,
  RAKNET_UNCONNECTED_PONG_ID
} from "../constants.js";

export type UnconnectedPong = {
  serverName: string;
};

const PONG_STRING_LENGTH_BYTES = 2; // RakNet offline string length prefix size.
const MIN_PONG_LENGTH_BYTES = 1
  + RAKNET_LONG_LENGTH_BYTES
  + RAKNET_LONG_LENGTH_BYTES
  + RAKNET_MAGIC_LENGTH_BYTES
  + PONG_STRING_LENGTH_BYTES; // Minimum unconnected pong size.

export const createRandomClientGuid = (): bigint => randomBytes(RAKNET_LONG_LENGTH_BYTES).readBigUInt64BE();

export const createUnconnectedPingPacket = (timestamp: bigint, clientGuid: bigint): Buffer => {
  const buffer = Buffer.alloc(1 + RAKNET_LONG_LENGTH_BYTES + RAKNET_MAGIC_LENGTH_BYTES + RAKNET_LONG_LENGTH_BYTES);
  buffer.writeUInt8(RAKNET_UNCONNECTED_PING_ID, 0);
  buffer.writeBigUInt64BE(timestamp, 1);
  RAKNET_MAGIC.copy(buffer, 1 + RAKNET_LONG_LENGTH_BYTES);
  buffer.writeBigUInt64BE(clientGuid, 1 + RAKNET_LONG_LENGTH_BYTES + RAKNET_MAGIC_LENGTH_BYTES);
  return buffer;
};

export const parseUnconnectedPongPacket = (message: Buffer): UnconnectedPong | null => {
  if (message.length < MIN_PONG_LENGTH_BYTES) return null;
  if (message.readUInt8(0) !== RAKNET_UNCONNECTED_PONG_ID) return null;
  const magicOffset = 1 + RAKNET_LONG_LENGTH_BYTES + RAKNET_LONG_LENGTH_BYTES;
  if (!message.subarray(magicOffset, magicOffset + RAKNET_MAGIC_LENGTH_BYTES).equals(RAKNET_MAGIC)) return null;
  const stringLengthOffset = magicOffset + RAKNET_MAGIC_LENGTH_BYTES;
  const stringLength = message.readUInt16BE(stringLengthOffset);
  const stringStart = stringLengthOffset + PONG_STRING_LENGTH_BYTES;
  if (message.length < stringStart + stringLength) return null;
  return { serverName: message.subarray(stringStart, stringStart + stringLength).toString("utf8") };
};
