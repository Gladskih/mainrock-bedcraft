import assert from "node:assert/strict";
import { test } from "node:test";
import { computeDiscoveryChecksum, isValidDiscoveryChecksum } from "../../src/nethernet/discoveryCrypto.js";

void test("isValidDiscoveryChecksum rejects invalid checksum length", () => {
  const payload = Buffer.from([1, 2, 3]);
  const checksum = computeDiscoveryChecksum(payload);
  assert.equal(isValidDiscoveryChecksum(payload, checksum.subarray(0, checksum.length - 1)), false);
});

