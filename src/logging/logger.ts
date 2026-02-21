import pino from "pino";
import type { Logger } from "pino";

const DEFAULT_LOG_LEVEL = "info"; // Default CLI logging level.

const withoutEventField = (value: Record<string, unknown>): Record<string, unknown> => {
  const fields = { ...value };
  delete fields["event"];
  return fields;
};

export const normalizeInfoSeverityLine = (line: string): string => {
  if (line.length === 0) return line;
  const endsWithCarriageReturnLineFeed = line.endsWith("\r\n");
  const endsWithLineFeed = !endsWithCarriageReturnLineFeed && line.endsWith("\n");
  const lineWithoutLineEnding = endsWithCarriageReturnLineFeed
    ? line.slice(0, -2)
    : endsWithLineFeed
      ? line.slice(0, -1)
      : line;
  const lineEnding = endsWithCarriageReturnLineFeed ? "\r\n" : endsWithLineFeed ? "\n" : "";
  try {
    const parsed = JSON.parse(lineWithoutLineEnding) as Record<string, unknown>;
    if (!("severity" in parsed)) return line;
    const normalized = { ...parsed };
    delete normalized["severity"];
    return `${JSON.stringify(normalized)}${lineEnding}`;
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
      streamWrite: normalizeInfoSeverityLine
    }
  };
  return pino(options, process.stdout);
};
