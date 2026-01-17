import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Cache, CacheFactory } from "prismarine-auth";
import {
  AES_GCM_IV_LENGTH_BYTES,
  AES_GCM_KEY_LENGTH_BYTES,
  AES_GCM_TAG_LENGTH_BYTES,
  CACHE_FILE_SUFFIX,
  CACHE_HASH_ALGORITHM
} from "../constants.js";

const ensureDirectory = (path: string): void => {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
};

const coerceCacheRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return {};
};

const hashIdentifier = (identifier: string): string => createHash(CACHE_HASH_ALGORITHM)
  .update(identifier)
  .digest("hex");

const createCacheFilePath = (directory: string, username: string, cacheName: string): string => join(
  directory,
  `${hashIdentifier(username)}_${cacheName}${CACHE_FILE_SUFFIX}`
);

const encryptCache = (payload: Record<string, unknown>, key: Buffer): Buffer => {
  const iv = randomBytes(AES_GCM_IV_LENGTH_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
    cipher.final()
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
};

const decryptCache = (payload: Buffer, key: Buffer): Record<string, unknown> => {
  if (payload.length < AES_GCM_IV_LENGTH_BYTES + AES_GCM_TAG_LENGTH_BYTES) return {};
  const iv = payload.subarray(0, AES_GCM_IV_LENGTH_BYTES);
  const tagStart = AES_GCM_IV_LENGTH_BYTES;
  const tagEnd = AES_GCM_IV_LENGTH_BYTES + AES_GCM_TAG_LENGTH_BYTES;
  const encrypted = payload.subarray(tagEnd);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(payload.subarray(tagStart, tagEnd));
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  return coerceCacheRecord(JSON.parse(decrypted));
};

export class EncryptedFileCache implements Cache {
  private cache: Record<string, unknown> | null = null;
  constructor(private readonly cachePath: string, private readonly key: Buffer) {}
  async reset(): Promise<void> {
    this.cache = null;
    rmSync(this.cachePath, { force: true });
  }
  async getCached(): Promise<Record<string, unknown>> {
    if (this.cache) return this.cache;
    if (!existsSync(this.cachePath)) {
      this.cache = {};
      return this.cache;
    }
    try {
      this.cache = decryptCache(readFileSync(this.cachePath), this.key);
      return this.cache;
    } catch {
      this.cache = {};
      return this.cache;
    }
  }
  async setCached(value: unknown): Promise<void> {
    this.cache = coerceCacheRecord(value);
    ensureDirectory(dirname(this.cachePath));
    writeFileSync(this.cachePath, encryptCache(this.cache, this.key));
  }
  async setCachedPartial(value: unknown): Promise<void> {
    const current = await this.getCached();
    await this.setCached({ ...current, ...coerceCacheRecord(value) });
  }
}

export const normalizeEncryptionKey = (key: Buffer): Buffer => {
  if (key.length === AES_GCM_KEY_LENGTH_BYTES) return key;
  return createHash(CACHE_HASH_ALGORITHM).update(key).digest();
};

export const createEncryptedCacheFactory = (directory: string, key: Buffer): CacheFactory => {
  return ({ cacheName, username }) => {
    ensureDirectory(directory);
    return new EncryptedFileCache(
      createCacheFilePath(directory, username, cacheName),
      normalizeEncryptionKey(key)
    );
  };
};
