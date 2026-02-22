import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePlayersOptions, resolveScanOptions } from "../../src/command-line/options.js";
import { DEFAULT_PLAYER_LIST_WAIT_MS } from "../../src/constants.js";

const emptyEnv = {};

void test("resolveScanOptions rejects invalid transport", () => {
  assert.throws(() => resolveScanOptions({ timeout: undefined, name: undefined, transport: "invalid" }, emptyEnv));
});

void test("resolvePlayersOptions uses defaults", () => {
  const options = resolvePlayersOptions({
    host: undefined,
    port: undefined,
    name: undefined,
    account: "user",
    cacheDir: undefined,
    keyFile: undefined,
    joinTimeout: undefined,
    forceRefresh: undefined,
    skipPing: undefined,
    raknetBackend: undefined,
    discoveryTimeout: undefined,
    transport: undefined,
    wait: undefined,
    chunkRadius: undefined,
    reconnectRetries: undefined,
    reconnectBaseDelay: undefined,
    reconnectMaxDelay: undefined
  }, emptyEnv);
  assert.equal(options.waitMs, DEFAULT_PLAYER_LIST_WAIT_MS);
  assert.equal(options.transport, "nethernet");
});

void test("resolvePlayersOptions reads wait timeout from environment", () => {
  const options = resolvePlayersOptions({
    host: undefined,
    port: undefined,
    name: undefined,
    account: "user",
    cacheDir: undefined,
    keyFile: undefined,
    joinTimeout: undefined,
    forceRefresh: undefined,
    skipPing: undefined,
    raknetBackend: undefined,
    discoveryTimeout: undefined,
    transport: undefined,
    wait: undefined,
    chunkRadius: undefined,
    reconnectRetries: undefined,
    reconnectBaseDelay: undefined,
    reconnectMaxDelay: undefined
  }, { BEDCRAFT_PLAYERS_WAIT_MS: "9000" });
  assert.equal(options.waitMs, 9000);
});

void test("resolvePlayersOptions rejects invalid wait timeout", () => {
  assert.throws(() => resolvePlayersOptions({
    host: undefined,
    port: undefined,
    name: undefined,
    account: "user",
    cacheDir: undefined,
    keyFile: undefined,
    joinTimeout: undefined,
    forceRefresh: undefined,
    skipPing: undefined,
    raknetBackend: undefined,
    discoveryTimeout: undefined,
    transport: undefined,
    wait: "bad",
    chunkRadius: undefined,
    reconnectRetries: undefined,
    reconnectBaseDelay: undefined,
    reconnectMaxDelay: undefined
  }, emptyEnv));
});
