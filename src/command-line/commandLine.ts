import { Command } from "commander";
import type { Logger } from "pino";
import { APPLICATION_ID } from "../constants.js";
import {
  resolveJoinOptions,
  resolvePlayersOptions,
  resolveScanOptions
} from "./options.js";
import { resolveCalibrateSpeedOptions, resolveFollowOptions } from "./joinBehaviorOptions.js";
import { runJoinCommand } from "./runJoinCommand.js";
import { runPlayersCommand } from "./runPlayersCommand.js";
import { runScanCommand } from "./runScanCommand.js";

export type CommandLineDependencies = {
  resolveScanOptions: typeof resolveScanOptions;
  resolveJoinOptions: typeof resolveJoinOptions;
  resolveFollowOptions: typeof resolveFollowOptions;
  resolveCalibrateSpeedOptions: typeof resolveCalibrateSpeedOptions;
  resolvePlayersOptions: typeof resolvePlayersOptions;
  runScanCommand: typeof runScanCommand;
  runJoinCommand: typeof runJoinCommand;
  runPlayersCommand: typeof runPlayersCommand;
};

const defaultCommandLineDependencies: CommandLineDependencies = {
  resolveScanOptions,
  resolveJoinOptions,
  resolveFollowOptions,
  resolveCalibrateSpeedOptions,
  resolvePlayersOptions,
  runScanCommand,
  runJoinCommand,
  runPlayersCommand
};

type CommandOptions = Record<string, string | boolean | undefined>;

const getStringOption = (options: CommandOptions, key: string): string | undefined => {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
};

const getBooleanOption = (options: CommandOptions, key: string): boolean | undefined => {
  const value = options[key];
  return typeof value === "boolean" ? value : undefined;
};

const handleCommandFailure = (
  logger: Logger,
  event: string,
  message: string,
  error: unknown
): void => {
  logger.error({ event, error: error instanceof Error ? error.message : String(error) }, message);
  process.exitCode = 1;
};

const buildJoinConnectionInput = (options: CommandOptions) => ({
  host: getStringOption(options, "host"),
  port: getStringOption(options, "port"),
  name: getStringOption(options, "name"),
  transport: getStringOption(options, "transport"),
  account: getStringOption(options, "account"),
  cacheDir: getStringOption(options, "cacheDir"),
  keyFile: getStringOption(options, "keyFile"),
  minecraftVersion: getStringOption(options, "minecraftVersion"),
  joinTimeout: getStringOption(options, "joinTimeout"),
  forceRefresh: getBooleanOption(options, "forceRefresh"),
  skipPing: getBooleanOption(options, "skipPing"),
  raknetBackend: getStringOption(options, "raknetBackend"),
  discoveryTimeout: getStringOption(options, "discoveryTimeout"),
  chunkRadius: getStringOption(options, "chunkRadius"),
  reconnectRetries: getStringOption(options, "reconnectRetries"),
  reconnectBaseDelay: getStringOption(options, "reconnectBaseDelay"),
  reconnectMaxDelay: getStringOption(options, "reconnectMaxDelay")
});

const addJoinConnectionOptions = (command: Command): Command => {
  return command
    .option("--host <host>", "Server host to connect to")
    .option("--port <port>", "Server port to connect to")
    .option("--name <name>", "Server name to select via LAN discovery")
    .option("--transport <transport>", "Transport: nethernet|raknet")
    .option("--account <account>", "Account identifier for token cache")
    .option("--cache-dir <path>", "Override cache directory path")
    .option("--key-file <path>", "Override protected cache key blob file path")
    .option("--minecraft-version <version>", "Minecraft protocol version (e.g. 1.21.93)")
    .option("--join-timeout <ms>", "Join timeout in milliseconds")
    .option("--force-refresh", "Force refresh cached tokens")
    .option("--skip-ping", "Skip initial ping before connecting")
    .option("--raknet-backend <backend>", "RakNet backend: native|node")
    .option("--discovery-timeout <ms>", "LAN discovery timeout in milliseconds")
    .option("--chunk-radius <chunks>", "Chunk radius soft cap in chunks")
    .option("--reconnect-retries <count>", "Reconnect retries after failed join attempts")
    .option("--reconnect-base-delay <ms>", "Reconnect backoff base delay in milliseconds")
    .option("--reconnect-max-delay <ms>", "Reconnect backoff max delay in milliseconds");
};

const registerScanCommand = (
  program: Command,
  logger: Logger,
  dependencies: CommandLineDependencies
): void => {
  program
    .command("scan")
    .description("Discover LAN servers and read status without joining")
    .option("--timeout <ms>", "Discovery timeout in milliseconds")
    .option("--name <name>", "Filter servers by name")
    .option("--transport <transport>", "Transport: nethernet|raknet")
    .action(async (options: CommandOptions) => {
      try {
        await dependencies.runScanCommand(
          dependencies.resolveScanOptions(
            {
              timeout: getStringOption(options, "timeout"),
              name: getStringOption(options, "name"),
              transport: getStringOption(options, "transport")
            },
            process.env
          ),
          logger
        );
      } catch (error) {
        handleCommandFailure(logger, "scan_error", "Scan failed", error);
      }
    });
};

