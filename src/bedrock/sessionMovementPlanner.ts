import { getAvailableProgressionTasks } from "../bot/progressionPlan.js";
import { MOVEMENT_GOAL_FOLLOW_COORDINATES, MOVEMENT_GOAL_FOLLOW_PLAYER } from "../constants.js";
import { createSessionMovementLoop } from "./sessionMovementLoop.js";
import type { ClientLike } from "./clientTypes.js";
import type { JoinOptions } from "./joinClient.js";
import { toError, type Vector3 } from "./joinClientHelpers.js";
import { createSessionTerrainNavigation, type SessionTerrainNavigation } from "./sessionTerrainNavigation.js";

type StartSessionMovementLoopWithPlannerOptions = {
  client: ClientLike;
  resolvedOptions: JoinOptions;
  playerTrackingState: { resolveFollowTargetPosition: () => Vector3 | null };
  getPosition: () => Vector3 | null;
  getTick: () => bigint;
  setPosition: (position: Vector3) => void;
  getLocalRuntimeEntityId: () => string | null;
  terrainNavigation?: SessionTerrainNavigation;
};
type SessionMovementPlannerDependencies = {
  createSessionMovementLoop?: typeof createSessionMovementLoop;
  createSessionTerrainNavigation?: typeof createSessionTerrainNavigation;
  getAvailableProgressionTasks?: typeof getAvailableProgressionTasks;
};

export const startSessionMovementLoopWithPlanner = (
  options: StartSessionMovementLoopWithPlannerOptions,
  dependencies: SessionMovementPlannerDependencies = {}
): { cleanup: () => void } => {
  const createMovementLoop = dependencies.createSessionMovementLoop ?? createSessionMovementLoop;
  const createTerrainNavigation = dependencies.createSessionTerrainNavigation ?? createSessionTerrainNavigation;
  const getProgressionTasks = dependencies.getAvailableProgressionTasks ?? getAvailableProgressionTasks;
  const ownsTerrainNavigation = options.terrainNavigation === undefined;
  const terrainNavigation = options.terrainNavigation
    ?? createTerrainNavigation(options.client, options.resolvedOptions.logger);
  let navigationFailed = false;
  const resolveNavigationWaypoint = (position: Vector3, target: Vector3 | null): Vector3 | null => {
    if (navigationFailed) return null;
    try {
      return terrainNavigation.resolveWaypoint(position, target);
    } catch (error) {
      navigationFailed = true;
      options.client.emit("error", toError(error));
      return null;
    }
  };
  const movementLoop = options.resolvedOptions.movementGoal === MOVEMENT_GOAL_FOLLOW_PLAYER
    ? createMovementLoop({
      client: options.client,
      logger: options.resolvedOptions.logger,
      movementGoal: MOVEMENT_GOAL_FOLLOW_PLAYER,
      followPlayerName: options.resolvedOptions.followPlayerName,
      followCoordinates: undefined,
      getFollowTargetPosition: () => options.playerTrackingState.resolveFollowTargetPosition(),
      resolveNavigationWaypoint,
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
      ? createMovementLoop({
        client: options.client,
        logger: options.resolvedOptions.logger,
        movementGoal: MOVEMENT_GOAL_FOLLOW_COORDINATES,
        followPlayerName: undefined,
        followCoordinates: options.resolvedOptions.followCoordinates,
        getFollowTargetPosition: () => null,
        resolveNavigationWaypoint,
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
      : createMovementLoop({
        client: options.client,
        logger: options.resolvedOptions.logger,
        movementGoal: options.resolvedOptions.movementGoal,
        followPlayerName: undefined,
        followCoordinates: undefined,
        getFollowTargetPosition: () => null,
        resolveNavigationWaypoint,
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
  const initialTasks = getProgressionTasks(
    new Set(),
    new Set()
  ).map((task) => task.id);
  options.resolvedOptions.logger.info({ event: "planner_bootstrap", nextTaskIds: initialTasks }, "Initialized progression planner");
  return {
    cleanup: () => {
      movementLoop.cleanup();
      if (ownsTerrainNavigation) terrainNavigation.cleanup();
    }
  };
};
