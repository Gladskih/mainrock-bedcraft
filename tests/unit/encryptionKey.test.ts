import assert from "node:assert/strict";
import { test } from "node:test";
import type { EncryptionKeyStorage } from "../../src/authentication/encryptionKeyStorage.js";
import { loadEncryptionKey } from "../../src/authentication/encryptionKey.js";

void test("loadEncryptionKey uses environment key", () => {
  let readCalled = false;
  let writeCalled = false;
  const storage: EncryptionKeyStorage = {
    source: "file",
    readKey: () => {
      readCalled = true;
      return null;
    },
    writeKey: () => {
      writeCalled = true;
    }
  };
  const result = loadEncryptionKey("unused", "passphrase", storage);
  assert.equal(result.source, "environment");
  assert.equal(result.key.length, 32);
  assert.equal(readCalled, false);
  assert.equal(writeCalled, false);
});

void test("loadEncryptionKey persists generated key", () => {
  let storedKey: Buffer | null = null;
  const storage: EncryptionKeyStorage = {
    source: "file",
    readKey: () => storedKey,
    writeKey: (_keyFilePath, key) => {
      storedKey = Buffer.from(key);
    }
  };
  const first = loadEncryptionKey("unused", undefined, storage);
  assert.equal(first.source, "generated");
  assert.equal(storedKey !== null, true);
  const second = loadEncryptionKey("unused", undefined, storage);
  assert.equal(second.source, "file");
  assert.equal(second.key.length, 32);
});

void test("loadEncryptionKey returns windows storage source", () => {
  const storage: EncryptionKeyStorage = {
    source: "windows-dpapi",
    readKey: () => Buffer.from("fixed-key"),
    writeKey: () => undefined
  };
  const result = loadEncryptionKey("unused", undefined, storage);
  assert.equal(result.source, "windows-dpapi");
  assert.equal(result.key.length, 32);
});

void test("loadEncryptionKey generates new key when storage read fails", () => {
  let writeCalled = false;
  const storage: EncryptionKeyStorage = {
    source: "windows-dpapi",
    readKey: () => {
      throw new Error("corrupt key blob");
    },
    writeKey: () => {
      writeCalled = true;
    }
  };
  const result = loadEncryptionKey("unused", undefined, storage);
  assert.equal(result.source, "generated");
  assert.equal(result.key.length, 32);
  assert.equal(writeCalled, true);
});
