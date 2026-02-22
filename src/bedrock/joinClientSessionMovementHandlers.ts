import type { Logger } from "pino";
import { readOptionalBigIntField, readPacketPosition, type Vector3 } from "./joinClientHelpers.js";
import type { PlayerTrackingState } from "./playerTrackingState.js";
import type { WorldStateBridge } from "./worldStateBridge.js";

type PacketClient = {
  on: (event: string, listener: (packet: unknown) => void) => void;
};

type JoinClientSessionMovementHandlersOptions = {
  client: PacketClient;
  logger: Logger;
  worldStateBridge: WorldStateBridge;
  playerTrackingState: PlayerTrackingState;
  setCurrentPosition: (position: Vector3) => void;
};

const CORRECTION_LOG_INTERVAL_MS = 2000;

export const attachMovementPacketHandlers = (
  options: JoinClientSessionMovementHandlersOptions
): void => {
  let correctionPacketCount = 0;
  let lastCorrectionLogAtMs = 0;
  options.client.on("move_player", (packet) => {
    options.worldStateBridge.handleMovePlayerPacket(packet, options.setCurrentPosition);
    options.playerTrackingState.handleMovePlayerPacket(packet, options.setCurrentPosition);
  });
  options.client.on("move_actor_absolute", (packet) => {
    options.worldStateBridge.handleMoveEntityPacket(packet, options.setCurrentPosition);
  });
  options.client.on("move_entity", (packet) => {
    options.worldStateBridge.handleMoveEntityPacket(packet, options.setCurrentPosition);
  });
  options.client.on("correct_player_move_prediction", (packet) => {
    const correctedPosition = readPacketPosition(packet, "position");
    if (correctedPosition) {
      options.setCurrentPosition(correctedPosition);
      options.worldStateBridge.setLocalPosition(correctedPosition);
    }
    correctionPacketCount += 1;
    const nowMs = Date.now();
    if (nowMs - lastCorrectionLogAtMs < CORRECTION_LOG_INTERVAL_MS) return;
    lastCorrectionLogAtMs = nowMs;
    options.logger.info(
      {
        event: "correct_player_move_prediction",
        correctionPackets: correctionPacketCount,
        position: correctedPosition,
        tick: readOptionalBigIntField(packet, "tick")?.toString() ?? null
      },
      "Received local movement correction"
    );
  });
};
