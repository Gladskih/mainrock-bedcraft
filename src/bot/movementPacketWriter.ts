import type { ClientLike } from "../bedrock/clientTypes.js";
import type { Vector3 } from "../bedrock/joinClientHelpers.js";

export type MovementVector = { x: number; y: number };

export type MovementPacketMode = "player_auth_input" | "move_player";

type QueueMovementPacketOptions = {
  client: ClientLike;
  packetMode: MovementPacketMode;
  runtimeEntityId: string | null;
  getTick: () => bigint;
  nextPosition: Vector3;
  yaw: number;
  cameraOrientation: Vector3;
  localMoveVector: MovementVector;
  inputData: Record<string, boolean>;
  delta: Vector3;
};

const toVec2f = (movementVector: MovementVector): { x: number; z: number } => ({
  x: movementVector.x,
  z: movementVector.y
});

const toRuntimeEntityId = (runtimeEntityId: string | null): number => {
  if (!runtimeEntityId) return 0;
  const parsedRuntimeEntityId = Number.parseInt(runtimeEntityId, 10);
  if (!Number.isSafeInteger(parsedRuntimeEntityId) || parsedRuntimeEntityId < 0) return 0;
  return parsedRuntimeEntityId;
};

export const queueMovementPacket = (options: QueueMovementPacketOptions): void => {
  if (options.packetMode === "move_player") {
    options.client.queue?.("move_player", {
      runtime_id: toRuntimeEntityId(options.runtimeEntityId),
      position: options.nextPosition,
      pitch: 0,
      yaw: options.yaw,
      head_yaw: options.yaw,
      mode: "normal",
      on_ground: true,
      ridden_runtime_id: 0,
      tick: options.getTick()
    });
    return;
  }
  options.client.queue?.("player_auth_input", {
    pitch: 0,
    yaw: options.yaw,
    position: options.nextPosition,
    move_vector: toVec2f(options.localMoveVector),
    head_yaw: options.yaw,
    input_data: options.inputData,
    input_mode: "game_pad",
    play_mode: "normal",
    interaction_model: "crosshair",
    interact_rotation: { x: 0, z: 0 },
    tick: options.getTick(),
    delta: options.delta,
    analogue_move_vector: toVec2f(options.localMoveVector),
    camera_orientation: options.cameraOrientation,
    raw_move_vector: toVec2f(options.localMoveVector)
  });
};
