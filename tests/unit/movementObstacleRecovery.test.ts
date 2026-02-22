import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { createMovementObstacleRecoveryState, queueDoorInteractionPacket } from "../../src/bot/movementObstacleRecovery.js";

class FakeClient extends EventEmitter {
  queueCalls: Array<{ name: string; params: object }> = [];
  queue(name: string, params: object): void {
    this.queueCalls.push({ name, params });
  }
  disconnect(): void {}
}

void test("movement obstacle recovery stays idle while making progress", () => {
  const state = createMovementObstacleRecoveryState({
    stuckTimeoutMs: 200,
    stuckProgressDistanceBlocks: 0.2
  });
  const first = state.apply({
    position: { x: 0, y: 64, z: 0 },
    desiredMovementVector: { x: 0, y: 1 },
    safetyRecoveryActive: false,
    nowMs: 0
  });
  const second = state.apply({
    position: { x: 0, y: 64, z: 0.35 },
    desiredMovementVector: { x: 0, y: 1 },
    safetyRecoveryActive: false,
    nowMs: 120
  });
  assert.equal(first.reason, null);
  assert.equal(second.reason, null);
  assert.equal(second.jump, false);
});

void test("movement obstacle recovery triggers maneuver and door interaction when stuck", () => {
  const state = createMovementObstacleRecoveryState({
    stuckTimeoutMs: 120,
    recoveryDurationMs: 200,
    recoveryTurnDegrees: 90,
    doorInteractCooldownMs: 1000
  });
  state.apply({
    position: { x: 0, y: 64, z: 0 },
    desiredMovementVector: { x: 0, y: 1 },
    safetyRecoveryActive: false,
    nowMs: 0
  });
  const recovery = state.apply({
    position: { x: 0, y: 64, z: 0 },
    desiredMovementVector: { x: 0, y: 1 },
    safetyRecoveryActive: false,
    nowMs: 150
  });
  assert.equal(recovery.reason, "obstacle_recovery");
  assert.equal(recovery.jump, true);
  assert.notEqual(recovery.interaction, null);
  assert.equal(Math.abs(recovery.movementVector.x) > 0.9, true);
  assert.equal(Math.abs(recovery.movementVector.y) < 0.1, true);
});

void test("movement obstacle recovery enforces door interaction cooldown", () => {
  const state = createMovementObstacleRecoveryState({
    stuckTimeoutMs: 100,
    recoveryDurationMs: 260,
    doorInteractCooldownMs: 500
  });
  state.apply({
    position: { x: 0, y: 64, z: 0 },
    desiredMovementVector: { x: 0, y: 1 },
    safetyRecoveryActive: false,
    nowMs: 0
  });
  const first = state.apply({
    position: { x: 0, y: 64, z: 0 },
    desiredMovementVector: { x: 0, y: 1 },
    safetyRecoveryActive: false,
    nowMs: 120
  });
  const second = state.apply({
    position: { x: 0, y: 64, z: 0 },
    desiredMovementVector: { x: 0, y: 1 },
    safetyRecoveryActive: false,
    nowMs: 200
  });
  const third = state.apply({
    position: { x: 0, y: 64, z: 0 },
    desiredMovementVector: { x: 0, y: 1 },
    safetyRecoveryActive: false,
    nowMs: 700
  });
  assert.notEqual(first.interaction, null);
  assert.equal(second.interaction, null);
  assert.notEqual(third.interaction, null);
});

void test("movement obstacle recovery triggers on correction bursts before timeout", () => {
  const state = createMovementObstacleRecoveryState({
    stuckTimeoutMs: 5000,
    stuckCorrectionWindowMs: 400,
    stuckCorrectionStrikes: 3
  });
  state.apply({
    position: { x: 0, y: 64, z: 0 },
    desiredMovementVector: { x: 0, y: 1 },
    safetyRecoveryActive: false,
    nowMs: 0
  });
  state.noteAuthoritativeCorrection(100);
  state.noteAuthoritativeCorrection(180);
  state.noteAuthoritativeCorrection(260);
  const decision = state.apply({
    position: { x: 0, y: 64, z: 0 },
    desiredMovementVector: { x: 0, y: 1 },
    safetyRecoveryActive: false,
    nowMs: 300
  });
  assert.equal(decision.reason, "obstacle_recovery");
  assert.equal(decision.jump, true);
});

void test("movement obstacle recovery is disabled while safety mode is active", () => {
  const state = createMovementObstacleRecoveryState({
    stuckTimeoutMs: 100
  });
  state.apply({
    position: { x: 0, y: 64, z: 0 },
    desiredMovementVector: { x: 0, y: 1 },
    safetyRecoveryActive: false,
    nowMs: 0
  });
  const decision = state.apply({
    position: { x: 0, y: 64, z: 0 },
    desiredMovementVector: { x: 0, y: 1 },
    safetyRecoveryActive: true,
    nowMs: 200
  });
  assert.equal(decision.reason, null);
  assert.equal(decision.jump, false);
  assert.equal(decision.interaction, null);
});

void test("queueDoorInteractionPacket writes item_use transaction", () => {
  const client = new FakeClient();
  queueDoorInteractionPacket(client, {
    blockPosition: { x: 10, y: 65, z: -4 },
    face: 2,
    clickPosition: { x: 0.5, y: 0.5, z: 0.5 },
    playerPosition: { x: 9.2, y: 64, z: -4.2 }
  });
  assert.equal(client.queueCalls.length, 1);
  assert.equal(client.queueCalls[0]?.name, "inventory_transaction");
});