const registerJoinCommand = (
  program: Command,
  logger: Logger,
  dependencies: CommandLineDependencies
): void => {
  const joinCommand = addJoinConnectionOptions(
    program.command("join").description("Join a LAN server")
  );
  joinCommand.action(async (options: CommandOptions) => {
    try {
      await dependencies.runJoinCommand(
        dependencies.resolveJoinOptions(
          {
            ...buildJoinConnectionInput(options),
            disconnectAfterFirstChunk: false,
            goal: "safe-walk",
            followPlayer: undefined,
            followCoordinates: undefined,
            speedProfileFile: undefined
          },
          process.env
        ),
        logger
      );
    } catch (error) {
      handleCommandFailure(logger, "join_error", "Join failed", error);
    }
  });
  joinCommand
    .command("follow")
    .description("Follow player or coordinates")
    .option("--follow-player <name>", "Target player name")
    .option("--follow-coordinates <x y z>", "Target coordinates")
    .option("--speed-profile-file <path>", "Override movement speed profile file path")
    .action(async (options: CommandOptions, command: Command) => {
      try {
        const parentOptions = command.parent?.opts() as CommandOptions | undefined;
        if (!parentOptions) throw new Error("Join connection options are unavailable");
        await dependencies.runJoinCommand(
          dependencies.resolveFollowOptions(
            {
              ...buildJoinConnectionInput(parentOptions),
              followPlayer: getStringOption(options, "followPlayer"),
              followCoordinates: getStringOption(options, "followCoordinates"),
              speedProfileFile: getStringOption(options, "speedProfileFile")
            },
            process.env
          ),
          logger
        );
      } catch (error) {
        handleCommandFailure(logger, "follow_error", "Follow failed", error);
      }
    });
  joinCommand
    .command("calibrate-speed")
    .description("Calibrate movement speed profile")
    .option("--follow-coordinates <x y z>", "Calibration movement coordinates")
    .option("--speed-profile-file <path>", "Override movement speed profile file path")
    .action(async (options: CommandOptions, command: Command) => {
      try {
        const parentOptions = command.parent?.opts() as CommandOptions | undefined;
        if (!parentOptions) throw new Error("Join connection options are unavailable");
        await dependencies.runJoinCommand(
          dependencies.resolveCalibrateSpeedOptions(
            {
              ...buildJoinConnectionInput(parentOptions),
              followCoordinates: getStringOption(options, "followCoordinates"),
              speedProfileFile: getStringOption(options, "speedProfileFile")
            },
            process.env
          ),
          logger
        );
      } catch (error) {
        handleCommandFailure(logger, "calibrate_speed_error", "Speed calibration failed", error);
      }
    });
};

const registerPlayersCommand = (
  program: Command,
  logger: Logger,
  dependencies: CommandLineDependencies
): void => {
  program
    .command("players")
    .description("Join briefly and print online player names")
    .option("--host <host>", "Server host to connect to")
    .option("--port <port>", "Server port to connect to")
    .option("--name <name>", "Server name to select via LAN discovery")
    .option("--transport <transport>", "Transport: nethernet|raknet")
    .option("--account <account>", "Account identifier for token cache")
    .option("--cache-dir <path>", "Override cache directory path")
    .option("--key-file <path>", "Override protected cache key blob file path")
    .option("--join-timeout <ms>", "Join timeout in milliseconds")
    .option("--force-refresh", "Force refresh cached tokens")
    .option("--skip-ping", "Skip initial ping before connecting")
    .option("--raknet-backend <backend>", "RakNet backend: native|node")
    .option("--discovery-timeout <ms>", "LAN discovery timeout in milliseconds")
    .option("--wait <ms>", "How long to wait for player list updates after login")
    .option("--chunk-radius <chunks>", "Chunk radius soft cap in chunks")
    .option("--reconnect-retries <count>", "Reconnect retries after failed join attempts")
    .option("--reconnect-base-delay <ms>", "Reconnect backoff base delay in milliseconds")
    .option("--reconnect-max-delay <ms>", "Reconnect backoff max delay in milliseconds")
    .action(async (options: CommandOptions) => {
      try {
        await dependencies.runPlayersCommand(
          dependencies.resolvePlayersOptions(
            {
              host: getStringOption(options, "host"),
              port: getStringOption(options, "port"),
              name: getStringOption(options, "name"),
              transport: getStringOption(options, "transport"),
              account: getStringOption(options, "account"),
              cacheDir: getStringOption(options, "cacheDir"),
              keyFile: getStringOption(options, "keyFile"),
              joinTimeout: getStringOption(options, "joinTimeout"),
              forceRefresh: getBooleanOption(options, "forceRefresh"),
              skipPing: getBooleanOption(options, "skipPing"),
              raknetBackend: getStringOption(options, "raknetBackend"),
              discoveryTimeout: getStringOption(options, "discoveryTimeout"),
              wait: getStringOption(options, "wait"),
              chunkRadius: getStringOption(options, "chunkRadius"),
              reconnectRetries: getStringOption(options, "reconnectRetries"),
              reconnectBaseDelay: getStringOption(options, "reconnectBaseDelay"),
              reconnectMaxDelay: getStringOption(options, "reconnectMaxDelay")
            },
            process.env
          ),
          logger
        );
      } catch (error) {
        handleCommandFailure(logger, "players_error", "Players probe failed", error);
      }
    });
};

export const createCommandLineProgram = (
  logger: Logger,
  dependencies: CommandLineDependencies = defaultCommandLineDependencies
): Command => {
  const program = new Command();
  program.name(APPLICATION_ID);
  program.description("Bedrock LAN discovery and join MVP");
  program.showHelpAfterError();
  registerScanCommand(program, logger, dependencies);
  registerJoinCommand(program, logger, dependencies);
  registerPlayersCommand(program, logger, dependencies);
  return program;
};
