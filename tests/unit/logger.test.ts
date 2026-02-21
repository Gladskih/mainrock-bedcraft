import assert from "node:assert/strict";
import { test } from "node:test";
import { createLogger, normalizeInfoSeverityLine } from "../../src/logging/logger.js";

void test("createLogger sets level", () => {
  const logger = createLogger("debug");
  assert.equal(logger.level, "debug");
});

void test("createLogger defaults level", () => {
  const logger = createLogger(undefined);
  assert.equal(logger.level, "info");
});

void test("normalizeInfoSeverityLine removes null severity", () => {
  assert.equal(
    normalizeInfoSeverityLine("{\"severity\":\"info\",\"time\":\"t\",\"msg\":\"m\"}"),
    "{\"time\":\"t\",\"msg\":\"m\"}"
  );
});

void test("normalizeInfoSeverityLine keeps non-null severity", () => {
  assert.equal(
    normalizeInfoSeverityLine("{\"severity\":\"warn\",\"time\":\"t\",\"msg\":\"m\"}"),
    "{\"time\":\"t\",\"msg\":\"m\"}"
  );
});

void test("normalizeInfoSeverityLine keeps non-json input", () => {
  assert.equal(normalizeInfoSeverityLine("plain text"), "plain text");
});

void test("normalizeInfoSeverityLine preserves trailing newline", () => {
  assert.equal(
    normalizeInfoSeverityLine("{\"severity\":\"info\",\"time\":\"t\",\"msg\":\"m\"}\n"),
    "{\"time\":\"t\",\"msg\":\"m\"}\n"
  );
});
