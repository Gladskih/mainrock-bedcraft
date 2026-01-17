import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadEncryptionKey } from "../../src/authentication/encryptionKey.js";

void test("loadEncryptionKey uses environment key", () => {
  const keyPath = join(mkdtempSync(join(tmpdir(), "bedcraft-key-")), "key.bin");
  const result = loadEncryptionKey(keyPath, "passphrase");
  assert.equal(result.source, "environment");
  assert.equal(result.key.length, 32);
});

void test("loadEncryptionKey persists generated key", () => {
  const keyPath = join(mkdtempSync(join(tmpdir(), "bedcraft-key-")), "key.bin");
  const first = loadEncryptionKey(keyPath, undefined);
  assert.equal(first.source, "generated");
  assert.equal(readFileSync(keyPath).length > 0, true);
  const second = loadEncryptionKey(keyPath, undefined);
  assert.equal(second.source, "file");
  assert.equal(second.key.length, 32);
});

void test("loadEncryptionKey creates missing directory", () => {
  const directory = mkdtempSync(join(tmpdir(), "bedcraft-key-"));
  const keyPath = join(directory, "nested", "key.bin");
  const result = loadEncryptionKey(keyPath, undefined);
  assert.equal(result.source, "generated");
  assert.equal(readFileSync(keyPath).length > 0, true);
});
