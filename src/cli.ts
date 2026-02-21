#!/usr/bin/env node
import { createCommandLineProgram } from "./command-line/commandLine.js";
import { bridgePrismarineAuthConsoleMessages } from "./logging/consoleBridge.js";
import { createLogger } from "./logging/logger.js";

const logger = createLogger(process.env["BEDCRAFT_LOG_LEVEL"] ?? process.env["LOG_LEVEL"]);
const restoreConsole = bridgePrismarineAuthConsoleMessages(logger);
createCommandLineProgram(logger)
  .parseAsync(process.argv)
  .catch((error: unknown) => {
    logger.error({ event: "cli_error", error: error instanceof Error ? error.message : String(error) }, "CLI failed");
    process.exitCode = 1;
  })
  .finally(() => {
    restoreConsole();
  });
