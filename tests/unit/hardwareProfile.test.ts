import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDefaultChunkRadiusSoftCap } from "../../src/util/hardwareProfile.js";

const gigabyteBytes = 1024 ** 3;

void test("resolveDefaultChunkRadiusSoftCap scales with system memory", () => {
  assert.equal(resolveDefaultChunkRadiusSoftCap(4 * gigabyteBytes), 8);
  assert.equal(resolveDefaultChunkRadiusSoftCap(8 * gigabyteBytes), 10);
  assert.equal(resolveDefaultChunkRadiusSoftCap(12 * gigabyteBytes), 12);
  assert.equal(resolveDefaultChunkRadiusSoftCap(16 * gigabyteBytes), 14);
  assert.equal(resolveDefaultChunkRadiusSoftCap(32 * gigabyteBytes), 16);
});
