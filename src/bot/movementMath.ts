import { DEFAULT_MOVEMENT_LOOP_INTERVAL_MS } from "../constants.js";
import type { Vector3 } from "../bedrock/joinClientHelpers.js";
import type { MovementVector } from "./movementPacketWriter.js";

export const toForwardMovementVector = (stepIndex: number): MovementVector => {
  if (stepIndex % 120 < 60) return { x: 0, y: 1 };
  return { x: 0, y: -1 };
};

export const toFollowMovementVector = (
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

export const toYawFromMovementVector = (movementVector: MovementVector): number => {
  if (movementVector.x === 0 && movementVector.y === 0) return 0;
  return Math.atan2(movementVector.x, movementVector.y) * (180 / Math.PI);
};

export const toInputFlags = (movementVector: MovementVector): Record<string, boolean> => ({
  up: movementVector.y > 0,
  down: movementVector.y < 0,
  left: movementVector.x < 0,
  right: movementVector.x > 0,
  jump: false
});

const toDeltaDistance = (speedBlocksPerSecond: number): number =>
  speedBlocksPerSecond * DEFAULT_MOVEMENT_LOOP_INTERVAL_MS * 0.001;

export const toDeltaVector = (movementVector: MovementVector, speedBlocksPerSecond: number): Vector3 => ({
  x: movementVector.x * toDeltaDistance(speedBlocksPerSecond),
  y: 0,
  z: movementVector.y * toDeltaDistance(speedBlocksPerSecond)
});

export const toNextPosition = (position: Vector3, delta: Vector3): Vector3 => ({
  x: position.x + delta.x,
  y: position.y,
  z: position.z + delta.z
});

export const toMovementMagnitude = (movementVector: MovementVector): number => {
  return Math.hypot(movementVector.x, movementVector.y);
};

export const toLocalMoveVector = (movementVector: MovementVector): MovementVector => {
  if (movementVector.x === 0 && movementVector.y === 0) return { x: 0, y: 0 };
  return { x: 0, y: 1 };
};

export const toCameraOrientationFromYaw = (yaw: number): Vector3 => {
  const yawRadians = yaw * (Math.PI / 180);
  return { x: Math.sin(yawRadians), y: 0, z: Math.cos(yawRadians) };
};
