import type { Logger } from "pino";
import {
  DEFAULT_MOVEMENT_AUTOTUNE_CALIBRATION_CORRECTION_STRIKE_LIMIT,
  DEFAULT_MOVEMENT_AUTOTUNE_CALIBRATION_CORRECTION_THRESHOLD_BLOCKS,
  DEFAULT_MOVEMENT_AUTOTUNE_CALIBRATION_INCREASE_INTERVAL_MS,
  DEFAULT_MOVEMENT_AUTOTUNE_CALIBRATION_MAX_SPEED_BLOCKS_PER_SECOND,
  DEFAULT_MOVEMENT_AUTOTUNE_CALIBRATION_STABILITY_WINDOW_MS,
  DEFAULT_FOLLOW_COORDINATES_STOP_DISTANCE_BLOCKS,
  DEFAULT_FOLLOW_PLAYER_STOP_DISTANCE_BLOCKS,
  DEFAULT_MOVEMENT_LOOP_INTERVAL_MS,
  DEFAULT_MOVEMENT_SAFETY_LOG_INTERVAL_MS,
  MOVEMENT_SPEED_MODE_CALIBRATE,
  MOVEMENT_SPEED_MODE_FIXED,
  type MovementSpeedMode
} from "../constants.js";
import type { ClientLike } from "../bedrock/clientTypes.js";
import { readPacketId, readPacketPosition, type Vector3 } from "../bedrock/joinClientHelpers.js";
import { toCameraOrientationFromYaw, toDeltaVector, toFollowMovementVector, toForwardMovementVector, toInputFlags, toLocalMoveVector, toMovementMagnitude, toNextPosition, toYawFromMovementVector } from "./movementMath.js";
import { createMovementObstacleRecoveryState, queueDoorInteractionPacket } from "./movementObstacleRecovery.js";
import { createMovementSafetyState } from "./movementSafety.js";
import { queueMovementPacket, type MovementPacketMode } from "./movementPacketWriter.js";
import { createMovementSpeedAutotune } from "./movementSpeedAutotune.js";
import { createFollowPlayerTargetAcquireState, updateFollowPlayerTargetAcquireState } from "./followPlayerTargetTimeout.js";
import { resolveNavigationStopDistanceBlocks } from "./movementNavigationTarget.js";
type MovementLoopOptions = {
  client: ClientLike;
  logger: Logger;
  getPosition: () => Vector3 | null;
  setPosition: (position: Vector3) => void;
  getTick: () => bigint;
  getLocalRuntimeEntityId?: () => string | null;
  resolveNavigationWaypoint?: (position: Vector3, target: Vector3 | null) => Vector3 | null;
  movementSpeedMode?: MovementSpeedMode;
  initialSpeedBlocksPerSecond?: number;
  onMovementSpeedCalibrated?: (speedBlocksPerSecond: number) => void | Promise<void>;
} & (
  | { movementGoal: "safe_walk" }
  | { movementGoal: "follow_player"; followPlayerName: string; getFollowTargetPosition: () => Vector3 | null }
  | { movementGoal: "follow_coordinates"; followCoordinates: Vector3 }
);
export const configureMovementLoop = (options: MovementLoopOptions): { cleanup: () => void } => {
  let movementStepIndex = 0;
  const movementPacketMode: MovementPacketMode = "player_auth_input";
  let lastSafetyLogAtMs = 0, calibrationLastCorrectionAtMs = Number.NEGATIVE_INFINITY;
  let calibrationCorrectionObserved = false;
  const followPlayerTargetAcquireState = createFollowPlayerTargetAcquireState();
  const movementSpeedMode = options.movementSpeedMode ?? MOVEMENT_SPEED_MODE_FIXED;
  let calibrationPhase: "probing" | "verifying" | "done" = movementSpeedMode === MOVEMENT_SPEED_MODE_CALIBRATE ? "probing" : "done";
  const movementSafetyState = createMovementSafetyState();
  const movementObstacleRecoveryState = createMovementObstacleRecoveryState();
  const movementSpeedAutotune = createMovementSpeedAutotune(
    {
      ...(options.initialSpeedBlocksPerSecond !== undefined
        ? { baseSpeedBlocksPerSecond: options.initialSpeedBlocksPerSecond }
        : {}),
      ...(movementSpeedMode === MOVEMENT_SPEED_MODE_CALIBRATE
        ? {
          maximumSpeedBlocksPerSecond: DEFAULT_MOVEMENT_AUTOTUNE_CALIBRATION_MAX_SPEED_BLOCKS_PER_SECOND,
          correctionThresholdBlocks: DEFAULT_MOVEMENT_AUTOTUNE_CALIBRATION_CORRECTION_THRESHOLD_BLOCKS,
          correctionStrikeLimit: DEFAULT_MOVEMENT_AUTOTUNE_CALIBRATION_CORRECTION_STRIKE_LIMIT,
          increaseIntervalMs: DEFAULT_MOVEMENT_AUTOTUNE_CALIBRATION_INCREASE_INTERVAL_MS
        }
        : {})
    }
  );
  options.logger.info(
    {
      ...(options.movementGoal === "follow_player"
        ? { mode: "follow_player", followPlayerName: options.followPlayerName }
        : options.movementGoal === "follow_coordinates"
          ? { mode: "follow_coordinates", followCoordinates: options.followCoordinates }
          : { mode: "safe_walk" }),
      movementSpeedMode,
      initialSpeedBlocksPerSecond: movementSpeedAutotune.getSpeedBlocksPerSecond()
    },
    "Starting movement loop"
  );
  const onUpdateAttributes = (packet: unknown): void => {
    movementSafetyState.observeAttributes(packet, options.getLocalRuntimeEntityId?.() ?? null, Date.now());
  };
  const applyAuthoritativePosition = (position: Vector3): void => {
    options.setPosition(position);
    movementObstacleRecoveryState.noteAuthoritativeCorrection(Date.now());
    const speedAdjustment = movementSpeedAutotune.observeAuthoritativePosition(position, Date.now());
    if (!speedAdjustment) return;
    if (movementSpeedMode === MOVEMENT_SPEED_MODE_CALIBRATE) {
      calibrationCorrectionObserved = true;
      calibrationLastCorrectionAtMs = Date.now();
      if (calibrationPhase === "probing") {
        calibrationPhase = "verifying";
        options.logger.info(
          {
            event: "movement_speed_calibration_phase",
            phase: "verifying",
            speedBlocksPerSecond: speedAdjustment.nextSpeedBlocksPerSecond
          },
          "Reached speed correction ceiling, switching to verification"
        );
      }
    }
    options.logger.info(
      {
        event: "movement_speed_update",
        reason: speedAdjustment.reason,
        previousSpeedBlocksPerSecond: speedAdjustment.previousSpeedBlocksPerSecond,
        nextSpeedBlocksPerSecond: speedAdjustment.nextSpeedBlocksPerSecond,
        correctionDistanceBlocks: speedAdjustment.correctionDistanceBlocks ?? null
      },
      "Adjusted movement speed"
    );
  };
  const onMovePlayer = (packet: unknown): void => {
    const localRuntimeEntityId = options.getLocalRuntimeEntityId?.() ?? null;
    if (!localRuntimeEntityId) return;
    const runtimeEntityId = readPacketId(packet, ["runtime_id", "runtime_entity_id", "entity_id"]);
    if (!runtimeEntityId || runtimeEntityId !== localRuntimeEntityId) return;
    const position = readPacketPosition(packet, "position");
    if (!position) return;
    applyAuthoritativePosition(position);
  };
  const onCorrectPlayerMovePrediction = (packet: unknown): void => {
    const position = readPacketPosition(packet, "position");
    if (!position) return;
    applyAuthoritativePosition(position);
  };
  options.client.on?.("update_attributes", onUpdateAttributes);
  options.client.on?.("move_player", onMovePlayer);
  options.client.on?.("correct_player_move_prediction", onCorrectPlayerMovePrediction);
  const movementIntervalId = setInterval(() => {
    const nowMs = Date.now();
    const position = options.getPosition();
    if (!position) return;
    const directFollowPlayerTarget = options.movementGoal === "follow_player" ? options.getFollowTargetPosition() : null;
    const directFollowCoordinatesTarget = options.movementGoal === "follow_coordinates" ? options.followCoordinates : null;
    const navigationFollowPlayerTarget = options.movementGoal === "follow_player"
      ? options.resolveNavigationWaypoint
        ? options.resolveNavigationWaypoint(position, directFollowPlayerTarget)
        : directFollowPlayerTarget
      : null;
    const navigationFollowCoordinatesTarget = options.movementGoal === "follow_coordinates"
      ? options.resolveNavigationWaypoint
        ? options.resolveNavigationWaypoint(position, directFollowCoordinatesTarget)
        : directFollowCoordinatesTarget
      : null;
    const followPlayerStopDistanceBlocks = resolveNavigationStopDistanceBlocks(
      navigationFollowPlayerTarget,
      directFollowPlayerTarget,
      DEFAULT_FOLLOW_PLAYER_STOP_DISTANCE_BLOCKS
    );
    const followCoordinatesStopDistanceBlocks = resolveNavigationStopDistanceBlocks(
      navigationFollowCoordinatesTarget,
      directFollowCoordinatesTarget,
      DEFAULT_FOLLOW_COORDINATES_STOP_DISTANCE_BLOCKS
    );
    const followMovementVector = options.movementGoal === "follow_player"
      ? toFollowMovementVector(position, navigationFollowPlayerTarget, followPlayerStopDistanceBlocks)
      : null;
    const followCoordinatesNavigationVector = options.movementGoal === "follow_coordinates"
      ? toFollowMovementVector(
        position, navigationFollowCoordinatesTarget, followCoordinatesStopDistanceBlocks
      )
      : null;
    const followPlayerMovementVector = options.movementGoal === "follow_player" && directFollowPlayerTarget
      ? followMovementVector ?? { x: 0, y: 0 }
      : null;
    const movementVector = options.movementGoal === "follow_player"
      ? followPlayerMovementVector ?? { x: 0, y: 0 }
      : options.movementGoal === "follow_coordinates"
        ? followCoordinatesNavigationVector ?? { x: 0, y: 0 }
        : toForwardMovementVector(movementStepIndex);
    movementStepIndex += 1;
    if (options.movementGoal === "follow_player" && !directFollowPlayerTarget) {
      updateFollowPlayerTargetAcquireState({
        state: followPlayerTargetAcquireState,
        nowMs,
        hasTarget: false,
        onWait: () => undefined,
        onFailure: () => {
          options.client.emit(
            "error",
            new Error(`Follow target '${options.followPlayerName}' was not found in tracked entities`)
          );
        }
      });
      if (followPlayerTargetAcquireState.failureRaised) return;
    } else if (options.movementGoal === "follow_player") {
      updateFollowPlayerTargetAcquireState({
        state: followPlayerTargetAcquireState,
        nowMs,
        hasTarget: true,
        onWait: () => undefined,
        onFailure: () => undefined
      });
    }
    const safetyDecision = movementSafetyState.apply(position, movementVector, nowMs);
    if (safetyDecision.reason && nowMs - lastSafetyLogAtMs >= DEFAULT_MOVEMENT_SAFETY_LOG_INTERVAL_MS) {
      lastSafetyLogAtMs = nowMs;
      options.logger.info({ event: "movement_safety", reason: safetyDecision.reason, position }, "Applying movement safety recovery");
    }
    const obstacleRecoveryDecision = movementObstacleRecoveryState.apply({
      position,
      desiredMovementVector: safetyDecision.movementVector,
      safetyRecoveryActive: safetyDecision.reason !== null,
      nowMs
    });
    if (obstacleRecoveryDecision.reason && nowMs - lastSafetyLogAtMs >= DEFAULT_MOVEMENT_SAFETY_LOG_INTERVAL_MS) {
      lastSafetyLogAtMs = nowMs;
      options.logger.info({ event: "movement_obstacle_recovery", reason: obstacleRecoveryDecision.reason, position }, "Applying obstacle recovery maneuver");
    }
    if (obstacleRecoveryDecision.interaction) {
      queueDoorInteractionPacket(options.client, obstacleRecoveryDecision.interaction);
    }
    const effectiveMovementVector = obstacleRecoveryDecision.movementVector;
    const movementMagnitude = toMovementMagnitude(effectiveMovementVector);
    const jump = safetyDecision.jump || obstacleRecoveryDecision.jump;
    const allowProbeIncrease = movementSpeedMode === MOVEMENT_SPEED_MODE_CALIBRATE && calibrationPhase === "probing";
    const speedAdjustment = allowProbeIncrease
      ? movementSpeedAutotune.probeStableIncrease(
        nowMs,
        movementMagnitude,
        safetyDecision.reason !== null || obstacleRecoveryDecision.reason !== null
      )
      : null;
    if (speedAdjustment) {
      options.logger.info(
        {
          event: "movement_speed_update",
          reason: speedAdjustment.reason,
          previousSpeedBlocksPerSecond: speedAdjustment.previousSpeedBlocksPerSecond,
          nextSpeedBlocksPerSecond: speedAdjustment.nextSpeedBlocksPerSecond,
          correctionDistanceBlocks: null
        },
        "Adjusted movement speed"
      );
    }
    if (movementSpeedMode === MOVEMENT_SPEED_MODE_CALIBRATE && calibrationPhase === "verifying") {
      if (
        calibrationCorrectionObserved
        && nowMs - calibrationLastCorrectionAtMs >= DEFAULT_MOVEMENT_AUTOTUNE_CALIBRATION_STABILITY_WINDOW_MS
      ) {
        calibrationPhase = "done";
        const calibratedSpeedBlocksPerSecond = movementSpeedAutotune.getSpeedBlocksPerSecond();
        options.logger.info(
          {
            event: "movement_speed_calibrated",
            calibratedSpeedBlocksPerSecond
          },
          "Movement speed calibration completed"
        );
        if (options.onMovementSpeedCalibrated) {
          const callbackResult = options.onMovementSpeedCalibrated(calibratedSpeedBlocksPerSecond);
          if (callbackResult && typeof (callbackResult as Promise<void>).then === "function") {
            void (callbackResult as Promise<void>).catch((error) => {
              options.logger.warn(
                {
                  event: "movement_speed_calibration_persist_failed",
                  error: error instanceof Error ? error.message : String(error)
                },
                "Failed to persist calibrated speed"
              );
            });
          }
        }
      }
    }
    const speedBlocksPerSecond = movementSpeedAutotune.getSpeedBlocksPerSecond();
    const localMoveVector = toLocalMoveVector(effectiveMovementVector);
    const inputData = {
      ...toInputFlags(localMoveVector),
      jump,
      handled_teleport: true
    };
    const delta = toDeltaVector(effectiveMovementVector, speedBlocksPerSecond);
    const nextPosition = toNextPosition(position, delta);
    const yaw = toYawFromMovementVector(effectiveMovementVector);
    const cameraOrientation = toCameraOrientationFromYaw(yaw);
    queueMovementPacket({
      client: options.client,
      packetMode: movementPacketMode,
      runtimeEntityId: options.getLocalRuntimeEntityId?.() ?? null,
      getTick: options.getTick,
      nextPosition,
      yaw,
      cameraOrientation,
      localMoveVector,
      inputData,
      delta
    });
    movementSpeedAutotune.notePredictedPosition(nextPosition, movementMagnitude, nowMs);
    options.setPosition(nextPosition);
  }, DEFAULT_MOVEMENT_LOOP_INTERVAL_MS);
  return {
    cleanup: () => {
      options.client.removeListener("update_attributes", onUpdateAttributes);
      options.client.removeListener("move_player", onMovePlayer);
      options.client.removeListener("correct_player_move_prediction", onCorrectPlayerMovePrediction);
      clearInterval(movementIntervalId);
    }
  };
};
