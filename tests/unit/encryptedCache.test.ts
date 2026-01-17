import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { EncryptedFileCache } from "../../src/authentication/encryptedCache.js";

const createCache = (): { cache: EncryptedFileCache; cachePath: string } => {
  const directory = mkdtempSync(join(tmpdir(), "bedcraft-test-"));
  const cachePath = join(directory, "cache.bin");
  return { cache: new EncryptedFileCache(cachePath, randomBytes(32)), cachePath };
};

void test("EncryptedFileCache stores and reads values", async () => {
  const { cache } = createCache();
  await cache.setCached({ token: "secret" });
  assert.deepEqual(await cache.getCached(), { token: "secret" });
});

void test("EncryptedFileCache does not store plaintext", async () => {
  const { cache, cachePath } = createCache();
  await cache.setCached({ token: "secret" });
  assert.equal(readFileSync(cachePath).toString("utf8").includes("secret"), false);
});

void test("EncryptedFileCache merges partial values", async () => {
  const { cache } = createCache();
  await cache.setCached({ token: "secret" });
  await cache.setCachedPartial({ refresh: "next" });
  assert.deepEqual(await cache.getCached(), { token: "secret", refresh: "next" });
});

void test("EncryptedFileCache reset clears cache file", async () => {
  const { cache, cachePath } = createCache();
  await cache.setCached({ token: "secret" });
  await cache.reset();
  assert.equal(existsSync(cachePath), false);
  assert.deepEqual(await cache.getCached(), {});
});

void test("EncryptedFileCache returns empty on corrupted data", async () => {
  const { cache, cachePath } = createCache();
  writeFileSync(cachePath, Buffer.from([0x01, 0x02]));
  assert.deepEqual(await cache.getCached(), {});
});

void test("EncryptedFileCache returns empty on unreadable payload", async () => {
  const { cache, cachePath } = createCache();
  writeFileSync(cachePath, randomBytes(64));
  assert.deepEqual(await cache.getCached(), {});
});

void test("EncryptedFileCache coerces non-object values and creates directories", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bedcraft-test-"));
  const cachePath = join(directory, "nested", "cache.bin");
  const cache = new EncryptedFileCache(cachePath, randomBytes(32));
  await cache.setCached("not an object");
  assert.deepEqual(await cache.getCached(), {});
  assert.equal(existsSync(cachePath), true);
});
