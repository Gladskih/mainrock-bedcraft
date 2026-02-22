export type Vector3 = { x: number; y: number; z: number };

export type StartGamePacket = {
  player_position?: Vector3;
  dimension?: string;
  level_id?: string;
  world_name?: string;
  current_tick?: bigint | number | string;
  runtime_entity_id?: bigint | number | string;
  runtime_id?: bigint | number | string;
};

export type LevelChunkPacket = {
  x?: number;
  z?: number;
};

export const isVector3 = (value: unknown): value is Vector3 => {
  if (!value || typeof value !== "object") return false;
  return "x" in value && "y" in value && "z" in value;
};

export const isStartGamePacket = (value: unknown): value is StartGamePacket => {
  if (!value || typeof value !== "object") return false;
  return true;
};

export const isLevelChunkPacket = (value: unknown): value is LevelChunkPacket => {
  if (!value || typeof value !== "object") return false;
  return "x" in value && "z" in value;
};

export const readOptionalStringField = (packet: unknown, fieldName: string): string | null => {
  if (!packet || typeof packet !== "object") return null;
  if (!(fieldName in packet)) return null;
  const value = (packet as Record<string, unknown>)[fieldName];
  return typeof value === "string" ? value : null;
};

export const readOptionalNumberField = (packet: unknown, fieldName: string): number | null => {
  if (!packet || typeof packet !== "object") return null;
  if (!(fieldName in packet)) return null;
  const value = (packet as Record<string, unknown>)[fieldName];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) return null;
    return Number(value);
  }
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const readOptionalBigIntField = (packet: unknown, fieldName: string): bigint | null => {
  if (!packet || typeof packet !== "object") return null;
  if (!(fieldName in packet)) return null;
  const value = (packet as Record<string, unknown>)[fieldName];
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)) return BigInt(value);
  if (typeof value === "string" && INTEGER_STRING_PATTERN.test(value)) return BigInt(value);
  return null;
};

const INTEGER_STRING_PATTERN = /^-?\d+$/;

export const readIntegerLikeId = (value: unknown): string | null => {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)) return String(value);
  if (typeof value === "string" && INTEGER_STRING_PATTERN.test(value)) return value;
  if (!value || typeof value !== "object" || !("toString" in value)) return null;
  const asText = String((value as { toString: () => string }).toString());
  return INTEGER_STRING_PATTERN.test(asText) ? asText : null;
};

export const readPacketId = (packet: unknown, fieldNames: string[]): string | null => {
  if (!packet || typeof packet !== "object") return null;
  for (const fieldName of fieldNames) {
    if (!(fieldName in packet)) continue;
    const id = readIntegerLikeId((packet as Record<string, unknown>)[fieldName]);
    if (id) return id;
  }
  return null;
};

export const readPacketPosition = (packet: unknown, fieldName = "position"): Vector3 | null => {
  if (!packet || typeof packet !== "object") return null;
  if (!(fieldName in packet)) return null;
  const position = (packet as Record<string, unknown>)[fieldName];
  return isVector3(position) ? position : null;
};

export const normalizePlayerName = (name: string): string => name.toLocaleLowerCase();

export const readPacketEventName = (packet: unknown): string | null => {
  if (!packet || typeof packet !== "object") return null;
  if (!("data" in packet)) return null;
  return readOptionalStringField((packet as { data?: unknown }).data, "name");
};

export const getProfileName = (client: unknown): string => {
  if (!client || typeof client !== "object" || !("profile" in client)) return "unknown";
  const profile = (client as { profile?: { name?: string } }).profile;
  return profile?.name ?? "unknown";
};

export const toError = (value: unknown): Error => {
  if (value instanceof Error) return value;
  return new Error(String(value));
};

export const toChunkKey = (chunkX: number, chunkZ: number): string => `${chunkX}:${chunkZ}`;
