import { test } from "node:test";
import assert from "node:assert/strict";
import { createChunkPublisherUpdateLogger } from "../../src/bedrock/joinClientChunkPublisherLogger.js";

void test("createChunkPublisherUpdateLogger logs first update as info and next updates as debug", () => {
  const infoCalls: unknown[][] = [];
  const debugCalls: unknown[][] = [];
  const logger = {
    info: (...args: unknown[]) => {
      infoCalls.push(args);
    },
    debug: (...args: unknown[]) => {
      debugCalls.push(args);
    }
  };
  const logChunkPublisherUpdate = createChunkPublisherUpdateLogger(logger as never);
  const packet = {
    coordinates: { x: 12, y: 60, z: 34 },
    radius: 160
  };
  logChunkPublisherUpdate(packet);
  logChunkPublisherUpdate(packet);
  assert.equal(infoCalls.length, 1);
  assert.equal(debugCalls.length, 1);
});
