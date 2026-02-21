import type { Logger } from "pino";
import { MOVEMENT_GOAL_FOLLOW_COORDINATES, MOVEMENT_GOAL_FOLLOW_PLAYER, type MovementGoal } from "../constants.js";
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
  getPosition: () => Vector3 | null;
  setPosition: (position: Vector3) => void;
  getTick: () => bigint;
  getLocalRuntimeEntityId?: () => string | null;
};

export const createSessionMovementLoop = (options: SessionMovementLoopOptions): { cleanup: () => void } => {
  if (options.movementGoal === MOVEMENT_GOAL_FOLLOW_PLAYER) {
    return configureMovementLoop({
      client: options.client,
      logger: options.logger,
      movementGoal: MOVEMENT_GOAL_FOLLOW_PLAYER,
      followPlayerName: options.followPlayerName ?? "unknown",
      getFollowTargetPosition: options.getFollowTargetPosition,
      getPosition: options.getPosition,
      setPosition: options.setPosition,
      getTick: options.getTick,
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
      getPosition: options.getPosition,
      setPosition: options.setPosition,
      getTick: options.getTick,
      ...(options.getLocalRuntimeEntityId !== undefined
        ? { getLocalRuntimeEntityId: options.getLocalRuntimeEntityId }
        : {})
    });
  }
  return configureMovementLoop({
      client: options.client,
      logger: options.logger,
      movementGoal: "safe_walk",
      getPosition: options.getPosition,
      setPosition: options.setPosition,
      getTick: options.getTick,
      ...(options.getLocalRuntimeEntityId !== undefined
        ? { getLocalRuntimeEntityId: options.getLocalRuntimeEntityId }
        : {})
    });
};
