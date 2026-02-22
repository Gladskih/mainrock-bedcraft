import {
  DEFAULT_MOVEMENT_AUTOTUNE_BACKOFF_RATIO,
  DEFAULT_MOVEMENT_AUTOTUNE_CORRECTION_STRIKE_LIMIT,
  DEFAULT_MOVEMENT_AUTOTUNE_CORRECTION_THRESHOLD_BLOCKS,
  DEFAULT_MOVEMENT_AUTOTUNE_CORRECTION_WINDOW_MS,
  DEFAULT_MOVEMENT_AUTOTUNE_INCREASE_INTERVAL_MS,
  DEFAULT_MOVEMENT_AUTOTUNE_INCREASE_QUIET_WINDOW_MS,
  DEFAULT_MOVEMENT_AUTOTUNE_INCREASE_STEP_BLOCKS_PER_SECOND,
  DEFAULT_MOVEMENT_AUTOTUNE_MAX_SPEED_BLOCKS_PER_SECOND,
  DEFAULT_MOVEMENT_AUTOTUNE_MIN_SPEED_BLOCKS_PER_SECOND,
  DEFAULT_MOVEMENT_AUTOTUNE_PREDICTION_MAX_AGE_MS,
  DEFAULT_WALK_SPEED_BLOCKS_PER_SECOND
} from "../constants.js";
import type { Vector3 } from "../bedrock/joinClientHelpers.js";

export type MovementSpeedAdjustmentReason = "stability_probe" | "server_correction_backoff";

export type MovementSpeedAdjustment = {
  reason: MovementSpeedAdjustmentReason;
  previousSpeedBlocksPerSecond: number;
  nextSpeedBlocksPerSecond: number;
  correctionDistanceBlocks?: number;
};

type MovementSpeedAutotuneOptions = {
  baseSpeedBlocksPerSecond: number;
  minimumSpeedBlocksPerSecond: number;
  maximumSpeedBlocksPerSecond: number;
  increaseStepBlocksPerSecond: number;
  increaseIntervalMs: number;
  increaseQuietWindowMs: number;
  correctionThresholdBlocks: number;
  correctionWindowMs: number;
  correctionStrikeLimit: number;
  correctionBackoffRatio: number;
  predictionMaxAgeMs: number;
};

type PredictionSnapshot = {
  position: Vector3;
  timestampMs: number;
};

const roundSpeed = (value: number): number => Math.round(value * 1000) / 1000;

const toHorizontalDistance = (first: Vector3, second: Vector3): number => {
  return Math.hypot(first.x - second.x, first.z - second.z);
};

const filterRecentCorrectionTimestamps = (
  correctionTimestampsMs: number[],
  nowMs: number,
  correctionWindowMs: number
): number[] => {
  return correctionTimestampsMs.filter((timestampMs) => nowMs - timestampMs <= correctionWindowMs);
};

