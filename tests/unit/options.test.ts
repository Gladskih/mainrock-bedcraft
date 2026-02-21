import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveJoinOptions, resolvePlayersOptions, resolveScanOptions, type EnvironmentVariables } from "../../src/command-line/options.js";
import {
  DEFAULT_BEDROCK_PORT,
  DEFAULT_JOIN_TIMEOUT_MS,
  DEFAULT_NETHERNET_PORT,
  DEFAULT_PLAYER_LIST_WAIT_MS,
  DEFAULT_RAKNET_BACKEND,
  MOVEMENT_GOAL_FOLLOW_PLAYER,
  MOVEMENT_GOAL_SAFE_WALK,
  RAKNET_BACKEND_NATIVE,
  RAKNET_BACKEND_NODE
} from "../../src/constants.js";

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
  disconnectAfterFirstChunk: undefined,
  forceRefresh: undefined,
  skipPing: undefined,
  raknetBackend: undefined,
  discoveryTimeout: undefined,
  goal: undefined,
  followPlayer: undefined,
  reconnectRetries: undefined,
  reconnectBaseDelay: undefined,
  reconnectMaxDelay: undefined
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
  assert.equal(options.disconnectAfterFirstChunk, false);
  assert.equal(options.movementGoal, MOVEMENT_GOAL_SAFE_WALK);
  assert.equal(options.followPlayerName, undefined);
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

void test("resolveJoinOptions reads disconnect-after-first-chunk from environment", () => {
  const options = resolveJoinOptions({ ...emptyJoinInput, account: "user" }, { BEDCRAFT_DISCONNECT_AFTER_FIRST_CHUNK: "true" });
  assert.equal(options.disconnectAfterFirstChunk, true);
});

void test("resolveJoinOptions reads disconnect-after-first-chunk from cli input", () => {
  const options = resolveJoinOptions({ ...emptyJoinInput, account: "user", disconnectAfterFirstChunk: true }, {});
  assert.equal(options.disconnectAfterFirstChunk, true);
});

void test("resolveJoinOptions resolves follow-player goal from cli input", () => {
  const options = resolveJoinOptions(
    { ...emptyJoinInput, account: "user", goal: "follow-player", followPlayer: "TargetPlayer" },
    {}
  );
  assert.equal(options.movementGoal, MOVEMENT_GOAL_FOLLOW_PLAYER);
  assert.equal(options.followPlayerName, "TargetPlayer");
});

void test("resolveJoinOptions resolves follow-player goal from environment", () => {
  const options = resolveJoinOptions(
    { ...emptyJoinInput, account: "user" },
    { BEDCRAFT_GOAL: "follow_player", BEDCRAFT_FOLLOW_PLAYER: "TargetPlayer" }
  );
  assert.equal(options.movementGoal, MOVEMENT_GOAL_FOLLOW_PLAYER);
  assert.equal(options.followPlayerName, "TargetPlayer");
});

void test("resolveJoinOptions rejects follow-player goal without target name", () => {
  assert.throws(() => resolveJoinOptions(
    { ...emptyJoinInput, account: "user", goal: "follow-player" },
    {}
  ));
});

void test("resolveJoinOptions rejects invalid movement goal", () => {
  assert.throws(() => resolveJoinOptions(
    { ...emptyJoinInput, account: "user", goal: "invalid-goal" },
    {}
  ));
});

void test("resolveJoinOptions reads reconnect settings from environment", () => {
  const options = resolveJoinOptions(
    { ...emptyJoinInput, account: "user" },
    {
      BEDCRAFT_RECONNECT_MAX_RETRIES: "4",
      BEDCRAFT_RECONNECT_BASE_DELAY_MS: "200",
      BEDCRAFT_RECONNECT_MAX_DELAY_MS: "1000"
    }
  );
  assert.equal(options.reconnectMaxRetries, 4);
  assert.equal(options.reconnectBaseDelayMs, 200);
  assert.equal(options.reconnectMaxDelayMs, 1000);
});

void test("resolveJoinOptions rejects negative reconnect retries", () => {
  assert.throws(() => resolveJoinOptions(
    { ...emptyJoinInput, account: "user", reconnectRetries: "-1" },
    {}
  ));
});

void test("resolveJoinOptions rejects reconnect max delay lower than base delay", () => {
  assert.throws(() => resolveJoinOptions(
    {
      ...emptyJoinInput,
      account: "user",
      reconnectBaseDelay: "1000",
      reconnectMaxDelay: "500"
    },
    {}
  ));
});

void test("resolveScanOptions rejects invalid transport", () => {
  assert.throws(() => resolveScanOptions({ ...emptyScanInput, transport: "invalid" }, emptyEnv));
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
    reconnectRetries: undefined,
    reconnectBaseDelay: undefined,
    reconnectMaxDelay: undefined
  }, emptyEnv));
});
