import {
  DEFAULT_MOVEMENT_SAFETY_AIR_RECOVERY_MS,
  DEFAULT_MOVEMENT_SAFETY_DESCENT_STEP_BLOCKS,
  DEFAULT_MOVEMENT_SAFETY_DESCENT_TICKS,
  DEFAULT_MOVEMENT_SAFETY_DROP_TRIGGER_BLOCKS,
  DEFAULT_MOVEMENT_SAFETY_HEALTH_LOSS_TRIGGER,
  DEFAULT_MOVEMENT_SAFETY_LOW_AIR_THRESHOLD,
  DEFAULT_MOVEMENT_SAFETY_PANIC_RECOVERY_MS,
  DEFAULT_MOVEMENT_SAFETY_PANIC_STRIKE_LIMIT,
  DEFAULT_MOVEMENT_SAFETY_PANIC_STRIKE_WINDOW_MS,
  DEFAULT_MOVEMENT_SAFETY_TERRAIN_RECOVERY_MS
} from "../constants.js";
import { readPacketId, type Vector3 } from "../bedrock/joinClientHelpers.js";

export type MovementVector = { x: number; y: number };

type MovementSafetyDecision = {
  movementVector: MovementVector;
  jump: boolean;
  reason: string | null;
};

type MovementSafetyState = {
  apply: (position: Vector3, desiredMovementVector: MovementVector, nowMs: number) => MovementSafetyDecision;
  observeAttributes: (packet: unknown, localRuntimeEntityId: string | null, nowMs: number) => void;
};

type MovementSafetyConfig = {
  dropTriggerBlocks: number;
  descentStepBlocks: number;
  descentTicks: number;
  terrainRecoveryMs: number;
  lowAirThreshold: number;
  healthLossTrigger: number;
  airRecoveryMs: number;
  panicStrikeWindowMs: number;
  panicStrikeLimit: number;
  panicRecoveryMs: number;
};

const DEFAULT_MOVEMENT_VECTOR: MovementVector = { x: 0, y: 0 };
const AIR_ATTRIBUTE_NAME = "minecraft:air";
const HEALTH_ATTRIBUTE_NAME = "minecraft:health";

const normalizeMovementVector = (movementVector: MovementVector): MovementVector => {
  if (movementVector.x === 0 && movementVector.y === 0) return DEFAULT_MOVEMENT_VECTOR;
  return { x: movementVector.x, y: movementVector.y };
};

const toReverseMovementVector = (movementVector: MovementVector): MovementVector => {
  if (movementVector.x === 0 && movementVector.y === 0) return DEFAULT_MOVEMENT_VECTOR;
  return {
    x: movementVector.x === 0 ? 0 : -movementVector.x,
    y: movementVector.y === 0 ? 0 : -movementVector.y
  };
};

type AttributeState = {
  health: number | null;
};

type AttributeEntry = {
  name: string;
  current: number;
};

const readAttributeEntries = (packet: unknown): AttributeEntry[] => {
  if (!packet || typeof packet !== "object" || !("attributes" in packet)) return [];
  const attributes = (packet as { attributes?: unknown }).attributes;
  if (!Array.isArray(attributes)) return [];
  return attributes.flatMap((attribute): AttributeEntry[] => {
    if (!attribute || typeof attribute !== "object") return [];
    const attributeName = "name" in attribute ? (attribute as { name?: unknown }).name : undefined;
    if (typeof attributeName !== "string") return [];
    const rawCurrentValue = "current" in attribute
      ? (attribute as { current?: unknown }).current
      : "value" in attribute
        ? (attribute as { value?: unknown }).value
        : "current_value" in attribute
          ? (attribute as { current_value?: unknown }).current_value
          : undefined;
    if (typeof rawCurrentValue !== "number" || Number.isNaN(rawCurrentValue)) return [];
    return [{ name: attributeName, current: rawCurrentValue }];
  });
};

const isLocalAttributePacket = (packet: unknown, localRuntimeEntityId: string | null): boolean => {
  if (!localRuntimeEntityId) return true;
  const runtimeEntityId = readPacketId(packet, ["runtime_id", "runtime_entity_id", "entity_id"]);
  if (!runtimeEntityId) return true;
  return runtimeEntityId === localRuntimeEntityId;
};

