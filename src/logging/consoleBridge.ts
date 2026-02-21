import type { Logger } from "pino";
import { inspect } from "node:util";

const MSA_PREFIX = "[msa]";

const toConsoleMessage = (value: unknown): string => {
  if (typeof value === "string") return value;
  return inspect(value, { depth: 4, compact: true, breakLength: Infinity });
};

const toJoinedMessage = (values: unknown[]): string => values.map((value) => toConsoleMessage(value)).join(" ");

const isPrismarineAuthMessage = (message: string): boolean => message.startsWith(MSA_PREFIX);

export const bridgePrismarineAuthConsoleMessages = (logger: Logger): (() => void) => {
  const originalConsoleInfo = console.info;
  const originalConsoleWarn = console.warn;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const wrapConsoleMethod = (originalMethod: (...args: unknown[]) => void, level: "info" | "warn" | "error") => (...args: unknown[]): void => {
    const message = toJoinedMessage(args);
    if (isPrismarineAuthMessage(message)) {
      logger[level]({ source: "prismarine-auth" }, message);
      return;
    }
    originalMethod(...args);
  };
  console.info = wrapConsoleMethod(originalConsoleInfo, "info");
  console.warn = wrapConsoleMethod(originalConsoleWarn, "warn");
  console.log = wrapConsoleMethod(originalConsoleLog, "info");
  console.error = wrapConsoleMethod(originalConsoleError, "error");
  return () => {
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  };
};
