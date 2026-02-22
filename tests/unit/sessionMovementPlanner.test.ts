import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Logger } from "pino";
import { MOVEMENT_GOAL_FOLLOW_COORDINATES, MOVEMENT_GOAL_FOLLOW_PLAYER } from "../../src/constants.js";
import type { ProgressionTask } from "../../src/bot/progressionPlan.js";
import type { JoinOptions } from "../../src/bedrock/joinClient.js";
import { startSessionMovementLoopWithPlanner } from "../../src/bedrock/sessionMovementPlanner.js";
import type { Vector3 } from "../../src/bedrock/joinClientHelpers.js";

class FakeClient extends EventEmitter {
  disconnect(): void {}
}

const createResolvedOptions = (overrides: Partial<JoinOptions>): JoinOptions => {
  const logger = { info: () => undefined } as unknown as Logger;
  return {
    host: "127.0.0.1",
    port: 19132,
    accountName: "account",
    authflow: {} as JoinOptions["authflow"],
    logger,
    serverName: undefined,
    disconnectAfterFirstChunk: false,
    skipPing: false,
    raknetBackend: "raknet-node",
    transport: "raknet",
    movementGoal: "safe_walk",
    followPlayerName: undefined,
    followCoordinates: undefined,
    ...overrides
  };
};

const createPlannerOptions = (
  client: FakeClient,
  resolvedOptions: JoinOptions,
  terrainNavigation?: {
    resolveWaypoint: (position: Vector3, target: Vector3 | null) => Vector3 | null;
    cleanup: () => void;
  }
) => ({
  client,
  resolvedOptions,
  playerTrackingState: { resolveFollowTargetPosition: () => ({ x: 10, y: 62, z: 10 }) },
  getPosition: () => ({ x: 0, y: 62, z: 0 }),
  getTick: () => 1n,
  setPosition: () => undefined,
  getLocalRuntimeEntityId: () => "1",
  ...(terrainNavigation ? { terrainNavigation } : {})
});

void test("startSessionMovementLoopWithPlanner configures follow-player and emits fail-fast error on navigation failure", () => {
  const client = new FakeClient();
  const emittedErrors: string[] = [];
  client.on("error", (error) => {
    emittedErrors.push((error as Error).message);
  });
  const logEvents: Array<{ event?: string; nextTaskIds?: string[] }> = [];
  const resolvedOptions = createResolvedOptions({
    logger: {
      info: (payload: { event?: string; nextTaskIds?: string[] }) => logEvents.push(payload)
    } as unknown as Logger,
    movementGoal: MOVEMENT_GOAL_FOLLOW_PLAYER,
    followPlayerName: "targetplayer",
    movementSpeedMode: "fixed",
    initialSpeedBlocksPerSecond: 1.2,
    onMovementSpeedCalibrated: () => undefined
  });
  let capturedResolveWaypoint: ((position: Vector3, target: Vector3 | null) => Vector3 | null) | null = null;
  let movementCleanupCalls = 0;
  const terrainNavigation = {
    resolveWaypoint: () => {
      throw new Error("nav-failed");
    },
    cleanup: () => undefined
  };
  const movementLoop = startSessionMovementLoopWithPlanner(
    createPlannerOptions(client, resolvedOptions, terrainNavigation),
    {
      createSessionMovementLoop: (options) => {
        capturedResolveWaypoint = options.resolveNavigationWaypoint ?? null;
        return { cleanup: () => { movementCleanupCalls += 1; } };
      },
      getAvailableProgressionTasks: () => [{
        id: "collect_logs",
        description: "Collect logs.",
        prerequisiteTaskIds: [],
        requiredResourceTypes: []
      }] as ReadonlyArray<ProgressionTask>
    }
  );
  if (!capturedResolveWaypoint) throw new Error("Expected resolveNavigationWaypoint callback");
  const resolveWaypoint = capturedResolveWaypoint as (position: Vector3, target: Vector3 | null) => Vector3 | null;
  const waypointAfterFailure = resolveWaypoint({ x: 0, y: 62, z: 0 }, { x: 1, y: 62, z: 1 });
  const waypointAfterLock = resolveWaypoint({ x: 0, y: 62, z: 0 }, { x: 1, y: 62, z: 1 });
  assert.equal(waypointAfterFailure, null);
  assert.equal(waypointAfterLock, null);
  assert.deepEqual(emittedErrors, ["nav-failed"]);
  movementLoop.cleanup();
  assert.equal(movementCleanupCalls, 1);
  assert.equal(logEvents.some((event) => event.event === "planner_bootstrap"), true);
});

