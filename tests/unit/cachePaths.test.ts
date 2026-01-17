import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveCachePaths } from "../../src/authentication/cachePaths.js";

void test("resolveCachePaths returns key file path", () => {
  const paths = resolveCachePaths("bedcraft-test");
  assert.equal(paths.keyFilePath.endsWith("cache-key.bin"), true);
  assert.equal(paths.cacheDirectory.length > 0, true);
});
