import { DEFAULT_NETHERNET_PORT } from "../constants.js";
import { computeDiscoveryChecksum, decryptDiscoveryPayload, encryptDiscoveryPayload, isValidDiscoveryChecksum } from "./discoveryCrypto.js";

const DISCOVERY_PACKET_TYPE = {
  request: 0,
  response: 1,
  message: 2
} as const;

const CHECKSUM_LENGTH_BYTES = 32;
const LENGTH_PREFIX_BYTES = 2;
const PACKET_ID_BYTES = 2;
const SENDER_ID_BYTES = 8;
const PADDING_BYTES = 8;
const DISCOVERY_HEADER_BYTES = PACKET_ID_BYTES + SENDER_ID_BYTES + PADDING_BYTES;
const MIN_DISCOVERY_PAYLOAD_BYTES = LENGTH_PREFIX_BYTES + DISCOVERY_HEADER_BYTES;
const RESPONSE_HEX_LENGTH_BYTES = 4;
const MESSAGE_RECIPIENT_ID_BYTES = 8;
const MESSAGE_LENGTH_BYTES = 4;
const PACKET_LENGTH_MAX_BYTES = 5;

export type NethernetServerData = {
  nethernetVersion: number;
  serverName: string;
  levelName: string;
  gameType: number;
  playersOnline: number;
  playersMax: number;
  editorWorld: boolean;
  transportLayer: number | null;
};

export type DiscoveryRequestPacket = { id: "request" };
export type DiscoveryResponsePacket = { id: "response"; serverData: NethernetServerData };
export type DiscoveryMessagePacket = { id: "message"; recipientId: bigint; message: string };

export type DiscoveryPacket = DiscoveryRequestPacket | DiscoveryResponsePacket | DiscoveryMessagePacket;

export type DecodedDiscoveryPacket = {
  senderId: bigint;
  packet: DiscoveryPacket;
};

const readVaruint32 = (buffer: Buffer, offset: number): { value: number; size: number } | null => {
  let value = 0;
  for (let index = 0; index < PACKET_LENGTH_MAX_BYTES; index += 1) {
    if (offset + index >= buffer.length) return null;
    const byte = buffer.readUInt8(offset + index);
    value |= (byte & 0x7f) << (7 * index);
    if ((byte & 0x80) === 0) return { value, size: index + 1 };
  }
  return null;
};

const writeVaruint32 = (value: number): Buffer => {
  const bytes: number[] = [];
  let remaining = value >>> 0;
  while (remaining >= 0x80) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  bytes.push(remaining);
  return Buffer.from(bytes);
};

const encodeServerData = (serverData: NethernetServerData): Buffer => {
  if (serverData.transportLayer === null) throw new Error("Cannot encode ServerData without transportLayer");
  const serverNameBytes = Buffer.from(serverData.serverName, "utf8");
  const levelNameBytes = Buffer.from(serverData.levelName, "utf8");
  const serverNameLength = writeVaruint32(serverNameBytes.length);
  const levelNameLength = writeVaruint32(levelNameBytes.length);
  const fixedBytes = Buffer.alloc(1 + 4 + 4 + 4 + 1 + 4);
  fixedBytes.writeUInt8(serverData.nethernetVersion, 0);
  fixedBytes.writeInt32LE(serverData.gameType, 1);
  fixedBytes.writeInt32LE(serverData.playersOnline, 1 + 4);
  fixedBytes.writeInt32LE(serverData.playersMax, 1 + 4 + 4);
  fixedBytes.writeUInt8(serverData.editorWorld ? 1 : 0, 1 + 4 + 4 + 4);
  fixedBytes.writeInt32LE(serverData.transportLayer, 1 + 4 + 4 + 4 + 1);
  return Buffer.concat([
    fixedBytes.subarray(0, 1),
    serverNameLength,
    serverNameBytes,
    levelNameLength,
    levelNameBytes,
    fixedBytes.subarray(1)
  ]);
};

