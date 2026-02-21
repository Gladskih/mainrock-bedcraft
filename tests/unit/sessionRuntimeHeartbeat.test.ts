import assert from "node:assert/strict";
import { test } from "node:test";
import { MOVEMENT_GOAL_FOLLOW_COORDINATES, MOVEMENT_GOAL_SAFE_WALK } from "../../src/constants.js";
import { toRuntimeHeartbeatLogFields } from "../../src/bedrock/sessionRuntimeHeartbeat.js";

void test("toRuntimeHeartbeatLogFields includes distance for follow-coordinates mode", () => {
  const logFields = toRuntimeHeartbeatLogFields({
    chunkPackets: 10,
    uniqueChunks: 9,
    dimension: "overworld",
    position: { x: 0, y: 70, z: 0 },
    simulatedPosition: { x: 1, y: 70, z: 1 },
    movementGoal: MOVEMENT_GOAL_FOLLOW_COORDINATES,
    followCoordinates: { x: 4, y: 70, z: 5 }
  });
  assert.equal(typeof logFields["followCoordinatesDistanceBlocks"], "number");
});

void test("toRuntimeHeartbeatLogFields omits distance for non-follow goal", () => {
  const logFields = toRuntimeHeartbeatLogFields({
    chunkPackets: 10,
    uniqueChunks: 9,
    dimension: "overworld",
    position: { x: 0, y: 70, z: 0 },
    simulatedPosition: { x: 1, y: 70, z: 1 },
    movementGoal: MOVEMENT_GOAL_SAFE_WALK,
    followCoordinates: { x: 4, y: 70, z: 5 }
  });
  assert.equal("followCoordinatesDistanceBlocks" in logFields, false);
});
