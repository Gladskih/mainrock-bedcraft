import pino from "pino";
import type { Logger } from "pino";

const DEFAULT_LOG_LEVEL = "info"; // Default CLI logging level.

const withoutEventField = (value: Record<string, unknown>): Record<string, unknown> => {
  const fields = { ...value };
  delete fields["event"];
  return fields;
};

export const createLogger = (level?: string): Logger => {
  const options = {
    level: level ?? DEFAULT_LOG_LEVEL,
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label: string) => ({ severity: label }),
      log: withoutEventField
    }
  };
  return pino(options, process.stdout);
};
