import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getProfileName,
  isLevelChunkPacket,
  isStartGamePacket,
  isVector3,
  readOptionalNumberField,
  readOptionalStringField,
  readPacketEventName,
  toChunkKey,
  toError
} from "../../src/bedrock/joinClientHelpers.js";

void test("isVector3 validates vector objects", () => {
  assert.equal(isVector3({ x: 1, y: 2, z: 3 }), true);
  assert.equal(isVector3({ x: 1, y: 2 }), false);
});

void test("isStartGamePacket and isLevelChunkPacket validate packet shape", () => {
  assert.equal(isStartGamePacket({}), true);
  assert.equal(isStartGamePacket(null), false);
  assert.equal(isLevelChunkPacket({ x: 1, z: 2 }), true);
  assert.equal(isLevelChunkPacket({ x: 1 }), false);
});

void test("readOptionalStringField and readPacketEventName read packet names", () => {
  assert.equal(readOptionalStringField({ status: "ok" }, "status"), "ok");
  assert.equal(readOptionalStringField({ status: 1 }, "status"), null);
  assert.equal(readPacketEventName({ data: { name: "start_game" } }), "start_game");
  assert.equal(readPacketEventName({ data: { name: 1 } }), null);
});

void test("readOptionalNumberField reads numeric values safely", () => {
  assert.equal(readOptionalNumberField({ radius: 12 }, "radius"), 12);
  assert.equal(readOptionalNumberField({ radius: "12.5" }, "radius"), 12.5);
  assert.equal(readOptionalNumberField({ radius: BigInt(12) }, "radius"), 12);
  assert.equal(readOptionalNumberField({ radius: "x" }, "radius"), null);
  assert.equal(readOptionalNumberField({ radius: BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1) }, "radius"), null);
});

void test("getProfileName reads profile safely", () => {
  assert.equal(getProfileName({ profile: { name: "Player" } }), "Player");
  assert.equal(getProfileName({ profile: {} }), "unknown");
  assert.equal(getProfileName(null), "unknown");
});

void test("toError normalizes unknown values", () => {
  const error = new Error("failure");
  assert.equal(toError(error), error);
  assert.equal(toError("failure").message, "failure");
});

void test("toChunkKey formats chunk coordinates", () => {
  assert.equal(toChunkKey(3, -5), "3:-5");
});
