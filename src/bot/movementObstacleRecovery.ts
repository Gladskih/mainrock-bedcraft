import {
  DEFAULT_MOVEMENT_DOOR_INTERACT_COOLDOWN_MS,
  DEFAULT_MOVEMENT_DOOR_INTERACT_DISTANCE_BLOCKS,
  DEFAULT_MOVEMENT_DOOR_INTERACT_HEIGHT_OFFSET_BLOCKS,
  DEFAULT_MOVEMENT_STUCK_CORRECTION_STRIKES,
  DEFAULT_MOVEMENT_STUCK_CORRECTION_WINDOW_MS,
  DEFAULT_MOVEMENT_STUCK_PROGRESS_DISTANCE_BLOCKS,
  DEFAULT_MOVEMENT_STUCK_RECOVERY_DURATION_MS,
  DEFAULT_MOVEMENT_STUCK_RECOVERY_TURN_DEGREES,
  DEFAULT_MOVEMENT_STUCK_TIMEOUT_MS
} from "../constants.js";
import type { ClientLike } from "../bedrock/clientTypes.js";
import type { Vector3 } from "../bedrock/joinClientHelpers.js";
import type { MovementVector } from "./movementPacketWriter.js";

export type DoorInteractionRequest = {
  blockPosition: { x: number; y: number; z: number };
  face: number;
  clickPosition: Vector3;
  playerPosition: Vector3;
};

export type MovementObstacleRecoveryDecision = {
  movementVector: MovementVector;
  jump: boolean;
  reason: string | null;
  interaction: DoorInteractionRequest | null;
};

type MovementObstacleRecoveryConfig = {
  stuckProgressDistanceBlocks: number;
  stuckTimeoutMs: number;
  stuckCorrectionWindowMs: number;
  stuckCorrectionStrikes: number;
  recoveryDurationMs: number;
  recoveryTurnDegrees: number;
  doorInteractCooldownMs: number;
  doorInteractDistanceBlocks: number;
  doorInteractHeightOffsetBlocks: number;
};

const DEFAULT_MOVEMENT_VECTOR: MovementVector = { x: 0, y: 0 };

const toRadians = (value: number): number => value * (Math.PI / 180);

const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));

const normalizeMovementVector = (movementVector: MovementVector): MovementVector => {
  const magnitude = Math.hypot(movementVector.x, movementVector.y);
  if (magnitude <= Number.EPSILON) return DEFAULT_MOVEMENT_VECTOR;
  return { x: movementVector.x / magnitude, y: movementVector.y / magnitude };
};

const rotateMovementVector = (movementVector: MovementVector, angleDegrees: number): MovementVector => {
  if (movementVector.x === 0 && movementVector.y === 0) return DEFAULT_MOVEMENT_VECTOR;
  const angle = toRadians(angleDegrees);
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  return {
    x: movementVector.x * cos - movementVector.y * sin,
    y: movementVector.x * sin + movementVector.y * cos
  };
};

const toHorizontalDistance = (first: Vector3, second: Vector3): number => {
  return Math.hypot(first.x - second.x, first.z - second.z);
};

const toDirectionFace = (x: number, z: number): number => {
  if (Math.abs(x) > Math.abs(z)) return x >= 0 ? 4 : 5;
  return z >= 0 ? 2 : 3;
};

const toDoorInteractionRequest = (
  position: Vector3,
  movementVector: MovementVector,
  config: MovementObstacleRecoveryConfig
): DoorInteractionRequest => {
  const normalizedMovementVector = normalizeMovementVector(movementVector);
  const movementX = normalizedMovementVector.x === 0 && normalizedMovementVector.y === 0
    ? 0
    : normalizedMovementVector.x;
  const movementZ = normalizedMovementVector.x === 0 && normalizedMovementVector.y === 0
    ? 1
    : normalizedMovementVector.y;
  const targetX = position.x + movementX * config.doorInteractDistanceBlocks;
  const targetZ = position.z + movementZ * config.doorInteractDistanceBlocks;
  const blockX = Math.floor(targetX);
  const blockY = Math.floor(position.y + config.doorInteractHeightOffsetBlocks);
  const blockZ = Math.floor(targetZ);
  return {
    blockPosition: { x: blockX, y: blockY, z: blockZ },
    face: toDirectionFace(movementX, movementZ),
    clickPosition: {
      x: clamp(targetX - blockX, 0.05, 0.95),
      y: 0.5,
      z: clamp(targetZ - blockZ, 0.05, 0.95)
    },
    playerPosition: { x: position.x, y: position.y, z: position.z }
  };
};

