import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateReconnectDelayMs } from "../../src/bedrock/reconnectPolicy.js";

void test("calculateReconnectDelayMs applies exponential backoff and cap", () => {
  assert.equal(calculateReconnectDelayMs({
    attempt: 0,
    baseDelayMs: 1000,
    maxDelayMs: 8000,
    jitterRatio: 0,
    random: () => 0
  }), 1000);
  assert.equal(calculateReconnectDelayMs({
    attempt: 3,
    baseDelayMs: 1000,
    maxDelayMs: 8000,
    jitterRatio: 0,
    random: () => 0
  }), 8000);
  assert.equal(calculateReconnectDelayMs({
    attempt: 7,
    baseDelayMs: 1000,
    maxDelayMs: 8000,
    jitterRatio: 0,
    random: () => 0
  }), 8000);
});

void test("calculateReconnectDelayMs adds jitter and clamps negative values", () => {
  assert.equal(calculateReconnectDelayMs({
    attempt: -2,
    baseDelayMs: 1000,
    maxDelayMs: 8000,
    jitterRatio: 0.25,
    random: () => 1
  }), 1250);
  assert.equal(calculateReconnectDelayMs({
    attempt: 1,
    baseDelayMs: 1000,
    maxDelayMs: 8000,
    jitterRatio: -1,
    random: () => 1
  }), 2000);
});
