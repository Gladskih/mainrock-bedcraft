import assert from "node:assert/strict";
import { test } from "node:test";
import type { Logger } from "pino";
import { createCommandLineProgram } from "../../src/command-line/commandLine.js";
import { DEFAULT_RAKNET_BACKEND } from "../../src/constants.js";

const createLogger = (): Logger => ({
  info: () => undefined,
  error: () => undefined
} as unknown as Logger);

void test("command line scan dispatches to handler", async () => {
  let called = false;
  const program = createCommandLineProgram(createLogger(), {
    resolveScanOptions: () => ({ timeoutMs: 1, serverNameFilter: undefined, transport: "nethernet" }),
    resolveJoinOptions: () => ({
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
      raknetBackend: DEFAULT_RAKNET_BACKEND
    }),
    runScanCommand: async () => {
      called = true;
    },
    runJoinCommand: async () => undefined
  });
  await program.parseAsync(["node", "bedcraft", "scan"]);
  assert.equal(called, true);
});

void test("command line join dispatches to handler", async () => {
  let called = false;
  const program = createCommandLineProgram(createLogger(), {
    resolveScanOptions: () => ({ timeoutMs: 1, serverNameFilter: undefined, transport: "nethernet" }),
    resolveJoinOptions: () => ({
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
      raknetBackend: DEFAULT_RAKNET_BACKEND
    }),
    runScanCommand: async () => undefined,
    runJoinCommand: async () => {
      called = true;
    }
  });
  await program.parseAsync(["node", "bedcraft", "join", "--host", "127.0.0.1", "--account", "user"]);
  assert.equal(called, true);
});

void test("command line scan sets exit code on error", async () => {
  const previousExitCode = process.exitCode;
  const program = createCommandLineProgram(createLogger(), {
    resolveScanOptions: () => ({ timeoutMs: 1, serverNameFilter: undefined, transport: "nethernet" }),
    resolveJoinOptions: () => ({
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
      raknetBackend: DEFAULT_RAKNET_BACKEND
    }),
    runScanCommand: async () => {
      throw new Error("scan");
    },
    runJoinCommand: async () => undefined
  });
  await program.parseAsync(["node", "bedcraft", "scan"]);
  assert.equal(process.exitCode, 1);
  process.exitCode = previousExitCode;
});

void test("command line join sets exit code on error", async () => {
  const previousExitCode = process.exitCode;
  const program = createCommandLineProgram(createLogger(), {
    resolveScanOptions: () => ({ timeoutMs: 1, serverNameFilter: undefined, transport: "nethernet" }),
    resolveJoinOptions: () => ({
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
      raknetBackend: DEFAULT_RAKNET_BACKEND
    }),
    runScanCommand: async () => undefined,
    runJoinCommand: async () => {
      throw new Error("join");
    }
  });
  await program.parseAsync(["node", "bedcraft", "join", "--host", "127.0.0.1", "--account", "user"]);
  assert.equal(process.exitCode, 1);
  process.exitCode = previousExitCode;
});

void test("command line scan handles non-error rejection", async () => {
  const previousExitCode = process.exitCode;
  const program = createCommandLineProgram(createLogger(), {
    resolveScanOptions: () => ({ timeoutMs: 1, serverNameFilter: undefined, transport: "nethernet" }),
    resolveJoinOptions: () => ({
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
      raknetBackend: DEFAULT_RAKNET_BACKEND
    }),
    runScanCommand: async () => {
      throw "scan";
    },
    runJoinCommand: async () => undefined
  });
  await program.parseAsync(["node", "bedcraft", "scan"]);
  assert.equal(process.exitCode, 1);
  process.exitCode = previousExitCode;
});

void test("command line join handles non-error rejection", async () => {
  const previousExitCode = process.exitCode;
  const program = createCommandLineProgram(createLogger(), {
    resolveScanOptions: () => ({ timeoutMs: 1, serverNameFilter: undefined, transport: "nethernet" }),
    resolveJoinOptions: () => ({
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
      raknetBackend: DEFAULT_RAKNET_BACKEND
    }),
    runScanCommand: async () => undefined,
    runJoinCommand: async () => {
      throw "join";
    }
  });
  await program.parseAsync(["node", "bedcraft", "join", "--host", "127.0.0.1", "--account", "user"]);
  assert.equal(process.exitCode, 1);
  process.exitCode = previousExitCode;
});
