import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createDefaultEncryptionKeyStorage } from "../../src/authentication/encryptionKeyStorage.js";

void test("createDefaultEncryptionKeyStorage uses windows dpapi on win32", () => {
  const storage = createDefaultEncryptionKeyStorage({ platform: "win32" });
  assert.equal(storage.source, "windows-dpapi");
});

void test("createDefaultEncryptionKeyStorage uses file storage on non-windows", () => {
  const storage = createDefaultEncryptionKeyStorage({ platform: "linux" });
  assert.equal(storage.source, "file");
});

void test("file encryption key storage reads and writes raw keys", () => {
  const storage = createDefaultEncryptionKeyStorage({ platform: "linux" });
  const keyPath = join(mkdtempSync(join(tmpdir(), "bedcraft-file-key-")), "nested", "key.bin");
  const key = Buffer.from("raw-key-data");
  storage.writeKey(keyPath, key);
  const loaded = storage.readKey(keyPath);
  assert.deepEqual(loaded, key);
  assert.equal(readFileSync(keyPath).toString("utf8"), "raw-key-data");
});

void test("windows dpapi key storage stores protected payload", () => {
  const storage = createDefaultEncryptionKeyStorage({
    platform: "win32",
    createWindowsDpapiCodec: () => ({
      protectData: (payload) => Buffer.concat([Buffer.from("enc:"), payload]),
      unprotectData: (payload) => payload.subarray(4)
    })
  });
  const keyPath = join(mkdtempSync(join(tmpdir(), "bedcraft-dpapi-key-")), "nested", "key.bin");
  const key = Buffer.from("sensitive-key");
  storage.writeKey(keyPath, key);
  const storedText = readFileSync(keyPath, "utf8");
  assert.equal(storedText.includes("sensitive-key"), false);
  assert.deepEqual(storage.readKey(keyPath), key);
});

void test("windows dpapi key storage rejects legacy raw key file", () => {
  const storage = createDefaultEncryptionKeyStorage({
    platform: "win32",
    createWindowsDpapiCodec: () => ({
      protectData: (payload) => Buffer.concat([Buffer.from("enc:"), payload]),
      unprotectData: () => {
        throw new Error("invalid protected payload");
      }
    })
  });
  const keyPath = join(mkdtempSync(join(tmpdir(), "bedcraft-dpapi-key-")), "legacy.bin");
  const legacyKey = Buffer.from([0x00, 0x01, 0x11, 0xff, 0x7a]);
  writeFileSync(keyPath, legacyKey);
  assert.throws(() => storage.readKey(keyPath), { message: /invalid protected payload/u });
});

void test("windows dpapi key storage throws for invalid protected payload", () => {
  const storage = createDefaultEncryptionKeyStorage({
    platform: "win32",
    createWindowsDpapiCodec: () => ({
      protectData: (payload) => payload,
      unprotectData: () => {
        throw new Error("unprotect failed");
      }
    })
  });
  const keyPath = join(mkdtempSync(join(tmpdir(), "bedcraft-dpapi-key-")), "invalid.bin");
  writeFileSync(keyPath, "YWJj", "utf8");
  assert.throws(() => storage.readKey(keyPath), { message: /unprotect failed/u });
});

void test("windows dpapi key storage rejects trailing line ending", () => {
  const storage = createDefaultEncryptionKeyStorage({
    platform: "win32",
    createWindowsDpapiCodec: () => ({
      protectData: (payload) => payload,
      unprotectData: (payload) => payload
    })
  });
  const keyPath = join(mkdtempSync(join(tmpdir(), "bedcraft-dpapi-key-")), "line-ending.bin");
  writeFileSync(keyPath, "YWJj\r\n", "utf8");
  assert.throws(() => storage.readKey(keyPath), { message: /invalid protected payload/u });
});

void test("windows dpapi key storage rejects internal whitespace", () => {
  const storage = createDefaultEncryptionKeyStorage({ platform: "win32" });
  const keyPath = join(mkdtempSync(join(tmpdir(), "bedcraft-dpapi-key-")), "whitespace.bin");
  writeFileSync(keyPath, "YW Jj", "utf8");
  assert.throws(() => storage.readKey(keyPath), { message: /invalid protected payload/u });
});
