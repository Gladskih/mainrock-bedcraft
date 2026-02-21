import { randomBytes } from "node:crypto";
import { AES_GCM_KEY_LENGTH_BYTES } from "../constants.js";
import { createDefaultEncryptionKeyStorage, type EncryptionKeyStorage, type EncryptionKeyStorageSource } from "./encryptionKeyStorage.js";
import { normalizeEncryptionKey } from "./encryptedCache.js";

export type EncryptionKeySource = "environment" | EncryptionKeyStorageSource | "generated";

export type EncryptionKeyResult = {
  key: Buffer;
  source: EncryptionKeySource;
};

export const loadEncryptionKey = (
  keyFilePath: string,
  environmentKey: string | undefined,
  keyStorage: EncryptionKeyStorage = createDefaultEncryptionKeyStorage()
): EncryptionKeyResult => {
  if (environmentKey && environmentKey.trim()) return { key: normalizeEncryptionKey(Buffer.from(environmentKey.trim(), "utf8")), source: "environment" };
  try {
    const existingKey = keyStorage.readKey(keyFilePath);
    if (existingKey) return { key: normalizeEncryptionKey(existingKey), source: keyStorage.source };
  } catch {
    // Corrupted or incompatible key blobs are rotated to keep startup non-interactive.
  }
  const generated = randomBytes(AES_GCM_KEY_LENGTH_BYTES);
  keyStorage.writeKey(keyFilePath, generated);
  return { key: normalizeEncryptionKey(generated), source: "generated" };
};
