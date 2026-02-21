import type { Logger } from "pino";
import {
  DEFAULT_FOLLOW_PLAYER_STOP_DISTANCE_BLOCKS,
  DEFAULT_FOLLOW_PLAYER_WAIT_LOG_INTERVAL_MS,
  DEFAULT_MOVEMENT_LOOP_INTERVAL_MS,
  DEFAULT_WALK_SPEED_BLOCKS_PER_SECOND
} from "../constants.js";
import type { ClientLike } from "../bedrock/clientTypes.js";
import type { Vector3 } from "../bedrock/joinClientHelpers.js";

type MovementVector = { x: number; y: number };

type MovementLoopOptions = {
  client: ClientLike;
  logger: Logger;
  getPosition: () => Vector3 | null;
  setPosition: (position: Vector3) => void;
  getTick: () => bigint;
} & (
  | {
    movementGoal: "safe_walk";
  }
  | {
    movementGoal: "follow_player";
    followPlayerName: string;
    getFollowTargetPosition: () => Vector3 | null;
  }
);

const toForwardMovementVector = (stepIndex: number): MovementVector => {
  if (stepIndex % 120 < 60) return { x: 0, y: 1 };
  return { x: 0, y: -1 };
};

const toFollowMovementVector = (position: Vector3, target: Vector3 | null): MovementVector | null => {
  if (!target) return null;
  const deltaX = target.x - position.x;
  const deltaZ = target.z - position.z;
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance <= DEFAULT_FOLLOW_PLAYER_STOP_DISTANCE_BLOCKS) return null;
  return { x: deltaX / distance, y: deltaZ / distance };
};

const toYawFromMovementVector = (movementVector: MovementVector): number => {
  if (movementVector.x === 0 && movementVector.y === 0) return 0;
  return Math.atan2(movementVector.x, movementVector.y) * (180 / Math.PI);
};

const toInputFlags = (movementVector: MovementVector): Record<string, boolean> => ({
  up: movementVector.y > 0,
  down: movementVector.y < 0,
  left: movementVector.x < 0,
  right: movementVector.x > 0
});

const toDeltaDistance = (): number => DEFAULT_WALK_SPEED_BLOCKS_PER_SECOND * (DEFAULT_MOVEMENT_LOOP_INTERVAL_MS / 1000);

const toDeltaVector = (movementVector: MovementVector): Vector3 => ({
  x: movementVector.x * toDeltaDistance(),
  y: 0,
  z: movementVector.y * toDeltaDistance()
});

const toNextPosition = (position: Vector3, delta: Vector3): Vector3 => ({
  x: position.x + delta.x,
  y: position.y,
  z: position.z + delta.z
});

export const configureMovementLoop = (options: MovementLoopOptions): { cleanup: () => void } => {
  let movementStepIndex = 0;
  let lastWaitLogAtMs = 0;
  options.logger.info(options.movementGoal === "follow_player" ? { mode: "follow_player", followPlayerName: options.followPlayerName } : { mode: "safe_walk" }, "Starting movement loop");
  const movementIntervalId = setInterval(() => {
    const position = options.getPosition();
    if (!position) return;
    const followMovementVector = options.movementGoal === "follow_player"
      ? toFollowMovementVector(position, options.getFollowTargetPosition())
      : null;
    const movementVector = followMovementVector ?? toForwardMovementVector(movementStepIndex);
    movementStepIndex += 1;
    if (options.movementGoal === "follow_player" && !followMovementVector) {
      if (Date.now() - lastWaitLogAtMs < DEFAULT_FOLLOW_PLAYER_WAIT_LOG_INTERVAL_MS) return;
      lastWaitLogAtMs = Date.now();
      options.logger.info({ mode: "follow_player", followPlayerName: options.followPlayerName }, "Target player is unknown, continuing search patrol");
    }
    const delta = toDeltaVector(movementVector);
    const nextPosition = toNextPosition(position, delta);
    const yaw = toYawFromMovementVector(movementVector);
    const inputData = toInputFlags(movementVector);
    options.client.queue?.("player_auth_input", {
      pitch: 0,
      yaw,
      position: nextPosition,
      move_vector: movementVector,
      head_yaw: yaw,
      input_data: inputData,
      input_mode: "mouse",
      play_mode: "normal",
      interaction_model: "crosshair",
      interact_rotation: { x: 0, y: 0 },
      tick: options.getTick(),
      delta,
      analogue_move_vector: movementVector,
      camera_orientation: { x: 0, y: 0, z: 1 },
      raw_move_vector: movementVector
    });
    options.setPosition(nextPosition);
  }, DEFAULT_MOVEMENT_LOOP_INTERVAL_MS);
  return {
    cleanup: () => {
      clearInterval(movementIntervalId);
    }
  };
};
