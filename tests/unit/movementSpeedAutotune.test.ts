import assert from "node:assert/strict";
import { test } from "node:test";
import { createMovementSpeedAutotune } from "../../src/bot/movementSpeedAutotune.js";

void test("createMovementSpeedAutotune increases speed after stable movement window", () => {
  const movementSpeedAutotune = createMovementSpeedAutotune({
    baseSpeedBlocksPerSecond: 1,
    minimumSpeedBlocksPerSecond: 0.8,
    maximumSpeedBlocksPerSecond: 1.3,
    increaseStepBlocksPerSecond: 0.1,
    increaseIntervalMs: 100,
    increaseQuietWindowMs: 100
  });
  movementSpeedAutotune.notePredictedPosition({ x: 0, y: 70, z: 0 }, 1, 0);
  movementSpeedAutotune.observeAuthoritativePosition({ x: 0, y: 70, z: 0 }, 20);
  assert.equal(movementSpeedAutotune.probeStableIncrease(50, 1, false), null);
  const firstIncrease = movementSpeedAutotune.probeStableIncrease(120, 1, false);
  assert.equal(firstIncrease?.reason, "stability_probe");
  assert.equal(firstIncrease?.nextSpeedBlocksPerSecond, 1.1);
  movementSpeedAutotune.notePredictedPosition({ x: 0, y: 70, z: 1 }, 1, 130);
  movementSpeedAutotune.observeAuthoritativePosition({ x: 0.05, y: 70, z: 1 }, 150);
  const secondIncrease = movementSpeedAutotune.probeStableIncrease(240, 1, false);
  assert.equal(secondIncrease?.nextSpeedBlocksPerSecond, 1.2);
});

void test("createMovementSpeedAutotune backs off speed after repeated server corrections", () => {
  const movementSpeedAutotune = createMovementSpeedAutotune({
    baseSpeedBlocksPerSecond: 1.2,
    minimumSpeedBlocksPerSecond: 0.8,
    maximumSpeedBlocksPerSecond: 2,
    correctionThresholdBlocks: 0.5,
    correctionWindowMs: 1000,
    correctionStrikeLimit: 2,
    correctionBackoffRatio: 0.8
  });
  movementSpeedAutotune.notePredictedPosition({ x: 2, y: 70, z: 0 }, 1, 0);
  assert.equal(movementSpeedAutotune.observeAuthoritativePosition({ x: 0, y: 70, z: 0 }, 100), null);
  movementSpeedAutotune.notePredictedPosition({ x: 2.5, y: 70, z: 0 }, 1, 150);
  const backoff = movementSpeedAutotune.observeAuthoritativePosition({ x: 0, y: 70, z: 0 }, 200);
  assert.equal(backoff?.reason, "server_correction_backoff");
  assert.equal(backoff?.previousSpeedBlocksPerSecond, 1.2);
  assert.equal(backoff?.nextSpeedBlocksPerSecond, 0.96);
  assert.equal(backoff?.correctionDistanceBlocks !== undefined && backoff.correctionDistanceBlocks > 2, true);
});

void test("createMovementSpeedAutotune ignores stale prediction corrections", () => {
  const movementSpeedAutotune = createMovementSpeedAutotune({
    baseSpeedBlocksPerSecond: 1.2,
    minimumSpeedBlocksPerSecond: 0.8,
    maximumSpeedBlocksPerSecond: 2,
    correctionThresholdBlocks: 0.1,
    predictionMaxAgeMs: 50
  });
  movementSpeedAutotune.notePredictedPosition({ x: 1, y: 70, z: 0 }, 1, 0);
  const noBackoff = movementSpeedAutotune.observeAuthoritativePosition({ x: 0, y: 70, z: 0 }, 100);
  assert.equal(noBackoff, null);
  assert.equal(movementSpeedAutotune.getSpeedBlocksPerSecond(), 1.2);
});

void test("createMovementSpeedAutotune does not increase speed during safety recovery or correction quiet window", () => {
  const movementSpeedAutotune = createMovementSpeedAutotune({
    baseSpeedBlocksPerSecond: 1,
    minimumSpeedBlocksPerSecond: 0.8,
    maximumSpeedBlocksPerSecond: 1.5,
    increaseStepBlocksPerSecond: 0.2,
    increaseIntervalMs: 100,
    increaseQuietWindowMs: 300,
    correctionThresholdBlocks: 0.2,
    correctionWindowMs: 500,
    correctionStrikeLimit: 1
  });
  movementSpeedAutotune.notePredictedPosition({ x: 1, y: 70, z: 0 }, 1, 0);
  const backoff = movementSpeedAutotune.observeAuthoritativePosition({ x: 0, y: 70, z: 0 }, 50);
  assert.equal(backoff?.reason, "server_correction_backoff");
  assert.equal(movementSpeedAutotune.probeStableIncrease(120, 1, true), null);
  assert.equal(movementSpeedAutotune.probeStableIncrease(200, 1, false), null);
  movementSpeedAutotune.notePredictedPosition({ x: 1.1, y: 70, z: 0 }, 1, 320);
  movementSpeedAutotune.observeAuthoritativePosition({ x: 1.05, y: 70, z: 0 }, 340);
  const increase = movementSpeedAutotune.probeStableIncrease(450, 1, false);
  assert.equal(increase?.reason, "stability_probe");
});

void test("createMovementSpeedAutotune can increase without authoritative feedback during probing", () => {
  const movementSpeedAutotune = createMovementSpeedAutotune({
    baseSpeedBlocksPerSecond: 1,
    minimumSpeedBlocksPerSecond: 0.8,
    maximumSpeedBlocksPerSecond: 1.5,
    increaseStepBlocksPerSecond: 0.2,
    increaseIntervalMs: 100,
    increaseQuietWindowMs: 100
  });
  movementSpeedAutotune.notePredictedPosition({ x: 0, y: 70, z: 0 }, 1, 0);
  const increase = movementSpeedAutotune.probeStableIncrease(150, 1, false);
  assert.equal(increase?.reason, "stability_probe");
  assert.equal(movementSpeedAutotune.getSpeedBlocksPerSecond(), 1.2);
});
