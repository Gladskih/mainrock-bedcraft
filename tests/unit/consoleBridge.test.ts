import assert from "node:assert/strict";
import { test } from "node:test";
import type { Logger } from "pino";
import { bridgePrismarineAuthConsoleMessages } from "../../src/logging/consoleBridge.js";

void test("bridgePrismarineAuthConsoleMessages redirects msa messages to logger", () => {
  const forwardedInfo: string[] = [];
  const forwardedWarn: string[] = [];
  const forwardedLog: string[] = [];
  const forwardedError: string[] = [];
  const loggedInfo: Array<{ source: string; message: string }> = [];
  const loggedWarn: Array<{ source: string; message: string }> = [];
  const loggedError: Array<{ source: string; message: string }> = [];
  const originalConsoleInfo = console.info;
  const originalConsoleWarn = console.warn;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  console.info = (...args: unknown[]) => {
    forwardedInfo.push(args.map((value) => String(value)).join(" "));
  };
  console.warn = (...args: unknown[]) => {
    forwardedWarn.push(args.map((value) => String(value)).join(" "));
  };
  console.log = (...args: unknown[]) => {
    forwardedLog.push(args.map((value) => String(value)).join(" "));
  };
  console.error = (...args: unknown[]) => {
    forwardedError.push(args.map((value) => String(value)).join(" "));
  };
  const restore = bridgePrismarineAuthConsoleMessages({
    info: (fields: { source: string }, message: string) => {
      loggedInfo.push({ source: fields.source, message });
    },
    warn: (fields: { source: string }, message: string) => {
      loggedWarn.push({ source: fields.source, message });
    },
    error: (fields: { source: string }, message: string) => {
      loggedError.push({ source: fields.source, message });
    }
  } as unknown as Logger);
  try {
    console.info("[msa] Signed in with Microsoft");
    console.log("[msa] Device code flow started");
    console.error("[msa] Token refresh failed");
    console.warn("plain warning");
    assert.deepEqual(loggedInfo, [
      { source: "prismarine-auth", message: "[msa] Signed in with Microsoft" },
      { source: "prismarine-auth", message: "[msa] Device code flow started" }
    ]);
    assert.deepEqual(loggedWarn, []);
    assert.deepEqual(loggedError, [{ source: "prismarine-auth", message: "[msa] Token refresh failed" }]);
    assert.deepEqual(forwardedWarn, ["plain warning"]);
    assert.deepEqual(forwardedInfo, []);
    assert.deepEqual(forwardedLog, []);
    assert.deepEqual(forwardedError, []);
  } finally {
    restore();
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  }
});

void test("bridgePrismarineAuthConsoleMessages restores original console methods", () => {
  const forwardedInfo: string[] = [];
  const originalConsoleInfo = console.info;
  console.info = (...args: unknown[]) => {
    forwardedInfo.push(args.map((value) => String(value)).join(" "));
  };
  const restore = bridgePrismarineAuthConsoleMessages({
    info: () => undefined,
    warn: () => undefined
  } as unknown as Logger);
  try {
    restore();
    console.info("after restore");
    assert.deepEqual(forwardedInfo, ["after restore"]);
  } finally {
    console.info = originalConsoleInfo;
  }
});
