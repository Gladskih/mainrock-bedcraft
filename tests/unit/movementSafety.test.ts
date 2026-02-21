import assert from "node:assert/strict";
import { test } from "node:test";
import { createMovementSafetyState, type MovementVector } from "../../src/bot/movementSafety.js";

const forwardMovement: MovementVector = { x: 0, y: 1 };

void test("createMovementSafetyState triggers terrain recovery on sudden drop", () => {
  const safetyState = createMovementSafetyState({
    dropTriggerBlocks: 1,
    terrainRecoveryMs: 1000
  });
  const firstDecision = safetyState.apply({ x: 0, y: 70, z: 0 }, forwardMovement, 0);
  const secondDecision = safetyState.apply({ x: 0, y: 68.5, z: 0 }, forwardMovement, 100);
  assert.deepEqual(firstDecision.movementVector, forwardMovement);
  assert.equal(firstDecision.jump, false);
  assert.deepEqual(secondDecision.movementVector, { x: 0, y: -1 });
  assert.equal(secondDecision.jump, true);
  assert.equal(secondDecision.reason, "terrain_recovery");
});

void test("createMovementSafetyState triggers terrain recovery on repeated descent", () => {
  const safetyState = createMovementSafetyState({
    dropTriggerBlocks: 10,
    descentStepBlocks: 0.15,
    descentTicks: 2,
    terrainRecoveryMs: 1000
  });
  safetyState.apply({ x: 0, y: 70, z: 0 }, forwardMovement, 0);
  safetyState.apply({ x: 0, y: 69.8, z: 0 }, forwardMovement, 100);
  const decision = safetyState.apply({ x: 0, y: 69.6, z: 0 }, forwardMovement, 200);
  assert.equal(decision.jump, true);
  assert.equal(decision.reason, "terrain_recovery");
});

void test("createMovementSafetyState resumes desired movement after recovery expires", () => {
  const safetyState = createMovementSafetyState({
    dropTriggerBlocks: 1,
    terrainRecoveryMs: 100
  });
  safetyState.apply({ x: 0, y: 70, z: 0 }, forwardMovement, 0);
  safetyState.apply({ x: 0, y: 68, z: 0 }, forwardMovement, 10);
  const decision = safetyState.apply({ x: 0, y: 68, z: 0 }, forwardMovement, 200);
  assert.deepEqual(decision.movementVector, forwardMovement);
  assert.equal(decision.jump, false);
  assert.equal(decision.reason, null);
});

void test("createMovementSafetyState triggers recovery on low air and health loss", () => {
  const safetyState = createMovementSafetyState({
    airRecoveryMs: 1000,
    lowAirThreshold: 6,
    healthLossTrigger: 2
  });
  safetyState.observeAttributes({ runtime_id: 1n, attributes: [{ name: "minecraft:air", current: 4 }] }, "1", 10);
  const lowAirDecision = safetyState.apply({ x: 0, y: 70, z: 0 }, forwardMovement, 20);
  assert.equal(lowAirDecision.jump, true);
  assert.equal(lowAirDecision.reason, "attribute_recovery");
  safetyState.observeAttributes({ runtime_id: 1n, attributes: [{ name: "minecraft:health", current: 20 }] }, "1", 2000);
  safetyState.observeAttributes({ runtime_id: 1n, attributes: [{ name: "minecraft:health", current: 17 }] }, "1", 2100);
  const healthDecision = safetyState.apply({ x: 0, y: 70, z: 0 }, forwardMovement, 2200);
  assert.equal(healthDecision.jump, true);
  assert.equal(healthDecision.reason, "attribute_recovery");
});

void test("createMovementSafetyState ignores foreign attribute packets when local id is known", () => {
  const safetyState = createMovementSafetyState({ airRecoveryMs: 1000 });
  safetyState.observeAttributes({ runtime_id: 2n, attributes: [{ name: "minecraft:air", current: 1 }] }, "1", 10);
  const decision = safetyState.apply({ x: 0, y: 70, z: 0 }, forwardMovement, 20);
  assert.equal(decision.reason, null);
  assert.equal(decision.jump, false);
});

void test("createMovementSafetyState enters panic recovery after repeated danger strikes", () => {
  const safetyState = createMovementSafetyState({
    airRecoveryMs: 200,
    panicStrikeLimit: 2,
    panicStrikeWindowMs: 1000,
    panicRecoveryMs: 500
  });
  safetyState.observeAttributes({ runtime_id: 1n, attributes: [{ name: "minecraft:air", current: 2 }] }, "1", 10);
  safetyState.observeAttributes({ runtime_id: 1n, attributes: [{ name: "minecraft:health", current: 20 }] }, "1", 30);
  safetyState.observeAttributes({ runtime_id: 1n, attributes: [{ name: "minecraft:health", current: 17 }] }, "1", 60);
  const decision = safetyState.apply({ x: 0, y: 70, z: 0 }, forwardMovement, 80);
  assert.equal(decision.reason, "panic_recovery");
  assert.equal(decision.jump, true);
  assert.deepEqual(decision.movementVector, { x: 0, y: 0 });
});

void test("createMovementSafetyState exits panic recovery after timeout", () => {
  const safetyState = createMovementSafetyState({
    airRecoveryMs: 200,
    panicStrikeLimit: 1,
    panicStrikeWindowMs: 1000,
    panicRecoveryMs: 150
  });
  safetyState.observeAttributes({ runtime_id: 1n, attributes: [{ name: "minecraft:air", current: 2 }] }, "1", 0);
  const panicDecision = safetyState.apply({ x: 0, y: 70, z: 0 }, forwardMovement, 50);
  const recoveredDecision = safetyState.apply({ x: 0, y: 70, z: 0 }, forwardMovement, 300);
  assert.equal(panicDecision.reason, "panic_recovery");
  assert.equal(recoveredDecision.reason, null);
  assert.equal(recoveredDecision.jump, false);
});
