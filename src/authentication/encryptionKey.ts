import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { AES_GCM_KEY_LENGTH_BYTES } from "../constants.js";
import { normalizeEncryptionKey } from "./encryptedCache.js";

export type EncryptionKeyResult = {
  key: Buffer;
  source: "environment" | "file" | "generated";
};

const ensureDirectory = (path: string): void => {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
};

export const loadEncryptionKey = (keyFilePath: string, environmentKey: string | undefined): EncryptionKeyResult => {
  if (environmentKey && environmentKey.trim()) return { key: normalizeEncryptionKey(Buffer.from(environmentKey.trim(), "utf8")), source: "environment" };
  if (existsSync(keyFilePath)) return { key: normalizeEncryptionKey(readFileSync(keyFilePath)), source: "file" };
  ensureDirectory(dirname(keyFilePath));
  const generated = randomBytes(AES_GCM_KEY_LENGTH_BYTES);
  writeFileSync(keyFilePath, generated, { mode: 0o600 });
  return { key: normalizeEncryptionKey(generated), source: "generated" };
};
