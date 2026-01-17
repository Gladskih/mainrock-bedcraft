import assert from "node:assert/strict";
import { test } from "node:test";
import { delay, withTimeout } from "../../src/util/timeouts.js";

void test("withTimeout resolves before timeout", async () => {
  const result = await withTimeout(Promise.resolve("ok"), 50, "timeout");
  assert.equal(result, "ok");
});

void test("withTimeout rejects after timeout", async () => {
  await assert.rejects(() => withTimeout(delay(50).then(() => "late"), 1, "timeout"));
});
