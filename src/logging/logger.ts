import pino from "pino";
import type { Logger } from "pino";

const DEFAULT_LOG_LEVEL = "info"; // Default CLI logging level.

const withoutEventField = (value: Record<string, unknown>): Record<string, unknown> => {
  const fields = { ...value };
  delete fields["event"];
  return fields;
};

export const stripSeverityFieldFromJsonLine = (line: string): string => {
  if (line.length === 0) return line;
  const hasWindowsLineEnding = line.endsWith("\r\n");
  const hasUnixLineEnding = !hasWindowsLineEnding && line.endsWith("\n");
  const lineEnding = hasWindowsLineEnding ? "\r\n" : hasUnixLineEnding ? "\n" : "";
  const lineWithoutEnding = lineEnding.length > 0 ? line.slice(0, -lineEnding.length) : line;
  try {
    const parsedLine = JSON.parse(lineWithoutEnding) as Record<string, unknown>;
    if (!("severity" in parsedLine)) return line;
    const normalizedLine = { ...parsedLine };
    delete normalizedLine["severity"];
    return `${JSON.stringify(normalizedLine)}${lineEnding}`;
  } catch {
    return line;
  }
};

export const createLogger = (level?: string): Logger => {
  const options = {
    level: level ?? DEFAULT_LOG_LEVEL,
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label: string) => ({ severity: label }),
      log: withoutEventField
    },
    hooks: {
      streamWrite: stripSeverityFieldFromJsonLine
    }
  };
  return pino(options, process.stdout);
};
