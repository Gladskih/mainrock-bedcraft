import assert from "node:assert/strict";
import { test } from "node:test";
import type { Logger } from "pino";
import { createCommandLineProgram } from "../../src/command-line/commandLine.js";
import type { JoinCommandOptions } from "../../src/command-line/runJoinCommand.js";
import type { PlayersCommandOptions } from "../../src/command-line/runPlayersCommand.js";
import { DEFAULT_RAKNET_BACKEND, MOVEMENT_GOAL_SAFE_WALK } from "../../src/constants.js";

const createLogger = (): Logger => ({
  info: () => undefined,
  error: () => undefined
} as unknown as Logger);

const createResolvedJoinOptions = (): JoinCommandOptions => ({
  accountName: "user",
  host: "127.0.0.1",
  port: 19132,
  serverName: undefined,
  transport: "raknet",
  discoveryTimeoutMs: 1,
  cacheDirectory: undefined,
  keyFilePath: undefined,
  environmentKey: undefined,
  minecraftVersion: undefined,
  joinTimeoutMs: 1,
  disconnectAfterFirstChunk: true,
  forceRefresh: false,
  skipPing: false,
  raknetBackend: DEFAULT_RAKNET_BACKEND,
  movementGoal: MOVEMENT_GOAL_SAFE_WALK,
  followPlayerName: undefined
});

const createResolvedPlayersOptions = (): PlayersCommandOptions => ({
  accountName: "user",
  host: "127.0.0.1",
  port: 19132,
  serverName: undefined,
  transport: "raknet",
  discoveryTimeoutMs: 1,
  cacheDirectory: undefined,
  keyFilePath: undefined,
  environmentKey: undefined,
  joinTimeoutMs: 1,
  forceRefresh: false,
  skipPing: false,
  raknetBackend: DEFAULT_RAKNET_BACKEND,
  waitMs: 1
});

const createDependencies = (overrides: Partial<Parameters<typeof createCommandLineProgram>[1]> = {}) => ({
  resolveScanOptions: () => ({ timeoutMs: 1, serverNameFilter: undefined, transport: "nethernet" as const }),
  resolveJoinOptions: () => createResolvedJoinOptions(),
  resolvePlayersOptions: () => createResolvedPlayersOptions(),
  runScanCommand: async () => undefined,
  runJoinCommand: async () => undefined,
  runPlayersCommand: async () => undefined,
  ...overrides
});

void test("command line scan dispatches to handler", async () => {
  let called = false;
  const program = createCommandLineProgram(createLogger(), createDependencies({
    runScanCommand: async () => {
      called = true;
    }
  }));
  await program.parseAsync(["node", "mainrock-bedcraft", "scan"]);
  assert.equal(called, true);
});

void test("command line join dispatches to handler", async () => {
  let called = false;
  const program = createCommandLineProgram(createLogger(), createDependencies({
    runJoinCommand: async () => {
      called = true;
    }
  }));
  await program.parseAsync(["node", "mainrock-bedcraft", "join", "--host", "127.0.0.1", "--account", "user"]);
  assert.equal(called, true);
});

void test("command line players dispatches to handler", async () => {
  let called = false;
  const program = createCommandLineProgram(createLogger(), createDependencies({
    runPlayersCommand: async () => {
      called = true;
    }
  }));
  await program.parseAsync(["node", "mainrock-bedcraft", "players", "--host", "127.0.0.1", "--account", "user"]);
  assert.equal(called, true);
});

void test("command line scan sets exit code on error", async () => {
  const previousExitCode = process.exitCode;
  const program = createCommandLineProgram(createLogger(), createDependencies({
    runScanCommand: async () => {
      throw new Error("scan");
    }
  }));
  await program.parseAsync(["node", "mainrock-bedcraft", "scan"]);
  assert.equal(process.exitCode, 1);
  process.exitCode = previousExitCode;
});

void test("command line join sets exit code on error", async () => {
  const previousExitCode = process.exitCode;
  const program = createCommandLineProgram(createLogger(), createDependencies({
    runJoinCommand: async () => {
      throw new Error("join");
    }
  }));
  await program.parseAsync(["node", "mainrock-bedcraft", "join", "--host", "127.0.0.1", "--account", "user"]);
  assert.equal(process.exitCode, 1);
  process.exitCode = previousExitCode;
});

void test("command line players sets exit code on error", async () => {
  const previousExitCode = process.exitCode;
  const program = createCommandLineProgram(createLogger(), createDependencies({
    runPlayersCommand: async () => {
      throw new Error("players");
    }
  }));
  await program.parseAsync(["node", "mainrock-bedcraft", "players", "--host", "127.0.0.1", "--account", "user"]);
  assert.equal(process.exitCode, 1);
  process.exitCode = previousExitCode;
});

void test("command line scan handles non-error rejection", async () => {
  const previousExitCode = process.exitCode;
  const program = createCommandLineProgram(createLogger(), createDependencies({
    runScanCommand: async () => {
      throw "scan";
    }
  }));
  await program.parseAsync(["node", "mainrock-bedcraft", "scan"]);
  assert.equal(process.exitCode, 1);
  process.exitCode = previousExitCode;
});

void test("command line join handles non-error rejection", async () => {
  const previousExitCode = process.exitCode;
  const program = createCommandLineProgram(createLogger(), createDependencies({
    runJoinCommand: async () => {
      throw "join";
    }
  }));
  await program.parseAsync(["node", "mainrock-bedcraft", "join", "--host", "127.0.0.1", "--account", "user"]);
  assert.equal(process.exitCode, 1);
  process.exitCode = previousExitCode;
});

void test("command line players handles non-error rejection", async () => {
  const previousExitCode = process.exitCode;
  const program = createCommandLineProgram(createLogger(), createDependencies({
    runPlayersCommand: async () => {
      throw "players";
    }
  }));
  await program.parseAsync(["node", "mainrock-bedcraft", "players", "--host", "127.0.0.1", "--account", "user"]);
  assert.equal(process.exitCode, 1);
  process.exitCode = previousExitCode;
});
