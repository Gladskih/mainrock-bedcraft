import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Logger } from "pino";
import { configureMovementLoop } from "../../src/bot/movementLoop.js";
import { DEFAULT_FOLLOW_PLAYER_TARGET_ACQUIRE_TIMEOUT_MS, MOVEMENT_GOAL_FOLLOW_PLAYER } from "../../src/constants.js";

type QueueCall = { name: string; params: object };

class FakeClient extends EventEmitter {
  queueCalls: QueueCall[] = [];
  queue(name: string, params: object): void {
    this.queueCalls.push({ name, params });
  }
  disconnect(): void {}
}

const createLogger = (): Logger => ({ info: () => undefined } as unknown as Logger);

void test("configureMovementLoop follow-player mode fails fast when target is unknown", async () => {
  const fakeClient = new FakeClient();
  let currentPosition = { x: 0, y: 70, z: 0 };
  let tick = 0n;
  let movementErrorMessage: string | null = null;
  fakeClient.on("error", (error: unknown) => {
    if (!(error instanceof Error)) return;
    movementErrorMessage = error.message;
  });
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
    getTick: () => {
      tick += 1n;
      return tick;
    }
  });
  await new Promise((resolve) => setTimeout(resolve, DEFAULT_FOLLOW_PLAYER_TARGET_ACQUIRE_TIMEOUT_MS + 200));
  movementLoop.cleanup();
  assert.equal(movementErrorMessage !== null, true);
  assert.equal((movementErrorMessage ?? "").includes("Follow target 'TargetPlayer' was not found in tracked entities"), true);
});