export const createMovementSafetyState = (overrides: Partial<MovementSafetyConfig> = {}): MovementSafetyState => {
  const config: MovementSafetyConfig = {
    dropTriggerBlocks: overrides.dropTriggerBlocks ?? DEFAULT_MOVEMENT_SAFETY_DROP_TRIGGER_BLOCKS,
    descentStepBlocks: overrides.descentStepBlocks ?? DEFAULT_MOVEMENT_SAFETY_DESCENT_STEP_BLOCKS,
    descentTicks: overrides.descentTicks ?? DEFAULT_MOVEMENT_SAFETY_DESCENT_TICKS,
    terrainRecoveryMs: overrides.terrainRecoveryMs ?? DEFAULT_MOVEMENT_SAFETY_TERRAIN_RECOVERY_MS,
    lowAirThreshold: overrides.lowAirThreshold ?? DEFAULT_MOVEMENT_SAFETY_LOW_AIR_THRESHOLD,
    healthLossTrigger: overrides.healthLossTrigger ?? DEFAULT_MOVEMENT_SAFETY_HEALTH_LOSS_TRIGGER,
    airRecoveryMs: overrides.airRecoveryMs ?? DEFAULT_MOVEMENT_SAFETY_AIR_RECOVERY_MS,
    panicStrikeWindowMs: overrides.panicStrikeWindowMs ?? DEFAULT_MOVEMENT_SAFETY_PANIC_STRIKE_WINDOW_MS,
    panicStrikeLimit: overrides.panicStrikeLimit ?? DEFAULT_MOVEMENT_SAFETY_PANIC_STRIKE_LIMIT,
    panicRecoveryMs: overrides.panicRecoveryMs ?? DEFAULT_MOVEMENT_SAFETY_PANIC_RECOVERY_MS
  };
  let lastObservedPosition: Vector3 | null = null;
  let lastAppliedMovementVector: MovementVector = DEFAULT_MOVEMENT_VECTOR;
  let descentTicks = 0;
  let terrainRecoveryUntilMs = 0;
  let terrainRecoveryVector: MovementVector = DEFAULT_MOVEMENT_VECTOR;
  let attributeRecoveryUntilMs = 0;
  let panicRecoveryUntilMs = 0;
  const dangerStrikeTimestampsMs: number[] = [];
  const attributeState: AttributeState = { health: null };
  const isZeroMovementVector = (movementVector: MovementVector): boolean => {
    return movementVector.x === 0 && movementVector.y === 0;
  };
  const trimOldDangerStrikes = (nowMs: number): void => {
    const oldestAllowedTimestamp = nowMs - config.panicStrikeWindowMs;
    while (dangerStrikeTimestampsMs.length > 0 && dangerStrikeTimestampsMs[0]! < oldestAllowedTimestamp) {
      dangerStrikeTimestampsMs.shift();
    }
  };
  const registerDangerStrike = (nowMs: number): void => {
    trimOldDangerStrikes(nowMs);
    dangerStrikeTimestampsMs.push(nowMs);
    if (dangerStrikeTimestampsMs.length < config.panicStrikeLimit) return;
    panicRecoveryUntilMs = Math.max(panicRecoveryUntilMs, nowMs + config.panicRecoveryMs);
  };
  const startTerrainRecovery = (nowMs: number, preferredReverseBaseVector: MovementVector): void => {
    terrainRecoveryUntilMs = nowMs + config.terrainRecoveryMs;
    terrainRecoveryVector = toReverseMovementVector(
      isZeroMovementVector(lastAppliedMovementVector) ? preferredReverseBaseVector : lastAppliedMovementVector
    );
    descentTicks = 0;
    registerDangerStrike(nowMs);
  };
  const startAttributeRecovery = (nowMs: number): void => {
    attributeRecoveryUntilMs = Math.max(attributeRecoveryUntilMs, nowMs + config.airRecoveryMs);
    registerDangerStrike(nowMs);
  };
  const apply = (position: Vector3, desiredMovementVector: MovementVector, nowMs: number): MovementSafetyDecision => {
    const normalizedDesiredMovementVector = normalizeMovementVector(desiredMovementVector);
    if (lastObservedPosition) {
      const dropDelta = lastObservedPosition.y - position.y;
      if (dropDelta >= config.dropTriggerBlocks) {
        startTerrainRecovery(nowMs, normalizedDesiredMovementVector);
      } else {
        if (dropDelta >= config.descentStepBlocks) descentTicks += 1;
        else descentTicks = 0;
        if (descentTicks >= config.descentTicks) startTerrainRecovery(nowMs, normalizedDesiredMovementVector);
      }
    }
    trimOldDangerStrikes(nowMs);
    const hasPanicRecovery = nowMs < panicRecoveryUntilMs;
    const hasAttributeRecovery = nowMs < attributeRecoveryUntilMs;
    const hasTerrainRecovery = nowMs < terrainRecoveryUntilMs;
    const decision = hasPanicRecovery
      ? { movementVector: DEFAULT_MOVEMENT_VECTOR, jump: true, reason: "panic_recovery" }
      : hasAttributeRecovery
        ? { movementVector: DEFAULT_MOVEMENT_VECTOR, jump: true, reason: "attribute_recovery" }
        : hasTerrainRecovery
          ? { movementVector: terrainRecoveryVector, jump: true, reason: "terrain_recovery" }
          : { movementVector: normalizedDesiredMovementVector, jump: false, reason: null };
    lastObservedPosition = position;
    lastAppliedMovementVector = decision.movementVector;
    return decision;
  };
  const observeAttributes = (packet: unknown, localRuntimeEntityId: string | null, nowMs: number): void => {
    if (!isLocalAttributePacket(packet, localRuntimeEntityId)) return;
    for (const attribute of readAttributeEntries(packet)) {
      if (attribute.name === AIR_ATTRIBUTE_NAME && attribute.current <= config.lowAirThreshold) {
        startAttributeRecovery(nowMs);
      }
      if (attribute.name !== HEALTH_ATTRIBUTE_NAME) continue;
      const previousHealth = attributeState.health;
      attributeState.health = attribute.current;
      if (previousHealth === null) continue;
      if (previousHealth - attribute.current < config.healthLossTrigger) continue;
      startAttributeRecovery(nowMs);
    }
  };
  return {
    apply,
    observeAttributes
  };
};
