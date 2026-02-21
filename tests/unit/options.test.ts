import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveJoinOptions, resolveScanOptions, type EnvironmentVariables } from "../../src/command-line/options.js";
import { DEFAULT_BEDROCK_PORT, DEFAULT_JOIN_TIMEOUT_MS, DEFAULT_NETHERNET_PORT, DEFAULT_RAKNET_BACKEND, RAKNET_BACKEND_NATIVE, RAKNET_BACKEND_NODE } from "../../src/constants.js";

const emptyEnv: EnvironmentVariables = {};
const emptyScanInput = { timeout: undefined, name: undefined, transport: undefined };
const emptyJoinInput = {
  host: undefined,
  port: undefined,
  name: undefined,
  transport: undefined,
  account: undefined,
  cacheDir: undefined,
  keyFile: undefined,
  minecraftVersion: undefined,
  joinTimeout: undefined,
  forceRefresh: undefined,
  skipPing: undefined,
  raknetBackend: undefined,
  discoveryTimeout: undefined
};

void test("resolveScanOptions uses defaults", () => {
  const options = resolveScanOptions(emptyScanInput, emptyEnv);
  assert.equal(typeof options.timeoutMs, "number");
  assert.equal(options.transport, "nethernet");
});

void test("resolveJoinOptions requires account", () => {
  assert.throws(() => resolveJoinOptions(emptyJoinInput, emptyEnv));
});

void test("resolveJoinOptions reads environment", () => {
  const options = resolveJoinOptions(
    emptyJoinInput,
    { BEDCRAFT_ACCOUNT: "user", BEDCRAFT_FORCE_REFRESH: "true", BEDCRAFT_SKIP_PING: "true" }
  );
  assert.equal(options.accountName, "user");
  assert.equal(options.forceRefresh, true);
  assert.equal(options.skipPing, true);
  assert.equal(options.raknetBackend, DEFAULT_RAKNET_BACKEND);
  assert.equal(options.transport, "nethernet");
  assert.equal(options.port, DEFAULT_NETHERNET_PORT);
  assert.equal(options.minecraftVersion, undefined);
  assert.equal(options.joinTimeoutMs, DEFAULT_JOIN_TIMEOUT_MS);
});

void test("resolveJoinOptions rejects invalid port", () => {
  assert.throws(() => resolveJoinOptions(
    { ...emptyJoinInput, account: "user", port: "invalid" },
    {}
  ));
});

void test("resolveJoinOptions parses false boolean", () => {
  const options = resolveJoinOptions(
    { ...emptyJoinInput, account: "user" },
    { BEDCRAFT_FORCE_REFRESH: "false" }
  );
  assert.equal(options.forceRefresh, false);
});

void test("resolveJoinOptions accepts native backend alias", () => {
  const options = resolveJoinOptions({ ...emptyJoinInput, account: "user", raknetBackend: "native" }, {});
  assert.equal(options.raknetBackend, RAKNET_BACKEND_NATIVE);
});

void test("resolveJoinOptions accepts node backend alias", () => {
  const options = resolveJoinOptions({ ...emptyJoinInput, account: "user", raknetBackend: "node" }, {});
  assert.equal(options.raknetBackend, RAKNET_BACKEND_NODE);
});

void test("resolveJoinOptions rejects invalid raknet backend", () => {
  assert.throws(() => resolveJoinOptions(
    { ...emptyJoinInput, account: "user", raknetBackend: "invalid" },
    {}
  ));
});

void test("resolveJoinOptions rejects removed js raknet backend alias", () => {
  assert.throws(() => resolveJoinOptions(
    { ...emptyJoinInput, account: "user", raknetBackend: "js" },
    {}
  ));
});

void test("resolveJoinOptions uses raknet defaults when transport is set", () => {
  const options = resolveJoinOptions({ ...emptyJoinInput, account: "user", transport: "raknet" }, {});
  assert.equal(options.transport, "raknet");
  assert.equal(options.port, DEFAULT_BEDROCK_PORT);
});

void test("resolveJoinOptions infers transport from port", () => {
  const options = resolveJoinOptions({ ...emptyJoinInput, account: "user", port: String(DEFAULT_BEDROCK_PORT) }, {});
  assert.equal(options.transport, "raknet");
});

void test("resolveScanOptions rejects invalid transport", () => {
  assert.throws(() => resolveScanOptions({ ...emptyScanInput, transport: "invalid" }, emptyEnv));
});