export const createMovementSpeedAutotune = (
  overrides: Partial<MovementSpeedAutotuneOptions> = {}
): {
  getSpeedBlocksPerSecond: () => number;
  isAtMaximumSpeed: () => boolean;
  notePredictedPosition: (position: Vector3, movementMagnitude: number, nowMs: number) => void;
  observeAuthoritativePosition: (position: Vector3, nowMs: number) => MovementSpeedAdjustment | null;
  probeStableIncrease: (
    nowMs: number,
    movementMagnitude: number,
    safetyRecoveryActive: boolean
  ) => MovementSpeedAdjustment | null;
} => {
  const options: MovementSpeedAutotuneOptions = {
    baseSpeedBlocksPerSecond: overrides.baseSpeedBlocksPerSecond ?? DEFAULT_WALK_SPEED_BLOCKS_PER_SECOND,
    minimumSpeedBlocksPerSecond:
      overrides.minimumSpeedBlocksPerSecond ?? DEFAULT_MOVEMENT_AUTOTUNE_MIN_SPEED_BLOCKS_PER_SECOND,
    maximumSpeedBlocksPerSecond:
      overrides.maximumSpeedBlocksPerSecond ?? DEFAULT_MOVEMENT_AUTOTUNE_MAX_SPEED_BLOCKS_PER_SECOND,
    increaseStepBlocksPerSecond:
      overrides.increaseStepBlocksPerSecond ?? DEFAULT_MOVEMENT_AUTOTUNE_INCREASE_STEP_BLOCKS_PER_SECOND,
    increaseIntervalMs: overrides.increaseIntervalMs ?? DEFAULT_MOVEMENT_AUTOTUNE_INCREASE_INTERVAL_MS,
    increaseQuietWindowMs:
      overrides.increaseQuietWindowMs ?? DEFAULT_MOVEMENT_AUTOTUNE_INCREASE_QUIET_WINDOW_MS,
    correctionThresholdBlocks:
      overrides.correctionThresholdBlocks ?? DEFAULT_MOVEMENT_AUTOTUNE_CORRECTION_THRESHOLD_BLOCKS,
    correctionWindowMs: overrides.correctionWindowMs ?? DEFAULT_MOVEMENT_AUTOTUNE_CORRECTION_WINDOW_MS,
    correctionStrikeLimit:
      overrides.correctionStrikeLimit ?? DEFAULT_MOVEMENT_AUTOTUNE_CORRECTION_STRIKE_LIMIT,
    correctionBackoffRatio: overrides.correctionBackoffRatio ?? DEFAULT_MOVEMENT_AUTOTUNE_BACKOFF_RATIO,
    predictionMaxAgeMs: overrides.predictionMaxAgeMs ?? DEFAULT_MOVEMENT_AUTOTUNE_PREDICTION_MAX_AGE_MS
  };
  let currentSpeedBlocksPerSecond = roundSpeed(
    Math.min(
      options.maximumSpeedBlocksPerSecond,
      Math.max(options.minimumSpeedBlocksPerSecond, options.baseSpeedBlocksPerSecond)
    )
  );
  let lastPrediction: PredictionSnapshot | null = null;
  let lastMovementAtMs = 0;
  let lastIncreaseAtMs = 0;
  let lastCorrectionAtMs = Number.NEGATIVE_INFINITY;
  let correctionTimestampsMs: number[] = [];
  const getSpeedBlocksPerSecond = (): number => currentSpeedBlocksPerSecond;
  const isAtMaximumSpeed = (): boolean => currentSpeedBlocksPerSecond >= options.maximumSpeedBlocksPerSecond;
  const notePredictedPosition = (position: Vector3, movementMagnitude: number, nowMs: number): void => {
    if (movementMagnitude > 0) lastMovementAtMs = nowMs;
    lastPrediction = { position, timestampMs: nowMs };
  };
  const observeAuthoritativePosition = (position: Vector3, nowMs: number): MovementSpeedAdjustment | null => {
    if (!lastPrediction) return null;
    if (nowMs - lastPrediction.timestampMs > options.predictionMaxAgeMs) return null;
    const correctionDistanceBlocks = toHorizontalDistance(position, lastPrediction.position);
    if (correctionDistanceBlocks < options.correctionThresholdBlocks) return null;
    lastCorrectionAtMs = nowMs;
    correctionTimestampsMs = filterRecentCorrectionTimestamps(
      correctionTimestampsMs,
      nowMs,
      options.correctionWindowMs
    );
    correctionTimestampsMs.push(nowMs);
    if (correctionTimestampsMs.length < options.correctionStrikeLimit) return null;
    correctionTimestampsMs = [];
    const previousSpeedBlocksPerSecond = currentSpeedBlocksPerSecond;
    const nextSpeedBlocksPerSecond = roundSpeed(
      Math.max(options.minimumSpeedBlocksPerSecond, previousSpeedBlocksPerSecond * options.correctionBackoffRatio)
    );
    if (nextSpeedBlocksPerSecond >= previousSpeedBlocksPerSecond) return null;
    currentSpeedBlocksPerSecond = nextSpeedBlocksPerSecond;
    return {
      reason: "server_correction_backoff",
      previousSpeedBlocksPerSecond,
      nextSpeedBlocksPerSecond,
      correctionDistanceBlocks: roundSpeed(correctionDistanceBlocks)
    };
  };
  const probeStableIncrease = (
    nowMs: number,
    movementMagnitude: number,
    safetyRecoveryActive: boolean
  ): MovementSpeedAdjustment | null => {
    if (movementMagnitude <= 0) return null;
    if (safetyRecoveryActive) return null;
    if (nowMs - lastMovementAtMs > options.increaseIntervalMs * 2) return null;
    if (nowMs - lastIncreaseAtMs < options.increaseIntervalMs) return null;
    if (nowMs - lastCorrectionAtMs < options.increaseQuietWindowMs) return null;
    if (currentSpeedBlocksPerSecond >= options.maximumSpeedBlocksPerSecond) return null;
    const previousSpeedBlocksPerSecond = currentSpeedBlocksPerSecond;
    const nextSpeedBlocksPerSecond = roundSpeed(
      Math.min(options.maximumSpeedBlocksPerSecond, currentSpeedBlocksPerSecond + options.increaseStepBlocksPerSecond)
    );
    if (nextSpeedBlocksPerSecond <= previousSpeedBlocksPerSecond) return null;
    currentSpeedBlocksPerSecond = nextSpeedBlocksPerSecond;
    lastIncreaseAtMs = nowMs;
    return {
      reason: "stability_probe",
      previousSpeedBlocksPerSecond,
      nextSpeedBlocksPerSecond
    };
  };
  return {
    getSpeedBlocksPerSecond,
    isAtMaximumSpeed,
    notePredictedPosition,
    observeAuthoritativePosition,
    probeStableIncrease
  };
};
