import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveJoinOptions } from "../../src/command-line/options.js";
import { MOVEMENT_GOAL_FOLLOW_COORDINATES } from "../../src/constants.js";

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

void test("resolveJoinOptions resolves follow-coordinates goal from cli input", () => {
  const options = resolveJoinOptions(
    { ...emptyJoinInput, account: "user", goal: "follow-coordinates", followCoordinates: "-2962 65 -2100" },
    {}
  );
  assert.equal(options.movementGoal, MOVEMENT_GOAL_FOLLOW_COORDINATES);
  assert.deepEqual(options.followCoordinates, { x: -2962, y: 65, z: -2100 });
});

void test("resolveJoinOptions resolves follow-coordinates goal from environment", () => {
  const options = resolveJoinOptions(
    { ...emptyJoinInput, account: "user" },
    { BEDCRAFT_GOAL: "follow_coordinates", BEDCRAFT_FOLLOW_COORDINATES: "10,70,-22" }
  );
  assert.equal(options.movementGoal, MOVEMENT_GOAL_FOLLOW_COORDINATES);
  assert.deepEqual(options.followCoordinates, { x: 10, y: 70, z: -22 });
});

void test("resolveJoinOptions accepts npm caret-escaped follow coordinates on Windows", () => {
  const options = resolveJoinOptions(
    { ...emptyJoinInput, account: "user", goal: "follow-coordinates", followCoordinates: "^-2962^ 65^ -2100^" },
    {}
  );
  assert.equal(options.movementGoal, MOVEMENT_GOAL_FOLLOW_COORDINATES);
  assert.deepEqual(options.followCoordinates, { x: -2962, y: 65, z: -2100 });
});

void test("resolveJoinOptions rejects follow-coordinates goal without coordinates", () => {
  assert.throws(() => resolveJoinOptions(
    { ...emptyJoinInput, account: "user", goal: "follow-coordinates" },
    {}
  ));
});

void test("resolveJoinOptions rejects invalid follow coordinates", () => {
  assert.throws(() => resolveJoinOptions(
    { ...emptyJoinInput, account: "user", goal: "follow-coordinates", followCoordinates: "bad data" },
    {}
  ));
});
