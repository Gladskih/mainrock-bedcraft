import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Logger } from "pino";
import { configureMovementLoop } from "../../src/bot/movementLoop.js";
import { MOVEMENT_GOAL_FOLLOW_PLAYER, MOVEMENT_GOAL_SAFE_WALK } from "../../src/constants.js";

type QueueCall = { name: string; params: object };

class FakeClient extends EventEmitter {
  queueCalls: QueueCall[] = [];
  queue(name: string, params: object): void {
    this.queueCalls.push({ name, params });
  }
  disconnect(): void {}
}

const createLogger = (): Logger => ({ info: () => undefined } as unknown as Logger);

void test("configureMovementLoop sends periodic player_auth_input packets", async () => {
  const fakeClient = new FakeClient();
  let currentPosition = { x: 0, y: 70, z: 0 };
  let tick = 0n;
  const movementLoop = configureMovementLoop({
    client: fakeClient,
    logger: createLogger(),
    movementGoal: MOVEMENT_GOAL_SAFE_WALK,
    getPosition: () => currentPosition,
    setPosition: (position) => {
      currentPosition = position;
    },
    getTick: () => {
      tick += 1n;
      return tick;
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 130));
  movementLoop.cleanup();
  assert.equal(fakeClient.queueCalls.some((call) => call.name === "player_auth_input"), true);
  assert.equal(currentPosition.z !== 0, true);
});

void test("configureMovementLoop cleanup stops packet emission", async () => {
  const fakeClient = new FakeClient();
  const movementLoop = configureMovementLoop({
    client: fakeClient,
    logger: createLogger(),
    movementGoal: MOVEMENT_GOAL_SAFE_WALK,
    getPosition: () => ({ x: 0, y: 70, z: 0 }),
    setPosition: () => undefined,
    getTick: () => 1n
  });
  await new Promise((resolve) => setTimeout(resolve, 120));
  const packetCountBeforeCleanup = fakeClient.queueCalls.length;
  movementLoop.cleanup();
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(fakeClient.queueCalls.length, packetCountBeforeCleanup);
});

void test("configureMovementLoop follow-player mode patrols while target is unknown", async () => {
  const fakeClient = new FakeClient();
  let currentPosition = { x: 0, y: 70, z: 0 };
  const movementLoop = configureMovementLoop({
    client: fakeClient,
    logger: createLogger(),
    movementGoal: MOVEMENT_GOAL_FOLLOW_PLAYER,
    followPlayerName: "TargetPlayer",
    getFollowTargetPosition: () => null,
    getPosition: () => currentPosition,
    setPosition: (position) => {
      currentPosition = position;
    },
    getTick: () => 1n
  });
  await new Promise((resolve) => setTimeout(resolve, 130));
  movementLoop.cleanup();
  assert.equal(fakeClient.queueCalls.length > 0, true);
});

void test("configureMovementLoop follow-player mode moves toward target", async () => {
  const fakeClient = new FakeClient();
  let currentPosition = { x: 0, y: 70, z: 0 };
  let tick = 0n;
  const movementLoop = configureMovementLoop({
    client: fakeClient,
    logger: createLogger(),
    movementGoal: MOVEMENT_GOAL_FOLLOW_PLAYER,
    followPlayerName: "TargetPlayer",
    getFollowTargetPosition: () => ({ x: 5, y: 70, z: 0 }),
    getPosition: () => currentPosition,
    setPosition: (position) => {
      currentPosition = position;
    },
    getTick: () => {
      tick += 1n;
      return tick;
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 130));
  movementLoop.cleanup();
  assert.equal(fakeClient.queueCalls.some((call) => call.name === "player_auth_input"), true);
  assert.equal(currentPosition.x > 0, true);
});
