import assert from "node:assert/strict";
import { test } from "node:test";
import { createLogger } from "../../src/logging/logger.js";

void test("createLogger sets level", () => {
  const logger = createLogger("debug");
  assert.equal(logger.level, "debug");
});

void test("createLogger defaults level", () => {
  const logger = createLogger(undefined);
  assert.equal(logger.level, "info");
});
