import {
  readPacketId,
  readPacketPosition,
  readOptionalStringField,
  type Vector3
} from "./joinClientHelpers.js";
import { createBotWorldState, type BotWorldSnapshot } from "../bot/worldState.js";

type WorldStateBridge = {
  getSnapshot: () => BotWorldSnapshot;
  setAuthenticatedPlayerName: (playerName: string | null) => void;
  setLocalFromStartGame: (runtimeEntityId: string | null, dimension: string | null, position: Vector3 | null) => void;
  handleAddPlayerPacket: (packet: unknown) => void;
  handleAddEntityPacket: (packet: unknown) => void;
  handleMovePlayerPacket: (packet: unknown, onLocalPosition: (position: Vector3) => void) => void;
  handleMoveEntityPacket: (packet: unknown) => void;
  handleRemoveEntityPacket: (packet: unknown) => void;
};

const readRuntimeEntityId = (packet: unknown): string | null => {
  return readPacketId(packet, ["runtime_id", "runtime_entity_id", "entity_id"]);
};

export const createWorldStateBridge = (): WorldStateBridge => {
  const botWorldState = createBotWorldState();
  let localRuntimeEntityId: string | null = null;
  let localPlayerName: string | null = null;
  let localDimension: string | null = null;
  const setAuthenticatedPlayerName = (playerName: string | null): void => {
    localPlayerName = playerName;
    botWorldState.setLocalIdentity(localRuntimeEntityId, localPlayerName);
  };
  const setLocalFromStartGame = (
    runtimeEntityId: string | null,
    dimension: string | null,
    position: Vector3 | null
  ): void => {
    localRuntimeEntityId = runtimeEntityId;
    localDimension = dimension;
    botWorldState.setLocalIdentity(localRuntimeEntityId, localPlayerName);
    botWorldState.setLocalPose(localDimension, position);
  };
  const handleAddPlayerPacket = (packet: unknown): void => {
    const runtimeEntityId = readRuntimeEntityId(packet);
    if (!runtimeEntityId) return;
    const username = readOptionalStringField(packet, "username");
    if (!username) return;
    botWorldState.upsertEntity(runtimeEntityId, username, readPacketPosition(packet, "position"));
  };
  const handleAddEntityPacket = (packet: unknown): void => {
    const runtimeEntityId = readRuntimeEntityId(packet);
    if (!runtimeEntityId) return;
    botWorldState.upsertEntity(runtimeEntityId, null, readPacketPosition(packet, "position"));
  };
  const handleMovePlayerPacket = (packet: unknown, onLocalPosition: (position: Vector3) => void): void => {
    const runtimeEntityId = readRuntimeEntityId(packet);
    const position = readPacketPosition(packet, "position");
    if (!runtimeEntityId || !position) return;
    if (!localRuntimeEntityId || runtimeEntityId === localRuntimeEntityId) {
      botWorldState.setLocalPose(localDimension, position);
      onLocalPosition(position);
      return;
    }
    botWorldState.updateEntityPosition(runtimeEntityId, position);
  };
  const handleMoveEntityPacket = (packet: unknown): void => {
    const runtimeEntityId = readRuntimeEntityId(packet);
    const position = readPacketPosition(packet, "position");
    if (!runtimeEntityId || !position || runtimeEntityId === localRuntimeEntityId) return;
    botWorldState.updateEntityPosition(runtimeEntityId, position);
  };
  const handleRemoveEntityPacket = (packet: unknown): void => {
    const runtimeEntityId = readRuntimeEntityId(packet);
    if (!runtimeEntityId) return;
    botWorldState.removeEntity(runtimeEntityId);
  };
  return {
    getSnapshot: botWorldState.getSnapshot,
    setAuthenticatedPlayerName,
    setLocalFromStartGame,
    handleAddPlayerPacket,
    handleAddEntityPacket,
    handleMovePlayerPacket,
    handleMoveEntityPacket,
    handleRemoveEntityPacket
  };
};
