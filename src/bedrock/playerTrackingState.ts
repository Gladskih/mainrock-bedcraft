import type { Logger } from "pino";
import {
  normalizePlayerName,
  readPacketId,
  readPacketPosition,
  readOptionalStringField,
  type Vector3
} from "./joinClientHelpers.js";

type TrackedPlayer = {
  username: string;
  normalizedUsername: string;
  position: Vector3 | null;
};

type FollowTargetSelectionMode = "explicit_name_match" | "single_player_fallback";

export type PlayerTrackingState = {
  setLocalRuntimeEntityId: (runtimeEntityId: string | null) => void;
  handleAddPlayerPacket: (packet: unknown) => void;
  handleRemoveEntityPacket: (packet: unknown) => void;
  handleMovePlayerPacket: (packet: unknown, onLocalPosition: (position: Vector3) => void) => void;
  resolveFollowTargetPosition: () => Vector3 | null;
};

export const createPlayerTrackingState = (
  logger: Logger,
  followPlayerName: string | undefined
): PlayerTrackingState => {
  let localRuntimeEntityId: string | null = null;
  let followTargetRuntimeEntityId: string | null = null;
  let followTargetSelectionMode: FollowTargetSelectionMode | null = null;
  const normalizedFollowTargetName = followPlayerName ? normalizePlayerName(followPlayerName) : null;
  const trackedPlayers = new Map<string, TrackedPlayer>();
  const setLocalRuntimeEntityId = (runtimeEntityId: string | null): void => {
    localRuntimeEntityId = runtimeEntityId;
  };
  const findExplicitFollowTarget = (): { runtimeEntityId: string; trackedPlayer: TrackedPlayer } | null => {
    if (!normalizedFollowTargetName) return null;
    for (const [runtimeEntityId, trackedPlayer] of trackedPlayers) {
      if (runtimeEntityId === localRuntimeEntityId) continue;
      if (trackedPlayer.normalizedUsername !== normalizedFollowTargetName) continue;
      return { runtimeEntityId, trackedPlayer };
    }
    return null;
  };
  const findSingleRemotePlayerFallback = (): { runtimeEntityId: string; trackedPlayer: TrackedPlayer } | null => {
    const remotePlayers = [...trackedPlayers.entries()]
      .filter(([runtimeEntityId]) => runtimeEntityId !== localRuntimeEntityId)
      .map(([runtimeEntityId, trackedPlayer]) => ({ runtimeEntityId, trackedPlayer }));
    if (remotePlayers.length !== 1) return null;
    return remotePlayers[0] ?? null;
  };
  const resolveFollowTargetPosition = (): Vector3 | null => {
    if (!normalizedFollowTargetName) return null;
    const explicitFollowTarget = findExplicitFollowTarget();
    if (explicitFollowTarget) {
      const shouldSelectExplicitTarget = followTargetRuntimeEntityId !== explicitFollowTarget.runtimeEntityId
        || followTargetSelectionMode !== "explicit_name_match";
      if (shouldSelectExplicitTarget) {
        followTargetRuntimeEntityId = explicitFollowTarget.runtimeEntityId;
        followTargetSelectionMode = "explicit_name_match";
        logger.info(
          {
            event: "follow_target_acquired",
            followPlayerName: explicitFollowTarget.trackedPlayer.username,
            runtimeEntityId: explicitFollowTarget.runtimeEntityId
          },
          "Acquired follow target"
        );
      }
      return explicitFollowTarget.trackedPlayer.position;
    }
    const fallbackTarget = findSingleRemotePlayerFallback();
    if (followTargetRuntimeEntityId && followTargetSelectionMode === "single_player_fallback") {
      if (!fallbackTarget || fallbackTarget.runtimeEntityId !== followTargetRuntimeEntityId) {
        followTargetRuntimeEntityId = null;
        followTargetSelectionMode = null;
      } else {
        return fallbackTarget.trackedPlayer.position;
      }
    }
    if (!fallbackTarget) {
      followTargetRuntimeEntityId = null;
      followTargetSelectionMode = null;
      return null;
    }
    const shouldSelectFallbackTarget = followTargetRuntimeEntityId !== fallbackTarget.runtimeEntityId
      || followTargetSelectionMode !== "single_player_fallback";
    if (shouldSelectFallbackTarget) {
      followTargetRuntimeEntityId = fallbackTarget.runtimeEntityId;
      followTargetSelectionMode = "single_player_fallback";
      logger.info(
        {
          event: "follow_target_fallback",
          requestedFollowPlayerName: followPlayerName,
          resolvedFollowPlayerName: fallbackTarget.trackedPlayer.username,
          runtimeEntityId: fallbackTarget.runtimeEntityId
        },
        "Using single remote player as temporary follow target"
      );
    }
    return fallbackTarget.trackedPlayer.position;
  };
  const handleAddPlayerPacket = (packet: unknown): void => {
    const runtimeEntityId = readPacketId(packet, ["runtime_id", "runtime_entity_id"]);
    if (!runtimeEntityId) return;
    const username = readOptionalStringField(packet, "username");
    if (!username) return;
    trackedPlayers.set(runtimeEntityId, {
      username,
      normalizedUsername: normalizePlayerName(username),
      position: readPacketPosition(packet, "position")
    });
    logger.info({ event: "player_seen", username, runtimeEntityId }, "Tracked player entity");
    if (!normalizedFollowTargetName || normalizePlayerName(username) !== normalizedFollowTargetName) return;
    followTargetRuntimeEntityId = runtimeEntityId;
    followTargetSelectionMode = "explicit_name_match";
    logger.info({ event: "follow_target_acquired", followPlayerName: username, runtimeEntityId }, "Acquired follow target");
  };
  const handleRemoveEntityPacket = (packet: unknown): void => {
    const runtimeEntityId = readPacketId(packet, ["runtime_id", "runtime_entity_id", "entity_id"]);
    if (!runtimeEntityId) return;
    trackedPlayers.delete(runtimeEntityId);
    if (followTargetRuntimeEntityId !== runtimeEntityId) return;
    followTargetRuntimeEntityId = null;
    followTargetSelectionMode = null;
    logger.info({ event: "follow_target_lost", runtimeEntityId }, "Follow target entity left tracking range");
  };
  const handleMovePlayerPacket = (packet: unknown, onLocalPosition: (position: Vector3) => void): void => {
    const runtimeEntityId = readPacketId(packet, ["runtime_id", "runtime_entity_id"]);
    const position = readPacketPosition(packet, "position");
    if (!runtimeEntityId || !position) return;
    if (!localRuntimeEntityId || runtimeEntityId === localRuntimeEntityId) onLocalPosition(position);
    const trackedPlayer = trackedPlayers.get(runtimeEntityId);
    if (!trackedPlayer) return;
    trackedPlayers.set(runtimeEntityId, { ...trackedPlayer, position });
  };
  return {
    setLocalRuntimeEntityId,
    handleAddPlayerPacket,
    handleRemoveEntityPacket,
    handleMovePlayerPacket,
    resolveFollowTargetPosition
  };
};
