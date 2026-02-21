import type { Logger } from "pino";
import {
  DEFAULT_FOLLOW_COORDINATES_STOP_DISTANCE_BLOCKS,
  DEFAULT_FOLLOW_PLAYER_STOP_DISTANCE_BLOCKS,
  DEFAULT_FOLLOW_PLAYER_WAIT_LOG_INTERVAL_MS,
  DEFAULT_MOVEMENT_LOOP_INTERVAL_MS,
  DEFAULT_MOVEMENT_SAFETY_LOG_INTERVAL_MS,
  DEFAULT_WALK_SPEED_BLOCKS_PER_SECOND
} from "../constants.js";
import type { ClientLike } from "../bedrock/clientTypes.js";
import type { Vector3 } from "../bedrock/joinClientHelpers.js";
import { createMovementSafetyState } from "./movementSafety.js";

type MovementVector = { x: number; y: number };

type MovementLoopOptions = {
  client: ClientLike;
  logger: Logger;
  getPosition: () => Vector3 | null;
  setPosition: (position: Vector3) => void;
  getTick: () => bigint;
  getLocalRuntimeEntityId?: () => string | null;
} & (
  | {
    movementGoal: "safe_walk";
  }
  | {
    movementGoal: "follow_player";
    followPlayerName: string;
    getFollowTargetPosition: () => Vector3 | null;
  }
  | {
    movementGoal: "follow_coordinates";
    followCoordinates: Vector3;
  }
);

const toForwardMovementVector = (stepIndex: number): MovementVector => {
  if (stepIndex % 120 < 60) return { x: 0, y: 1 };
  return { x: 0, y: -1 };
};

const toFollowMovementVector = (
  position: Vector3,
  target: Vector3 | null,
  stopDistanceBlocks: number
): MovementVector | null => {
  if (!target) return null;
  const deltaX = target.x - position.x;
  const deltaZ = target.z - position.z;
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance <= stopDistanceBlocks) return null;
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
  right: movementVector.x > 0,
  jump: false
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
  let lastSafetyLogAtMs = 0;
  let coordinateArrivalLogged = false;
  const movementSafetyState = createMovementSafetyState();
  const movementStartLog = options.movementGoal === "follow_player"
    ? { mode: "follow_player", followPlayerName: options.followPlayerName }
    : options.movementGoal === "follow_coordinates"
      ? { mode: "follow_coordinates", followCoordinates: options.followCoordinates }
      : { mode: "safe_walk" };
  options.logger.info(movementStartLog, "Starting movement loop");
  const onUpdateAttributes = (packet: unknown): void => {
    movementSafetyState.observeAttributes(packet, options.getLocalRuntimeEntityId?.() ?? null, Date.now());
  };
  options.client.on?.("update_attributes", onUpdateAttributes);
  const movementIntervalId = setInterval(() => {
    const position = options.getPosition();
    if (!position) return;
    const followMovementVector = options.movementGoal === "follow_player"
      ? toFollowMovementVector(position, options.getFollowTargetPosition(), DEFAULT_FOLLOW_PLAYER_STOP_DISTANCE_BLOCKS)
      : null;
    const followCoordinatesMovementVector = options.movementGoal === "follow_coordinates"
      ? toFollowMovementVector(position, options.followCoordinates, DEFAULT_FOLLOW_COORDINATES_STOP_DISTANCE_BLOCKS)
      : null;
    const movementVector = options.movementGoal === "follow_player"
      ? followMovementVector ?? toForwardMovementVector(movementStepIndex)
      : options.movementGoal === "follow_coordinates"
        ? followCoordinatesMovementVector ?? { x: 0, y: 0 }
        : toForwardMovementVector(movementStepIndex);
    movementStepIndex += 1;
    if (options.movementGoal === "follow_player" && !followMovementVector) {
      if (Date.now() - lastWaitLogAtMs < DEFAULT_FOLLOW_PLAYER_WAIT_LOG_INTERVAL_MS) return;
      lastWaitLogAtMs = Date.now();
      options.logger.info({ mode: "follow_player", followPlayerName: options.followPlayerName }, "Target player is unknown, continuing search patrol");
    }
    if (options.movementGoal === "follow_coordinates" && !followCoordinatesMovementVector && !coordinateArrivalLogged) {
      coordinateArrivalLogged = true;
      options.logger.info(
        { mode: "follow_coordinates", followCoordinates: options.followCoordinates },
        "Reached target coordinates"
      );
    }
    if (options.movementGoal === "follow_coordinates" && followCoordinatesMovementVector) coordinateArrivalLogged = false;
    const safetyDecision = movementSafetyState.apply(position, movementVector, Date.now());
    if (safetyDecision.reason && Date.now() - lastSafetyLogAtMs >= DEFAULT_MOVEMENT_SAFETY_LOG_INTERVAL_MS) {
      lastSafetyLogAtMs = Date.now();
      options.logger.info({ event: "movement_safety", reason: safetyDecision.reason, position }, "Applying movement safety recovery");
    }
    const inputData = { ...toInputFlags(safetyDecision.movementVector), jump: safetyDecision.jump };
    const delta = toDeltaVector(safetyDecision.movementVector);
    const nextPosition = toNextPosition(position, delta);
    const yaw = toYawFromMovementVector(safetyDecision.movementVector);
    options.client.queue?.("player_auth_input", {
      pitch: 0,
      yaw,
      position: nextPosition,
      move_vector: safetyDecision.movementVector,
      head_yaw: yaw,
      input_data: inputData,
      input_mode: "mouse",
      play_mode: "normal",
      interaction_model: "crosshair",
      interact_rotation: { x: 0, y: 0 },
      tick: options.getTick(),
      delta,
      analogue_move_vector: safetyDecision.movementVector,
      camera_orientation: { x: 0, y: 0, z: 1 },
      raw_move_vector: safetyDecision.movementVector
    });
    options.setPosition(nextPosition);
  }, DEFAULT_MOVEMENT_LOOP_INTERVAL_MS);
  return {
    cleanup: () => {
      options.client.removeListener("update_attributes", onUpdateAttributes);
      clearInterval(movementIntervalId);
    }
  };
};
