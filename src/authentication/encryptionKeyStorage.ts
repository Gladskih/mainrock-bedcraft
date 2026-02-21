import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createWindowsDpapiCodec, type WindowsDpapiCodec } from "./windowsDpapiCodec.js";

export type EncryptionKeyStorageSource = "windows-dpapi" | "file";

export type EncryptionKeyStorage = {
  source: EncryptionKeyStorageSource;
  readKey: (keyFilePath: string) => Buffer | null;
  writeKey: (keyFilePath: string, key: Buffer) => void;
};

export type CreateEncryptionKeyStorageDependencies = {
  platform?: typeof process.platform;
  createWindowsDpapiCodec?: () => WindowsDpapiCodec;
};

const ensureDirectory = (path: string): void => {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
};

const createFileEncryptionKeyStorage = (): EncryptionKeyStorage => ({
  source: "file",
  readKey: (keyFilePath) => existsSync(keyFilePath) ? readFileSync(keyFilePath) : null,
  writeKey: (keyFilePath, key) => {
    ensureDirectory(dirname(keyFilePath));
    writeFileSync(keyFilePath, key, { mode: 0o600 });
  }
});

const createWindowsDpapiEncryptionKeyStorage = (codec: WindowsDpapiCodec): EncryptionKeyStorage => {
  const writeProtectedKey = (keyFilePath: string, key: Buffer): void => {
    ensureDirectory(dirname(keyFilePath));
    writeFileSync(keyFilePath, codec.protectData(key).toString("base64"), { mode: 0o600, encoding: "utf8" });
  };
  return {
    source: "windows-dpapi",
    readKey: (keyFilePath) => {
      if (!existsSync(keyFilePath)) return null;
      const protectedPayload = readFileSync(keyFilePath, "utf8");
      if (!protectedPayload) throw new Error("invalid protected payload");
      if (/\s/u.test(protectedPayload)) throw new Error("invalid protected payload");
      return codec.unprotectData(Buffer.from(protectedPayload, "base64"));
    },
    writeKey: writeProtectedKey
  };
};

export const createDefaultEncryptionKeyStorage = (
  dependencies: CreateEncryptionKeyStorageDependencies = {}
): EncryptionKeyStorage => {
  const platform = dependencies.platform ?? process.platform;
  if (platform === "win32") return createWindowsDpapiEncryptionKeyStorage((dependencies.createWindowsDpapiCodec ?? createWindowsDpapiCodec)());
  return createFileEncryptionKeyStorage();
};
