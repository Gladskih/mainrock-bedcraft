import pino from "pino";
import type { Logger } from "pino";
import { APPLICATION_ID } from "../constants.js";

const DEFAULT_LOG_LEVEL = "info"; // Default CLI logging level.
const SERVICE_NAME = APPLICATION_ID; // Stable logger name for structured logs.

export const createLogger = (level?: string): Logger => {
  const options = {
    level: level ?? DEFAULT_LOG_LEVEL,
    base: { service: SERVICE_NAME },
    timestamp: pino.stdTimeFunctions.isoTime
  };
  return pino(options, process.stdout);
};
