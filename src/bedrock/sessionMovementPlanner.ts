import { getAvailableProgressionTasks } from "../bot/progressionPlan.js";
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
};

export const startSessionMovementLoopWithPlanner = (
  options: StartSessionMovementLoopWithPlannerOptions
): { cleanup: () => void } => {
  const movementLoop = createSessionMovementLoop({
    client: options.client,
    logger: options.resolvedOptions.logger,
    movementGoal: options.resolvedOptions.movementGoal,
    followPlayerName: options.resolvedOptions.followPlayerName,
    getFollowTargetPosition: () => options.playerTrackingState.resolveFollowTargetPosition(),
    getPosition: options.getPosition,
    setPosition: options.setPosition,
    getTick: options.getTick
  });
  const initialTasks = getAvailableProgressionTasks(
    new Set(),
    new Set()
  ).map((task) => task.id);
  options.resolvedOptions.logger.info({ event: "planner_bootstrap", nextTaskIds: initialTasks }, "Initialized progression planner");
  return movementLoop;
};