const decodeServerData = (buffer: Buffer): NethernetServerData | null => {
  if (buffer.length < 1) return null;
  let offset = 0;
  const nethernetVersion = buffer.readUInt8(offset);
  offset += 1;
  const serverNameLength = readVaruint32(buffer, offset);
  if (!serverNameLength) return null;
  offset += serverNameLength.size;
  if (buffer.length < offset + serverNameLength.value) return null;
  const serverName = buffer.subarray(offset, offset + serverNameLength.value).toString("utf8");
  offset += serverNameLength.value;
  const levelNameLength = readVaruint32(buffer, offset);
  if (!levelNameLength) return null;
  offset += levelNameLength.size;
  if (buffer.length < offset + levelNameLength.value) return null;
  const levelName = buffer.subarray(offset, offset + levelNameLength.value).toString("utf8");
  offset += levelNameLength.value;
  const remainingBytes = buffer.length - offset;
  if (remainingBytes >= 4 + 4 + 4 + 1 + 4) {
    const gameType = buffer.readInt32LE(offset);
    offset += 4;
    const playersOnline = buffer.readInt32LE(offset);
    offset += 4;
    const playersMax = buffer.readInt32LE(offset);
    offset += 4;
    const editorWorld = buffer.readUInt8(offset) !== 0;
    offset += 1;
    const transportLayer = buffer.readInt32LE(offset);
    return {
      nethernetVersion,
      serverName,
      levelName,
      gameType,
      playersOnline,
      playersMax,
      editorWorld,
      transportLayer
    };
  }
  if (nethernetVersion >= 4 && remainingBytes >= 1 + 4 + 4 + 1) {
    return {
      nethernetVersion,
      serverName,
      levelName,
      gameType: buffer.readUInt8(offset),
      playersOnline: buffer.readInt32LE(offset + 1),
      playersMax: buffer.readInt32LE(offset + 1 + 4),
      editorWorld: buffer.readUInt8(offset + 1 + 4 + 4) !== 0,
      transportLayer: null
    };
  }
  return null;
};

const encodeRequestPacket = (): Buffer => Buffer.alloc(0);

const decodeRequestPacket = (_payload: Buffer): DiscoveryRequestPacket => ({ id: "request" });

const encodeResponsePacket = (serverData: NethernetServerData): Buffer => {
  const hexPayload = encodeServerData(serverData).toString("hex");
  const hexBytes = Buffer.from(hexPayload, "utf8");
  const buffer = Buffer.alloc(RESPONSE_HEX_LENGTH_BYTES + hexBytes.length);
  buffer.writeUInt32LE(hexBytes.length, 0);
  hexBytes.copy(buffer, RESPONSE_HEX_LENGTH_BYTES);
  return buffer;
};

const decodeResponsePacket = (payload: Buffer): DiscoveryResponsePacket | null => {
  if (payload.length < RESPONSE_HEX_LENGTH_BYTES) return null;
  const length = payload.readUInt32LE(0);
  if (payload.length < RESPONSE_HEX_LENGTH_BYTES + length) return null;
  const hexPayload = payload.subarray(RESPONSE_HEX_LENGTH_BYTES, RESPONSE_HEX_LENGTH_BYTES + length).toString("utf8");
  const decoded = Buffer.from(hexPayload, "hex");
  const serverData = decodeServerData(decoded);
  if (!serverData) return null;
  return { id: "response", serverData };
};

const encodeMessagePacket = (recipientId: bigint, message: string): Buffer => {
  const messageBytes = Buffer.from(message, "utf8");
  const buffer = Buffer.alloc(MESSAGE_RECIPIENT_ID_BYTES + MESSAGE_LENGTH_BYTES + messageBytes.length);
  buffer.writeBigUInt64LE(recipientId, 0);
  buffer.writeUInt32LE(messageBytes.length, MESSAGE_RECIPIENT_ID_BYTES);
  messageBytes.copy(buffer, MESSAGE_RECIPIENT_ID_BYTES + MESSAGE_LENGTH_BYTES);
  return buffer;
};

