import { readOptionalStringField } from "./joinClientHelpers.js";

type PlayerListState = {
  handlePlayerListPacket: (packet: unknown) => void;
  handleAddPlayerPacket: (packet: unknown) => void;
  getSnapshot: () => string[];
};

type PlayerListStateOptions = {
  onUpdate?: (players: string[]) => void;
};

const toPlayerListRecords = (packet: unknown): { type: "add" | "remove"; records: unknown[] } | null => {
  if (!packet || typeof packet !== "object" || !("records" in packet)) return null;
  const payload = (packet as { records?: unknown }).records;
  if (!payload || typeof payload !== "object") return null;
  const type = readOptionalStringField(payload, "type");
  if (type !== "add" && type !== "remove") return null;
  if (!("records" in payload)) return null;
  const records = (payload as { records?: unknown }).records;
  return Array.isArray(records) ? { type, records } : null;
};

const toUuidKey = (record: unknown): string | null => {
  if (!record || typeof record !== "object" || !("uuid" in record)) return null;
  return String((record as { uuid?: unknown }).uuid ?? "");
};

const toUserName = (record: unknown): string | null => {
  return readOptionalStringField(record, "username");
};

export const createPlayerListState = (options: PlayerListStateOptions = {}): PlayerListState => {
  const knownPlayerNames = new Set<string>();
  const playerNamesByUuid = new Map<string, string>();
  const emitUpdate = (): void => {
    options.onUpdate?.(Array.from(knownPlayerNames).sort((left, right) => left.localeCompare(right)));
  };
  const addKnownPlayer = (name: string): void => {
    if (knownPlayerNames.has(name)) return;
    knownPlayerNames.add(name);
    emitUpdate();
  };
  const removeKnownPlayer = (name: string): void => {
    if (!knownPlayerNames.has(name)) return;
    knownPlayerNames.delete(name);
    emitUpdate();
  };
  const handlePlayerListPacket = (packet: unknown): void => {
    const parsedRecords = toPlayerListRecords(packet);
    if (!parsedRecords) return;
    if (parsedRecords.type === "add") {
      for (const record of parsedRecords.records) {
        const username = toUserName(record);
        if (!username) continue;
        addKnownPlayer(username);
        const uuidKey = toUuidKey(record);
        if (!uuidKey) continue;
        playerNamesByUuid.set(uuidKey, username);
      }
      return;
    }
    for (const record of parsedRecords.records) {
      const uuidKey = toUuidKey(record);
      const username = uuidKey ? playerNamesByUuid.get(uuidKey) : toUserName(record);
      if (!username) continue;
      removeKnownPlayer(username);
      if (!uuidKey) continue;
      playerNamesByUuid.delete(uuidKey);
    }
  };
  const handleAddPlayerPacket = (packet: unknown): void => {
    const username = readOptionalStringField(packet, "username");
    if (!username) return;
    addKnownPlayer(username);
  };
  const getSnapshot = (): string[] => Array.from(knownPlayerNames).sort((left, right) => left.localeCompare(right));
  return {
    handlePlayerListPacket,
    handleAddPlayerPacket,
    getSnapshot
  };
};
