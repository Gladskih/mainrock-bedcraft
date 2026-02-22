import type { Logger } from "pino";
import {
  DEFAULT_MOVEMENT_SPEED_MODE,
  MOVEMENT_GOAL_FOLLOW_COORDINATES,
  MOVEMENT_GOAL_FOLLOW_PLAYER,
  type MovementGoal,
  type MovementSpeedMode
} from "../constants.js";
import { configureMovementLoop } from "../bot/movementLoop.js";
import type { ClientLike } from "./clientTypes.js";
import type { Vector3 } from "./joinClientHelpers.js";

type SessionMovementLoopOptions = {
  client: ClientLike;
  logger: Logger;
  movementGoal: MovementGoal;
  followPlayerName: string | undefined;
  followCoordinates: Vector3 | undefined;
  getFollowTargetPosition: () => Vector3 | null;
  resolveNavigationWaypoint?: (position: Vector3, target: Vector3 | null) => Vector3 | null;
  getPosition: () => Vector3 | null;
  setPosition: (position: Vector3) => void;
  getTick: () => bigint;
  getLocalRuntimeEntityId?: () => string | null;
  movementSpeedMode?: MovementSpeedMode;
  initialSpeedBlocksPerSecond?: number;
  onMovementSpeedCalibrated?: (speedBlocksPerSecond: number) => void | Promise<void>;
};

export const createSessionMovementLoop = (options: SessionMovementLoopOptions): { cleanup: () => void } => {
  if (options.movementGoal === MOVEMENT_GOAL_FOLLOW_PLAYER) {
    return configureMovementLoop({
      client: options.client,
      logger: options.logger,
      movementGoal: MOVEMENT_GOAL_FOLLOW_PLAYER,
      followPlayerName: options.followPlayerName ?? "unknown",
      getFollowTargetPosition: options.getFollowTargetPosition,
      ...(options.resolveNavigationWaypoint !== undefined
        ? { resolveNavigationWaypoint: options.resolveNavigationWaypoint }
        : {}),
      getPosition: options.getPosition,
      setPosition: options.setPosition,
      getTick: options.getTick,
      movementSpeedMode: options.movementSpeedMode ?? DEFAULT_MOVEMENT_SPEED_MODE,
      ...(options.initialSpeedBlocksPerSecond !== undefined
        ? { initialSpeedBlocksPerSecond: options.initialSpeedBlocksPerSecond }
        : {}),
      ...(options.onMovementSpeedCalibrated !== undefined
        ? { onMovementSpeedCalibrated: options.onMovementSpeedCalibrated }
        : {}),
      ...(options.getLocalRuntimeEntityId !== undefined
        ? { getLocalRuntimeEntityId: options.getLocalRuntimeEntityId }
        : {})
    });
  }
  if (options.movementGoal === MOVEMENT_GOAL_FOLLOW_COORDINATES) {
    if (!options.followCoordinates) throw new Error("Follow-coordinates goal requires target coordinates");
    return configureMovementLoop({
      client: options.client,
      logger: options.logger,
      movementGoal: MOVEMENT_GOAL_FOLLOW_COORDINATES,
      followCoordinates: options.followCoordinates,
      ...(options.resolveNavigationWaypoint !== undefined
        ? { resolveNavigationWaypoint: options.resolveNavigationWaypoint }
        : {}),
      getPosition: options.getPosition,
      setPosition: options.setPosition,
      getTick: options.getTick,
      movementSpeedMode: options.movementSpeedMode ?? DEFAULT_MOVEMENT_SPEED_MODE,
      ...(options.initialSpeedBlocksPerSecond !== undefined
        ? { initialSpeedBlocksPerSecond: options.initialSpeedBlocksPerSecond }
        : {}),
      ...(options.onMovementSpeedCalibrated !== undefined
        ? { onMovementSpeedCalibrated: options.onMovementSpeedCalibrated }
        : {}),
      ...(options.getLocalRuntimeEntityId !== undefined
        ? { getLocalRuntimeEntityId: options.getLocalRuntimeEntityId }
        : {})
    });
  }
  return configureMovementLoop({
      client: options.client,
      logger: options.logger,
      movementGoal: "safe_walk",
      ...(options.resolveNavigationWaypoint !== undefined
        ? { resolveNavigationWaypoint: options.resolveNavigationWaypoint }
        : {}),
      getPosition: options.getPosition,
      setPosition: options.setPosition,
      getTick: options.getTick,
      movementSpeedMode: options.movementSpeedMode ?? DEFAULT_MOVEMENT_SPEED_MODE,
      ...(options.initialSpeedBlocksPerSecond !== undefined
        ? { initialSpeedBlocksPerSecond: options.initialSpeedBlocksPerSecond }
        : {}),
      ...(options.onMovementSpeedCalibrated !== undefined
        ? { onMovementSpeedCalibrated: options.onMovementSpeedCalibrated }
        : {}),
      ...(options.getLocalRuntimeEntityId !== undefined
        ? { getLocalRuntimeEntityId: options.getLocalRuntimeEntityId }
        : {})
    });
};