void test("startSessionMovementLoopWithPlanner owns terrain navigation cleanup in follow-coordinates mode", () => {
  const client = new FakeClient();
  let calibratedCalls = 0;
  const resolvedOptions = createResolvedOptions({
    movementGoal: MOVEMENT_GOAL_FOLLOW_COORDINATES,
    followCoordinates: { x: 5, y: 62, z: 5 },
    movementSpeedMode: "fixed",
    initialSpeedBlocksPerSecond: 1.05,
    onMovementSpeedCalibrated: () => { calibratedCalls += 1; }
  });
  let terrainCleanupCalls = 0;
  let movementCleanupCalls = 0;
  let capturedResolveWaypoint: ((position: Vector3, target: Vector3 | null) => Vector3 | null) | null = null;
  let capturedInitialSpeed: number | undefined;
  let capturedMovementSpeedMode: string | undefined;
  let capturedCalibrationCallback: ((speedBlocksPerSecond: number) => void | Promise<void>) | undefined;
  const movementLoop = startSessionMovementLoopWithPlanner(
    createPlannerOptions(client, resolvedOptions),
    {
      createSessionTerrainNavigation: () => ({
        resolveWaypoint: (_position, target) => target,
        cleanup: () => { terrainCleanupCalls += 1; }
      }),
      createSessionMovementLoop: (options) => {
        capturedResolveWaypoint = options.resolveNavigationWaypoint ?? null;
        capturedInitialSpeed = options.initialSpeedBlocksPerSecond;
        capturedMovementSpeedMode = options.movementSpeedMode;
        capturedCalibrationCallback = options.onMovementSpeedCalibrated;
        return { cleanup: () => { movementCleanupCalls += 1; } };
      }
    }
  );
  if (!capturedResolveWaypoint) throw new Error("Expected resolveNavigationWaypoint callback");
  const resolveWaypoint = capturedResolveWaypoint as (position: Vector3, target: Vector3 | null) => Vector3 | null;
  const waypoint = resolveWaypoint({ x: 0, y: 62, z: 0 }, { x: 1, y: 62, z: 1 });
  assert.deepEqual(waypoint, { x: 1, y: 62, z: 1 });
  assert.equal(capturedInitialSpeed, 1.05);
  assert.equal(capturedMovementSpeedMode, "fixed");
  void capturedCalibrationCallback?.(1.2);
  assert.equal(calibratedCalls, 1);
  movementLoop.cleanup();
  assert.equal(movementCleanupCalls, 1);
  assert.equal(terrainCleanupCalls, 1);
});

void test("startSessionMovementLoopWithPlanner handles safe_walk movement goal", () => {
  const client = new FakeClient();
  const resolvedOptions = createResolvedOptions({
    movementGoal: "safe_walk",
    movementSpeedMode: "fixed",
    initialSpeedBlocksPerSecond: 0.9,
    onMovementSpeedCalibrated: () => undefined
  });
  let capturedGoal: string | null = null;
  let capturedInitialSpeed: number | undefined;
  let capturedMovementSpeedMode: string | undefined;
  let capturedCalibrationCallback: ((speedBlocksPerSecond: number) => void | Promise<void>) | undefined;
  const movementLoop = startSessionMovementLoopWithPlanner(
    createPlannerOptions(client, resolvedOptions),
    {
      createSessionTerrainNavigation: () => ({
        resolveWaypoint: (_position, target) => target,
        cleanup: () => undefined
      }),
      createSessionMovementLoop: (options) => {
        capturedGoal = options.movementGoal;
        capturedInitialSpeed = options.initialSpeedBlocksPerSecond;
        capturedMovementSpeedMode = options.movementSpeedMode;
        capturedCalibrationCallback = options.onMovementSpeedCalibrated;
        return { cleanup: () => undefined };
      }
    }
  );
  movementLoop.cleanup();
  assert.equal(capturedGoal, "safe_walk");
  assert.equal(capturedInitialSpeed, 0.9);
  assert.equal(capturedMovementSpeedMode, "fixed");
  assert.equal(typeof capturedCalibrationCallback, "function");
});
