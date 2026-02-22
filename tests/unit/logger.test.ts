import assert from "node:assert/strict";
import { test } from "node:test";
import { createLogger, stripSeverityFieldFromJsonLine } from "../../src/logging/logger.js";

void test("createLogger sets level", () => {
  const logger = createLogger("debug");
  assert.equal(logger.level, "debug");
});

void test("createLogger defaults level", () => {
  const logger = createLogger(undefined);
  assert.equal(logger.level, "info");
});

void test("stripSeverityFieldFromJsonLine removes severity field", () => {
  assert.equal(
    stripSeverityFieldFromJsonLine("{\"severity\":\"info\",\"time\":\"2026-02-21T00:00:00.000Z\",\"msg\":\"hello\"}\n"),
    "{\"time\":\"2026-02-21T00:00:00.000Z\",\"msg\":\"hello\"}\n"
  );
});

void test("stripSeverityFieldFromJsonLine keeps non-json lines untouched", () => {
  assert.equal(stripSeverityFieldFromJsonLine("plain text"), "plain text");
});

void test("stripSeverityFieldFromJsonLine keeps json without severity untouched", () => {
  const line = "{\"time\":\"2026-02-21T00:00:00.000Z\",\"msg\":\"hello\"}\n";
  assert.equal(stripSeverityFieldFromJsonLine(line), line);
});

void test("stripSeverityFieldFromJsonLine handles windows line endings", () => {
  assert.equal(
    stripSeverityFieldFromJsonLine("{\"severity\":\"warn\",\"msg\":\"hello\"}\r\n"),
    "{\"msg\":\"hello\"}\r\n"
  );
});
