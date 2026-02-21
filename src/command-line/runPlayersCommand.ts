import type { Logger } from "pino";
import { MOVEMENT_GOAL_SAFE_WALK, type RaknetBackend } from "../constants.js";
import { runJoinCommand, type JoinDependencies } from "./runJoinCommand.js";

export type PlayersCommandOptions = {
  accountName: string;
  host: string | undefined;
  port: number;
  serverName: string | undefined;
  transport: "raknet" | "nethernet";
  discoveryTimeoutMs: number;
  cacheDirectory: string | undefined;
  keyFilePath: string | undefined;
  environmentKey: string | undefined;
  joinTimeoutMs: number;
  forceRefresh: boolean;
  skipPing: boolean;
  raknetBackend: RaknetBackend;
  waitMs: number;
  reconnectMaxRetries?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
};

export const runPlayersCommand = async (
  options: PlayersCommandOptions,
  logger: Logger,
  dependencies?: JoinDependencies
): Promise<void> => {
  let latestPlayers: string[] = [];
  logger.info({ event: "players_probe_start", waitMs: options.waitMs }, "Collecting online player list");
  await runJoinCommand({
    accountName: options.accountName,
    host: options.host,
    port: options.port,
    serverName: options.serverName,
    transport: options.transport,
    discoveryTimeoutMs: options.discoveryTimeoutMs,
    cacheDirectory: options.cacheDirectory,
    keyFilePath: options.keyFilePath,
    environmentKey: options.environmentKey,
    minecraftVersion: undefined,
    joinTimeoutMs: options.joinTimeoutMs,
    disconnectAfterFirstChunk: false,
    forceRefresh: options.forceRefresh,
    skipPing: options.skipPing,
    raknetBackend: options.raknetBackend,
    movementGoal: MOVEMENT_GOAL_SAFE_WALK,
    followPlayerName: undefined,
    ...(options.reconnectMaxRetries !== undefined ? { reconnectMaxRetries: options.reconnectMaxRetries } : {}),
    ...(options.reconnectBaseDelayMs !== undefined ? { reconnectBaseDelayMs: options.reconnectBaseDelayMs } : {}),
    ...(options.reconnectMaxDelayMs !== undefined ? { reconnectMaxDelayMs: options.reconnectMaxDelayMs } : {}),
    listPlayersOnly: true,
    playerListWaitMs: options.waitMs,
    onPlayerListUpdate: (players) => {
      latestPlayers = players;
      logger.info({ event: "players_snapshot", count: players.length, players }, "Observed online players");
    }
  }, logger, dependencies);
  if (latestPlayers.length === 0) {
    logger.warn({ event: "players_empty" }, "No player names observed during probe window");
    return;
  }
  logger.info({ event: "players_result", count: latestPlayers.length, players: latestPlayers }, "Player list probe completed");
};
