import type { Logger } from "pino";
import { MOVEMENT_GOAL_FOLLOW_PLAYER, type MovementGoal } from "../constants.js";
import { configureMovementLoop } from "../bot/movementLoop.js";
import type { ClientLike } from "./clientTypes.js";
import type { Vector3 } from "./joinClientHelpers.js";

type SessionMovementLoopOptions = {
  client: ClientLike;
  logger: Logger;
  movementGoal: MovementGoal;
  followPlayerName: string | undefined;
  getFollowTargetPosition: () => Vector3 | null;
  getPosition: () => Vector3 | null;
  setPosition: (position: Vector3) => void;
  getTick: () => bigint;
};

export const createSessionMovementLoop = (options: SessionMovementLoopOptions): { cleanup: () => void } => {
  return options.movementGoal === MOVEMENT_GOAL_FOLLOW_PLAYER
    ? configureMovementLoop({
      client: options.client,
      logger: options.logger,
      movementGoal: MOVEMENT_GOAL_FOLLOW_PLAYER,
      followPlayerName: options.followPlayerName ?? "unknown",
      getFollowTargetPosition: options.getFollowTargetPosition,
      getPosition: options.getPosition,
      setPosition: options.setPosition,
      getTick: options.getTick
    })
    : configureMovementLoop({
      client: options.client,
      logger: options.logger,
      movementGoal: "safe_walk",
      getPosition: options.getPosition,
      setPosition: options.setPosition,
      getTick: options.getTick
    });
};
