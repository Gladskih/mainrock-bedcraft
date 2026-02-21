import { MOVEMENT_GOAL_FOLLOW_COORDINATES, type MovementGoal } from "../constants.js";
import type { Vector3 } from "./joinClientHelpers.js";

type RuntimeHeartbeatLogFieldsOptions = {
  chunkPackets: number;
  uniqueChunks: number;
  dimension: string | number | null;
  position: Vector3 | null;
  simulatedPosition: Vector3 | null;
  movementGoal: MovementGoal;
  followCoordinates: Vector3 | undefined;
};

const calculateFollowCoordinatesDistance = (
  position: Vector3 | null,
  targetCoordinates: Vector3 | undefined
): number | null => {
  if (!position || !targetCoordinates) return null;
  return Math.hypot(targetCoordinates.x - position.x, targetCoordinates.z - position.z);
};

export const toRuntimeHeartbeatLogFields = (options: RuntimeHeartbeatLogFieldsOptions): Record<string, unknown> => {
  const followCoordinatesDistanceBlocks = options.movementGoal === MOVEMENT_GOAL_FOLLOW_COORDINATES
    ? calculateFollowCoordinatesDistance(options.simulatedPosition, options.followCoordinates)
    : null;
  return {
    event: "runtime_heartbeat",
    chunkPackets: options.chunkPackets,
    uniqueChunks: options.uniqueChunks,
    dimension: options.dimension,
    position: options.position,
    simulatedPosition: options.simulatedPosition,
    ...(followCoordinatesDistanceBlocks !== null ? { followCoordinatesDistanceBlocks } : {})
  };
};
