import { createCipheriv, createDecipheriv, createHash, createHmac } from "node:crypto";
import { NETHERNET_DISCOVERY_KEY_SEED } from "../constants.js";

const NETHERNET_DISCOVERY_KEY_SEED_BYTES = 8;
const CHECKSUM_LENGTH_BYTES = 32;
const buildKeySeedBuffer = (): Buffer => {
  const buffer = Buffer.alloc(NETHERNET_DISCOVERY_KEY_SEED_BYTES);
  buffer.writeBigUInt64LE(NETHERNET_DISCOVERY_KEY_SEED, 0);
  return buffer;
};

export const NETHERNET_DISCOVERY_KEY: Buffer = Buffer.from(createHash("sha256").update(buildKeySeedBuffer()).digest());

export const computeDiscoveryChecksum = (payload: Buffer): Buffer => Buffer.from(createHmac("sha256", NETHERNET_DISCOVERY_KEY).update(payload).digest());

export const isValidDiscoveryChecksum = (payload: Buffer, checksum: Buffer): boolean => {
  if (checksum.length !== CHECKSUM_LENGTH_BYTES) return false;
  return computeDiscoveryChecksum(payload).equals(checksum);
};

export const encryptDiscoveryPayload = (payload: Buffer): Buffer => {
  const cipher = createCipheriv("aes-256-ecb", NETHERNET_DISCOVERY_KEY, null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(payload), cipher.final()]);
};

export const decryptDiscoveryPayload = (payload: Buffer): Buffer => {
  const decipher = createDecipheriv("aes-256-ecb", NETHERNET_DISCOVERY_KEY, null);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(payload), decipher.final()]);
};
