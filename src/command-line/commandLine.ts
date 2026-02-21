import { Command } from "commander";
import type { Logger } from "pino";
import { APPLICATION_ID } from "../constants.js";
import { resolveJoinOptions, resolveScanOptions } from "./options.js";
import { runJoinCommand } from "./runJoinCommand.js";
import { runScanCommand } from "./runScanCommand.js";

export type CommandLineDependencies = {
  resolveScanOptions: typeof resolveScanOptions;
  resolveJoinOptions: typeof resolveJoinOptions;
  runScanCommand: typeof runScanCommand;
  runJoinCommand: typeof runJoinCommand;
};

const defaultCommandLineDependencies: CommandLineDependencies = {
  resolveScanOptions,
  resolveJoinOptions,
  runScanCommand,
  runJoinCommand
};

export const createCommandLineProgram = (
  logger: Logger,
  dependencies: CommandLineDependencies = defaultCommandLineDependencies
): Command => {
  const program = new Command();
  program.name(APPLICATION_ID);
  program.description("Bedrock LAN discovery and join MVP");
  program.showHelpAfterError();
  program
    .command("scan")
    .description("Discover LAN servers and read status without joining")
    .option("--timeout <ms>", "Discovery timeout in milliseconds")
    .option("--name <name>", "Filter servers by name")
    .option("--transport <transport>", "Transport: nethernet|raknet")
    .action(async (options: { timeout?: string; name?: string; transport?: string }) => {
      try {
        await dependencies.runScanCommand(
          dependencies.resolveScanOptions(
            { timeout: options.timeout, name: options.name, transport: options.transport },
            process.env
          ),
          logger
        );
      } catch (error) {
        logger.error({ event: "scan_error", error: error instanceof Error ? error.message : String(error) }, "Scan failed");
        process.exitCode = 1;
      }
    });
  program
    .command("join")
    .description("Join a LAN server using Microsoft device code auth")
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
    .action(async (options: {
      host?: string;
      port?: string;
      name?: string;
      transport?: string;
      account?: string;
      cacheDir?: string;
      keyFile?: string;
      minecraftVersion?: string;
      joinTimeout?: string;
      forceRefresh?: boolean;
      skipPing?: boolean;
      raknetBackend?: string;
      discoveryTimeout?: string;
    }) => {
      try {
        await dependencies.runJoinCommand(
          dependencies.resolveJoinOptions({
            host: options.host,
            port: options.port,
            name: options.name,
            transport: options.transport,
            account: options.account,
            cacheDir: options.cacheDir,
            keyFile: options.keyFile,
            minecraftVersion: options.minecraftVersion,
            joinTimeout: options.joinTimeout,
            forceRefresh: options.forceRefresh,
            skipPing: options.skipPing,
            raknetBackend: options.raknetBackend,
            discoveryTimeout: options.discoveryTimeout
          }, process.env),
          logger
        );
      } catch (error) {
        logger.error({ event: "join_error", error: error instanceof Error ? error.message : String(error) }, "Join failed");
        process.exitCode = 1;
      }
    });
  return program;
};
