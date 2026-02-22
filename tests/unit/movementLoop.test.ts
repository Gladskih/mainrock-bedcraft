import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Logger } from "pino";
import { configureMovementLoop } from "../../src/bot/movementLoop.js";
import {
  DEFAULT_MOVEMENT_AUTOTUNE_CALIBRATION_MAX_SPEED_BLOCKS_PER_SECOND,
  DEFAULT_MOVEMENT_AUTOTUNE_CALIBRATION_STABILITY_WINDOW_MS,
  MOVEMENT_GOAL_FOLLOW_COORDINATES,
  MOVEMENT_GOAL_FOLLOW_PLAYER,
  MOVEMENT_GOAL_SAFE_WALK,
  MOVEMENT_SPEED_MODE_CALIBRATE
} from "../../src/constants.js";

type QueueCall = { name: string; params: object };

class FakeClient extends EventEmitter {
  queueCalls: QueueCall[] = [];
  queue(name: string, params: object): void {
    this.queueCalls.push({ name, params });
  }
  disconnect(): void {}
}

const createLogger = (): Logger => ({ info: () => undefined } as unknown as Logger);

const createCapturingLogger = (): {
  logger: Logger;
  infoEvents: Array<{ payload: Record<string, unknown>; message: string }>;
  warnEvents: Array<{ payload: Record<string, unknown>; message: string }>;
} => {
  const infoEvents: Array<{ payload: Record<string, unknown>; message: string }> = [];
  const warnEvents: Array<{ payload: Record<string, unknown>; message: string }> = [];
  return {
    logger: {
      info: (payload: Record<string, unknown>, message: string) => {
        infoEvents.push({ payload, message });
      },
      warn: (payload: Record<string, unknown>, message: string) => {
        warnEvents.push({ payload, message });
      }
    } as unknown as Logger,
    infoEvents,
    warnEvents
  };
};

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
  let tick = 0n;
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
  await new Promise((resolve) => setTimeout(resolve, 260));
  movementLoop.cleanup();
  assert.equal(fakeClient.queueCalls.length >= 2, true);
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

void test("configureMovementLoop follow-coordinates mode moves toward target", async () => {
  const fakeClient = new FakeClient();
  let currentPosition = { x: 0, y: 70, z: 0 };
  let tick = 0n;
  const movementLoop = configureMovementLoop({
    client: fakeClient,
    logger: createLogger(),
    movementGoal: MOVEMENT_GOAL_FOLLOW_COORDINATES,
    followCoordinates: { x: 5, y: 70, z: 0 },
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

void test("configureMovementLoop follow-coordinates mode stops near target", async () => {
  const fakeClient = new FakeClient();
  let currentPosition = { x: 10, y: 70, z: 10 };
  const movementLoop = configureMovementLoop({
    client: fakeClient,
    logger: createLogger(),
    movementGoal: MOVEMENT_GOAL_FOLLOW_COORDINATES,
    followCoordinates: { x: 10.5, y: 70, z: 10.5 },
    getPosition: () => currentPosition,
    setPosition: (position) => {
      currentPosition = position;
    },
    getTick: () => 1n
  });
  await new Promise((resolve) => setTimeout(resolve, 130));
  movementLoop.cleanup();
  const stoppedMove = fakeClient.queueCalls.some((call) => {
    if (call.name !== "player_auth_input") return false;
    const movementVector = (call.params as { move_vector?: { x?: number; z?: number } }).move_vector;
    return (movementVector?.x ?? 1) === 0 && (movementVector?.z ?? 1) === 0;
  });
  assert.equal(stoppedMove, true);
});

void test("configureMovementLoop applies terrain safety recovery after local drop", async () => {
  const fakeClient = new FakeClient();
  let currentPosition = { x: 0, y: 70, z: 0 };
  const movementLoop = configureMovementLoop({
    client: fakeClient,
    logger: createLogger(),
    movementGoal: MOVEMENT_GOAL_SAFE_WALK,
    getPosition: () => currentPosition,
    setPosition: (position) => {
      currentPosition = position;
    },
    getTick: () => 1n
  });
  await new Promise((resolve) => setTimeout(resolve, 120));
  currentPosition = { x: currentPosition.x, y: currentPosition.y - 2, z: currentPosition.z };
  await new Promise((resolve) => setTimeout(resolve, 140));
  movementLoop.cleanup();
  const hasSafetyJump = fakeClient.queueCalls.some((call) => {
    const inputData = (call.params as { input_data?: { jump?: boolean } }).input_data;
    return inputData?.jump === true;
  });
  assert.equal(hasSafetyJump, true);
});

void test("configureMovementLoop applies low-air safety recovery from attributes", async () => {
  const fakeClient = new FakeClient();
  let currentPosition = { x: 0, y: 70, z: 0 };
  const movementLoop = configureMovementLoop({
    client: fakeClient,
    logger: createLogger(),
    movementGoal: MOVEMENT_GOAL_SAFE_WALK,
    getPosition: () => currentPosition,
    setPosition: (position) => {
      currentPosition = position;
    },
    getTick: () => 1n,
    getLocalRuntimeEntityId: () => "1"
  });
  fakeClient.emit("update_attributes", { runtime_id: 1n, attributes: [{ name: "minecraft:air", current: 2 }] });
  await new Promise((resolve) => setTimeout(resolve, 140));
  movementLoop.cleanup();
  const hasSafetyJump = fakeClient.queueCalls.some((call) => {
    const inputData = (call.params as { input_data?: { jump?: boolean } }).input_data;
    return inputData?.jump === true;
  });
  assert.equal(hasSafetyJump, true);
});

void test("configureMovementLoop calibrates speed and emits calibration completion", async () => {
  const fakeClient = new FakeClient();
  const loggerCapture = createCapturingLogger();
  let currentPosition = { x: 0, y: 70, z: 0 };
  let calibratedSpeed: number | null = null;
  const originalDateNow = Date.now;
  let fakeNowMs = 0;
  Date.now = () => fakeNowMs;
  const movementLoop = configureMovementLoop({
    client: fakeClient,
    logger: loggerCapture.logger,
    movementGoal: MOVEMENT_GOAL_SAFE_WALK,
    movementSpeedMode: MOVEMENT_SPEED_MODE_CALIBRATE,
    initialSpeedBlocksPerSecond: DEFAULT_MOVEMENT_AUTOTUNE_CALIBRATION_MAX_SPEED_BLOCKS_PER_SECOND,
    getPosition: () => currentPosition,
    setPosition: (position) => {
      currentPosition = position;
    },
    getTick: () => 1n,
    onMovementSpeedCalibrated: (speedBlocksPerSecond) => {
      calibratedSpeed = speedBlocksPerSecond;
      return Promise.reject(new Error("persist-failed"));
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 120));
  fakeClient.emit("correct_player_move_prediction", { position: { x: 0, y: 70, z: 0 } });
  fakeNowMs += DEFAULT_MOVEMENT_AUTOTUNE_CALIBRATION_STABILITY_WINDOW_MS + 100;
  await new Promise((resolve) => setTimeout(resolve, 130));
  movementLoop.cleanup();
  Date.now = originalDateNow;
  assert.equal(calibratedSpeed !== null, true);
  assert.equal(
    loggerCapture.infoEvents.some((event) => event.payload["event"] === "movement_speed_calibration_phase"),
    true
  );
  assert.equal(
    loggerCapture.infoEvents.some((event) => event.payload["event"] === "movement_speed_calibrated"),
    true
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(
    loggerCapture.warnEvents.some((event) => event.payload["event"] === "movement_speed_calibration_persist_failed"),
    true
  );
});
