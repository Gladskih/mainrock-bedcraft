import {
  DEFAULT_NAVIGATION_WAYPOINT_REACHED_DISTANCE_BLOCKS
} from "../constants.js";
import type { Vector3 } from "../bedrock/joinClientHelpers.js";

const TARGET_MATCH_EPSILON_BLOCKS = 0.001; // Treat tiny floating-point differences as identical navigation targets.

const isSameTarget = (left: Vector3 | null, right: Vector3 | null): boolean => {
  if (!left || !right) return false;
  return Math.abs(left.x - right.x) <= TARGET_MATCH_EPSILON_BLOCKS
    && Math.abs(left.y - right.y) <= TARGET_MATCH_EPSILON_BLOCKS
    && Math.abs(left.z - right.z) <= TARGET_MATCH_EPSILON_BLOCKS;
};

export const resolveNavigationStopDistanceBlocks = (
  navigationTarget: Vector3 | null,
  directTarget: Vector3 | null,
  directStopDistanceBlocks: number
): number => {
  if (!navigationTarget || isSameTarget(navigationTarget, directTarget)) return directStopDistanceBlocks;
  return DEFAULT_NAVIGATION_WAYPOINT_REACHED_DISTANCE_BLOCKS;
};
