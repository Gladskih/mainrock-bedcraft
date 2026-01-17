import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createAuthFlow } from "../../src/authentication/authFlow.js";

void test("createAuthFlow returns authflow and key source", () => {
  const cacheDirectory = mkdtempSync(join(tmpdir(), "bedcraft-auth-"));
  const keyFilePath = join(cacheDirectory, "key.bin");
  const result = createAuthFlow({
    accountName: "tester",
    cacheDirectory,
    keyFilePath,
    environmentKey: "passphrase",
    forceRefresh: false,
    deviceCodeCallback: () => undefined
  });
  assert.equal(result.keySource, "environment");
  assert.equal(result.authflow.username, "tester");
});
