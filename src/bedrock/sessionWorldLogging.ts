import type { JoinOptions } from "./joinClient.js";
import {
  getProfileName,
  readOptionalNumberField,
  readPacketPosition,
  type StartGamePacket,
  type Vector3
} from "./joinClientHelpers.js";

export const toStartGameLogFields = (
  options: JoinOptions,
  client: unknown,
  packet: StartGamePacket,
  localRuntimeEntityId: string | null,
  position: Vector3 | null
): Record<string, unknown> => ({
  event: "start_game",
  host: options.host,
  port: options.port,
  transport: options.transport,
  serverName: options.serverName ?? null,
  serverId: options.nethernetServerId?.toString() ?? null,
  playerName: getProfileName(client),
  dimension: packet.dimension ?? null,
  position,
  runtimeEntityId: localRuntimeEntityId,
  levelId: packet.level_id ?? null,
  worldName: packet.world_name ?? null,
  blockNetworkIdsAreHashes: packet.block_network_ids_are_hashes ?? null,
  gameType: readOptionalNumberField(packet, "player_gamemode") ?? readOptionalNumberField(packet, "game_type"),
  difficulty: readOptionalNumberField(packet, "difficulty"),
  generator: readOptionalNumberField(packet, "generator"),
  seed: readOptionalNumberField(packet, "seed")
});

export const toChunkPublisherUpdateLogFields = (packet: unknown): Record<string, unknown> => ({
  event: "chunk_publisher_update",
  chunkPublisherCenter: readPacketPosition(packet, "coordinates"),
  chunkPublisherRadiusBlocks: readOptionalNumberField(packet, "radius")
});
