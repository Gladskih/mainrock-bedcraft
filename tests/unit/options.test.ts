import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveJoinOptions,
  resolveScanOptions,
  type EnvironmentVariables
} from "../../src/command-line/options.js";
import { resolveCalibrateSpeedOptions, resolveFollowOptions } from "../../src/command-line/joinBehaviorOptions.js";
import {
  DEFAULT_BEDROCK_PORT,
  DEFAULT_JOIN_TIMEOUT_MS,
  DEFAULT_NETHERNET_PORT,
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
  followCoordinates: undefined,
  chunkRadius: undefined,
  reconnectRetries: undefined,
  reconnectBaseDelay: undefined,
  reconnectMaxDelay: undefined,
  speedProfileFile: undefined
};
const emptyFollowInput = {
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
  discoveryTimeout: undefined,
  followPlayer: undefined,
  followCoordinates: undefined,
  chunkRadius: undefined,
  reconnectRetries: undefined,
  reconnectBaseDelay: undefined,
  reconnectMaxDelay: undefined,
  speedProfileFile: undefined
};
const emptyCalibrateInput = {
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
  discoveryTimeout: undefined,
  followCoordinates: undefined,
  chunkRadius: undefined,
  reconnectRetries: undefined,
  reconnectBaseDelay: undefined,
  reconnectMaxDelay: undefined,
  speedProfileFile: undefined
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
  assert.equal(options.movementSpeedMode, "fixed");
  assert.equal(typeof options.viewDistanceChunks, "number");
});

void test("resolveFollowOptions resolves follow-player mode", () => {
  const options = resolveFollowOptions(
    { ...emptyFollowInput, account: "user", followPlayer: "TargetPlayer" },
    {}
  );
  assert.equal(options.movementGoal, MOVEMENT_GOAL_FOLLOW_PLAYER);
  assert.equal(options.followPlayerName, "TargetPlayer");
});

void test("resolveFollowOptions requires exactly one target", () => {
  assert.throws(() => resolveFollowOptions(
    { ...emptyFollowInput, account: "user" },
    {}
  ));
  assert.throws(() => resolveFollowOptions(
    { ...emptyFollowInput, account: "user", followPlayer: "TargetPlayer", followCoordinates: "10 70 -22" },
    {}
  ));
});

void test("resolveCalibrateSpeedOptions enables calibration mode", () => {
  const options = resolveCalibrateSpeedOptions(
    { ...emptyCalibrateInput, account: "user", followCoordinates: "10 70 -22" },
    {}
  );
  assert.equal(options.movementSpeedMode, "calibrate");
  assert.equal(options.movementGoal, "follow_coordinates");
});

void test("resolveJoinOptions resolves speed profile file path from environment", () => {
  const options = resolveJoinOptions(
    { ...emptyJoinInput, account: "user" },
    { BEDCRAFT_SPEED_PROFILE_FILE: "profile.json" }
  );
  assert.equal(options.speedProfileFilePath, "profile.json");
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

void test("resolveJoinOptions reads chunk radius from environment", () => {
  const options = resolveJoinOptions(
    { ...emptyJoinInput, account: "user" },
    { BEDCRAFT_CHUNK_RADIUS: "13" }
  );
  assert.equal(options.viewDistanceChunks, 13);
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