export const createMovementObstacleRecoveryState = (
  overrides: Partial<MovementObstacleRecoveryConfig> = {}
): {
  apply: (params: {
    position: Vector3;
    desiredMovementVector: MovementVector;
    safetyRecoveryActive: boolean;
    nowMs: number;
  }) => MovementObstacleRecoveryDecision;
  noteAuthoritativeCorrection: (nowMs: number) => void;
} => {
  const config: MovementObstacleRecoveryConfig = {
    stuckProgressDistanceBlocks:
      overrides.stuckProgressDistanceBlocks ?? DEFAULT_MOVEMENT_STUCK_PROGRESS_DISTANCE_BLOCKS,
    stuckTimeoutMs: overrides.stuckTimeoutMs ?? DEFAULT_MOVEMENT_STUCK_TIMEOUT_MS,
    stuckCorrectionWindowMs: overrides.stuckCorrectionWindowMs ?? DEFAULT_MOVEMENT_STUCK_CORRECTION_WINDOW_MS,
    stuckCorrectionStrikes: overrides.stuckCorrectionStrikes ?? DEFAULT_MOVEMENT_STUCK_CORRECTION_STRIKES,
    recoveryDurationMs: overrides.recoveryDurationMs ?? DEFAULT_MOVEMENT_STUCK_RECOVERY_DURATION_MS,
    recoveryTurnDegrees: overrides.recoveryTurnDegrees ?? DEFAULT_MOVEMENT_STUCK_RECOVERY_TURN_DEGREES,
    doorInteractCooldownMs: overrides.doorInteractCooldownMs ?? DEFAULT_MOVEMENT_DOOR_INTERACT_COOLDOWN_MS,
    doorInteractDistanceBlocks: overrides.doorInteractDistanceBlocks ?? DEFAULT_MOVEMENT_DOOR_INTERACT_DISTANCE_BLOCKS,
    doorInteractHeightOffsetBlocks:
      overrides.doorInteractHeightOffsetBlocks ?? DEFAULT_MOVEMENT_DOOR_INTERACT_HEIGHT_OFFSET_BLOCKS
  };
  let progressAnchorPosition: Vector3 = { x: 0, y: 0, z: 0 };
  let progressAnchorInitialized = false;
  let progressAnchorAtMs = 0;
  let recoveryUntilMs = 0;
  let recoveryTurnSign = 1;
  let lastDoorInteractAtMs = Number.NEGATIVE_INFINITY;
  let correctionTimestampsMs: number[] = [];
  const trimCorrectionTimestamps = (nowMs: number): void => {
    correctionTimestampsMs = correctionTimestampsMs.filter(
      (timestampMs) => nowMs - timestampMs <= config.stuckCorrectionWindowMs
    );
  };
  const updateProgressAnchor = (position: Vector3, nowMs: number): void => {
    progressAnchorPosition = { x: position.x, y: position.y, z: position.z };
    progressAnchorInitialized = true;
    progressAnchorAtMs = nowMs;
  };
  const tryDoorInteraction = (
    nowMs: number,
    position: Vector3,
    movementVector: MovementVector
  ): DoorInteractionRequest | null => {
    if (nowMs - lastDoorInteractAtMs < config.doorInteractCooldownMs) return null;
    lastDoorInteractAtMs = nowMs;
    return toDoorInteractionRequest(position, movementVector, config);
  };
  const applyRecovery = (
    nowMs: number,
    position: Vector3,
    desiredMovementVector: MovementVector
  ): MovementObstacleRecoveryDecision => {
    const recoveryMovementVector = rotateMovementVector(
      desiredMovementVector,
      config.recoveryTurnDegrees * recoveryTurnSign
    );
    recoveryUntilMs = nowMs + config.recoveryDurationMs;
    recoveryTurnSign *= -1;
    correctionTimestampsMs = [];
    updateProgressAnchor(position, nowMs);
    return {
      movementVector: recoveryMovementVector,
      jump: true,
      reason: "obstacle_recovery",
      interaction: tryDoorInteraction(nowMs, position, recoveryMovementVector)
    };
  };
  return {
    apply: ({ position, desiredMovementVector, safetyRecoveryActive, nowMs }): MovementObstacleRecoveryDecision => {
      const normalizedDesiredMovementVector = normalizeMovementVector(desiredMovementVector);
      trimCorrectionTimestamps(nowMs);
      if (!progressAnchorInitialized) updateProgressAnchor(position, nowMs);
      if (
        safetyRecoveryActive
        || (normalizedDesiredMovementVector.x === 0 && normalizedDesiredMovementVector.y === 0)
      ) {
        correctionTimestampsMs = [];
        updateProgressAnchor(position, nowMs);
        return { movementVector: normalizedDesiredMovementVector, jump: false, reason: null, interaction: null };
      }
      if (toHorizontalDistance(position, progressAnchorPosition) >= config.stuckProgressDistanceBlocks) {
        updateProgressAnchor(position, nowMs);
      }
      if (nowMs < recoveryUntilMs) {
        const recoveryMovementVector = rotateMovementVector(
          normalizedDesiredMovementVector,
          config.recoveryTurnDegrees * recoveryTurnSign
        );
        return {
          movementVector: recoveryMovementVector,
          jump: true,
          reason: "obstacle_recovery",
          interaction: tryDoorInteraction(nowMs, position, recoveryMovementVector)
        };
      }
      if (nowMs - progressAnchorAtMs < config.stuckTimeoutMs) {
        if (correctionTimestampsMs.length >= config.stuckCorrectionStrikes) {
          return applyRecovery(nowMs, position, normalizedDesiredMovementVector);
        }
        return { movementVector: normalizedDesiredMovementVector, jump: false, reason: null, interaction: null };
      }
      return applyRecovery(nowMs, position, normalizedDesiredMovementVector);
    },
    noteAuthoritativeCorrection: (nowMs: number) => {
      trimCorrectionTimestamps(nowMs);
      correctionTimestampsMs.push(nowMs);
    }
  };
};

export const queueDoorInteractionPacket = (client: ClientLike, interaction: DoorInteractionRequest): void => {
  client.queue?.("inventory_transaction", {
    transaction: {
      legacy: { legacy_request_id: 0 },
      transaction_type: "item_use",
      actions: [],
      transaction_data: {
        action_type: "click_block",
        trigger_type: "player_input",
        block_position: interaction.blockPosition,
        face: interaction.face,
        hotbar_slot: 0,
        held_item: { network_id: 0 },
        player_pos: interaction.playerPosition,
        click_pos: interaction.clickPosition,
        block_runtime_id: 0,
        client_prediction: "success"
      }
    }
  });
};
