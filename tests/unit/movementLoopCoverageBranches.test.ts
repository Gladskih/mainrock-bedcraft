import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Logger } from "pino";
import { configureMovementLoop } from "../../src/bot/movementLoop.js";
import { MOVEMENT_GOAL_SAFE_WALK, MOVEMENT_SPEED_MODE_CALIBRATE } from "../../src/constants.js";

type QueueCall = { name: string; params: object };

class FakeClient extends EventEmitter {
  queueCalls: QueueCall[] = [];
  queue(name: string, params: object): void {
    this.queueCalls.push({ name, params });
  }
  disconnect(): void {}
}

void test("configureMovementLoop applies local move_player corrections", async () => {
  const fakeClient = new FakeClient();
  let currentPosition = { x: 0, y: 70, z: 0 };
  const movementLoop = configureMovementLoop({
    client: fakeClient,
    logger: { info: () => undefined } as unknown as Logger,
    movementGoal: MOVEMENT_GOAL_SAFE_WALK,
    getPosition: () => currentPosition,
    setPosition: (position) => {
      currentPosition = position;
    },
    getTick: () => 1n,
    getLocalRuntimeEntityId: () => "1"
  });
  fakeClient.emit("move_player", { runtime_id: 1n, position: { x: 4, y: 70, z: 5 } });
  await new Promise((resolve) => setTimeout(resolve, 20));
  movementLoop.cleanup();
  assert.deepEqual(currentPosition, { x: 4, y: 70, z: 5 });
});

void test("configureMovementLoop logs stability probe speed updates in calibration mode", async () => {
  const fakeClient = new FakeClient();
  let currentPosition = { x: 0, y: 70, z: 0 };
  const infoEvents: Array<{ event?: string; reason?: string }> = [];
  const originalDateNow = Date.now;
  let fakeNowMs = 0;
  Date.now = () => fakeNowMs;
  const movementLoop = configureMovementLoop({
    client: fakeClient,
    logger: { info: (payload: { event?: string; reason?: string }) => infoEvents.push(payload) } as unknown as Logger,
    movementGoal: MOVEMENT_GOAL_SAFE_WALK,
    movementSpeedMode: MOVEMENT_SPEED_MODE_CALIBRATE,
    getPosition: () => currentPosition,
    setPosition: (position) => {
      currentPosition = position;
    },
    getTick: () => 1n
  });
  await new Promise((resolve) => setTimeout(resolve, 120));
  fakeNowMs = 1600;
  await new Promise((resolve) => setTimeout(resolve, 140));
  movementLoop.cleanup();
  Date.now = originalDateNow;
  assert.equal(
    infoEvents.some((event) => event.event === "movement_speed_update" && event.reason === "stability_probe"),
    true
  );
});
