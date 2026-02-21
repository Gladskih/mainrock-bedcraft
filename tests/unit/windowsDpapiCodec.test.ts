import assert from "node:assert/strict";
import { test } from "node:test";
import { createWindowsDpapiCodec } from "../../src/authentication/windowsDpapiCodec.js";

void test("createWindowsDpapiCodec uses runner for protect and unprotect", () => {
  const operations: string[] = [];
  const codec = createWindowsDpapiCodec((operation, payloadBase64) => {
    operations.push(operation);
    const payload = Buffer.from(payloadBase64, "base64");
    if (operation === "protect") return Buffer.concat([Buffer.from("p:"), payload]).toString("base64");
    return payload.subarray(2).toString("base64");
  });
  const protectedPayload = codec.protectData(Buffer.from("token-key"));
  assert.deepEqual(protectedPayload, Buffer.from("p:token-key"));
  assert.deepEqual(codec.unprotectData(protectedPayload), Buffer.from("token-key"));
  assert.deepEqual(operations, ["protect", "unprotect"]);
});

void test("createWindowsDpapiCodec rejects invalid runner output", () => {
  const codec = createWindowsDpapiCodec(() => "%%%");
  assert.throws(() => codec.protectData(Buffer.from("token-key")), { message: /invalid base64 payload/u });
});

void test("createWindowsDpapiCodec rejects empty runner output", () => {
  const codec = createWindowsDpapiCodec(() => "");
  assert.throws(() => codec.unprotectData(Buffer.from("token-key")), { message: /empty payload/u });
});

void test("createWindowsDpapiCodec rejects non-string runner output", () => {
  const codec = createWindowsDpapiCodec(() => undefined as unknown as string);
  assert.throws(() => codec.protectData(Buffer.from("token-key")), { message: /non-string payload/u });
});

void test("createWindowsDpapiCodec rejects trailing line ending from runner", () => {
  const codec = createWindowsDpapiCodec(() => `${Buffer.from("token-key").toString("base64")}\r\n`);
  assert.throws(() => codec.protectData(Buffer.from("ignored")), { message: /unexpected whitespace/u });
});

void test("createWindowsDpapiCodec rejects payload with internal whitespace", () => {
  const validBase64 = Buffer.from("token-key").toString("base64");
  const codec = createWindowsDpapiCodec(() => `${validBase64.slice(0, 4)} ${validBase64.slice(4)}`);
  assert.throws(() => codec.unprotectData(Buffer.from("ignored")), { message: /unexpected whitespace/u });
});
