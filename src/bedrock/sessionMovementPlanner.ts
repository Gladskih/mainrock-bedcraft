import { getAvailableProgressionTasks } from "../bot/progressionPlan.js";
import { MOVEMENT_GOAL_FOLLOW_COORDINATES, MOVEMENT_GOAL_FOLLOW_PLAYER } from "../constants.js";
import { createSessionMovementLoop } from "./sessionMovementLoop.js";
import type { ClientLike } from "./clientTypes.js";
import type { JoinOptions } from "./joinClient.js";
import type { Vector3 } from "./joinClientHelpers.js";

type StartSessionMovementLoopWithPlannerOptions = {
  client: ClientLike;
  resolvedOptions: JoinOptions;
  playerTrackingState: { resolveFollowTargetPosition: () => Vector3 | null };
  getPosition: () => Vector3 | null;
  getTick: () => bigint;
  setPosition: (position: Vector3) => void;
  getLocalRuntimeEntityId: () => string | null;
};

export const startSessionMovementLoopWithPlanner = (
  options: StartSessionMovementLoopWithPlannerOptions
): { cleanup: () => void } => {
  const movementLoop = options.resolvedOptions.movementGoal === MOVEMENT_GOAL_FOLLOW_PLAYER
    ? createSessionMovementLoop({
      client: options.client,
      logger: options.resolvedOptions.logger,
      movementGoal: MOVEMENT_GOAL_FOLLOW_PLAYER,
      followPlayerName: options.resolvedOptions.followPlayerName,
      followCoordinates: undefined,
      getFollowTargetPosition: () => options.playerTrackingState.resolveFollowTargetPosition(),
      getPosition: options.getPosition,
      setPosition: options.setPosition,
      getTick: options.getTick,
      getLocalRuntimeEntityId: options.getLocalRuntimeEntityId,
      ...(options.resolvedOptions.movementSpeedMode !== undefined
        ? { movementSpeedMode: options.resolvedOptions.movementSpeedMode }
        : {}),
      ...(options.resolvedOptions.initialSpeedBlocksPerSecond !== undefined
        ? { initialSpeedBlocksPerSecond: options.resolvedOptions.initialSpeedBlocksPerSecond }
        : {}),
      ...(options.resolvedOptions.onMovementSpeedCalibrated !== undefined
        ? { onMovementSpeedCalibrated: options.resolvedOptions.onMovementSpeedCalibrated }
        : {})
    })
    : options.resolvedOptions.movementGoal === MOVEMENT_GOAL_FOLLOW_COORDINATES
      ? createSessionMovementLoop({
        client: options.client,
        logger: options.resolvedOptions.logger,
        movementGoal: MOVEMENT_GOAL_FOLLOW_COORDINATES,
        followPlayerName: undefined,
        followCoordinates: options.resolvedOptions.followCoordinates,
        getFollowTargetPosition: () => null,
        getPosition: options.getPosition,
        setPosition: options.setPosition,
        getTick: options.getTick,
        getLocalRuntimeEntityId: options.getLocalRuntimeEntityId,
        ...(options.resolvedOptions.movementSpeedMode !== undefined
          ? { movementSpeedMode: options.resolvedOptions.movementSpeedMode }
          : {}),
        ...(options.resolvedOptions.initialSpeedBlocksPerSecond !== undefined
          ? { initialSpeedBlocksPerSecond: options.resolvedOptions.initialSpeedBlocksPerSecond }
          : {}),
        ...(options.resolvedOptions.onMovementSpeedCalibrated !== undefined
          ? { onMovementSpeedCalibrated: options.resolvedOptions.onMovementSpeedCalibrated }
          : {})
      })
      : createSessionMovementLoop({
        client: options.client,
        logger: options.resolvedOptions.logger,
        movementGoal: options.resolvedOptions.movementGoal,
        followPlayerName: undefined,
        followCoordinates: undefined,
        getFollowTargetPosition: () => null,
        getPosition: options.getPosition,
        setPosition: options.setPosition,
        getTick: options.getTick,
        getLocalRuntimeEntityId: options.getLocalRuntimeEntityId,
        ...(options.resolvedOptions.movementSpeedMode !== undefined
          ? { movementSpeedMode: options.resolvedOptions.movementSpeedMode }
          : {}),
        ...(options.resolvedOptions.initialSpeedBlocksPerSecond !== undefined
          ? { initialSpeedBlocksPerSecond: options.resolvedOptions.initialSpeedBlocksPerSecond }
          : {}),
        ...(options.resolvedOptions.onMovementSpeedCalibrated !== undefined
          ? { onMovementSpeedCalibrated: options.resolvedOptions.onMovementSpeedCalibrated }
          : {})
      });
  const initialTasks = getAvailableProgressionTasks(
    new Set(),
    new Set()
  ).map((task) => task.id);
  options.resolvedOptions.logger.info({ event: "planner_bootstrap", nextTaskIds: initialTasks }, "Initialized progression planner");
  return movementLoop;
};