const decodeMessagePacket = (payload: Buffer): DiscoveryMessagePacket | null => {
  if (payload.length < MESSAGE_RECIPIENT_ID_BYTES + MESSAGE_LENGTH_BYTES) return null;
  const recipientId = payload.readBigUInt64LE(0);
  const length = payload.readUInt32LE(MESSAGE_RECIPIENT_ID_BYTES);
  if (payload.length < MESSAGE_RECIPIENT_ID_BYTES + MESSAGE_LENGTH_BYTES + length) return null;
  const message = payload
    .subarray(
      MESSAGE_RECIPIENT_ID_BYTES + MESSAGE_LENGTH_BYTES,
      MESSAGE_RECIPIENT_ID_BYTES + MESSAGE_LENGTH_BYTES + length
    )
    .toString("utf8");
  return { id: "message", recipientId, message };
};

const encodePacketPayload = (senderId: bigint, packet: DiscoveryPacket): Buffer => {
  const packetType = DISCOVERY_PACKET_TYPE[packet.id];
  let packetData: Buffer = Buffer.alloc(0);
  if (packet.id === "request") packetData = encodeRequestPacket();
  if (packet.id === "response") packetData = encodeResponsePacket(packet.serverData);
  if (packet.id === "message") packetData = encodeMessagePacket(packet.recipientId, packet.message);
  const payloadLength = LENGTH_PREFIX_BYTES + DISCOVERY_HEADER_BYTES + packetData.length;
  const payload = Buffer.alloc(payloadLength);
  payload.writeUInt16LE(payloadLength, 0);
  payload.writeUInt16LE(packetType, LENGTH_PREFIX_BYTES);
  payload.writeBigUInt64LE(senderId, LENGTH_PREFIX_BYTES + PACKET_ID_BYTES);
  packetData.copy(payload, LENGTH_PREFIX_BYTES + DISCOVERY_HEADER_BYTES);
  return payload;
};

export const encodeDiscoveryPacket = (senderId: bigint, packet: DiscoveryPacket): Buffer => {
  const payload = encodePacketPayload(senderId, packet);
  const encrypted = encryptDiscoveryPayload(payload);
  const checksum = computeDiscoveryChecksum(payload);
  return Buffer.concat([checksum, encrypted]);
};

export const decodeDiscoveryPacket = (data: Buffer): DecodedDiscoveryPacket | null => {
  if (data.length < CHECKSUM_LENGTH_BYTES + 16) return null;
  const checksum = data.subarray(0, CHECKSUM_LENGTH_BYTES);
  const encryptedPayload = data.subarray(CHECKSUM_LENGTH_BYTES);
  let payload: Buffer;
  try {
    payload = decryptDiscoveryPayload(encryptedPayload);
  } catch {
    return null;
  }
  if (!isValidDiscoveryChecksum(payload, checksum)) return null;
  if (payload.length < MIN_DISCOVERY_PAYLOAD_BYTES) return null;
  const packetLength = payload.readUInt16LE(0);
  if (packetLength < MIN_DISCOVERY_PAYLOAD_BYTES) return null;
  if (packetLength > payload.length) return null;
  if (packetLength !== payload.length) return null;
  const packetId = payload.readUInt16LE(LENGTH_PREFIX_BYTES);
  const senderId = payload.readBigUInt64LE(LENGTH_PREFIX_BYTES + PACKET_ID_BYTES);
  const packetPayload = payload.subarray(MIN_DISCOVERY_PAYLOAD_BYTES, packetLength);
  if (packetId === DISCOVERY_PACKET_TYPE.request) return { senderId, packet: decodeRequestPacket(packetPayload) };
  if (packetId === DISCOVERY_PACKET_TYPE.response) {
    const packet = decodeResponsePacket(packetPayload);
    if (!packet) return null;
    return { senderId, packet };
  }
  if (packetId === DISCOVERY_PACKET_TYPE.message) {
    const packet = decodeMessagePacket(packetPayload);
    if (!packet) return null;
    return { senderId, packet };
  }
  return null;
};

export const toDefaultNethernetEndpoint = (host: string): { host: string; port: number } => ({
  host,
  port: DEFAULT_NETHERNET_PORT
});
