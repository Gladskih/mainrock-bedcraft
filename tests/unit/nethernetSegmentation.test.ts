import assert from "node:assert/strict";
import { test } from "node:test";
import { NethernetSegmentReassembler, splitNethernetPayload } from "../../src/nethernet/segmentation.js";

void test("splitNethernetPayload returns one segment for small payload", () => {
  const payload = Buffer.from("hello");
  const segments = splitNethernetPayload(payload, 100);
  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.readUInt8(0), 0);
});

void test("splitNethernetPayload splits and reassembles large payload", () => {
  const payload = Buffer.alloc(25000, 7);
  const segments = splitNethernetPayload(payload, 10000);
  assert.equal(segments.length, 3);
  assert.equal(segments[0]?.readUInt8(0), 2);
  assert.equal(segments[1]?.readUInt8(0), 1);
  assert.equal(segments[2]?.readUInt8(0), 0);
  const reassembler = new NethernetSegmentReassembler();
  let completed: Buffer | null = null;
  for (const segment of segments) {
    const result = reassembler.consume(segment);
    if (result) completed = result;
  }
  assert.ok(completed);
  assert.equal(completed?.equals(payload), true);
});

void test("NethernetSegmentReassembler rejects unexpected segment order", () => {
  const reassembler = new NethernetSegmentReassembler();
  reassembler.consume(Buffer.concat([Buffer.from([1]), Buffer.from("a")]));
  assert.throws(() => reassembler.consume(Buffer.concat([Buffer.from([1]), Buffer.from("b")])));
});

void test("splitNethernetPayload rejects non-positive segment size", () => {
  assert.throws(() => splitNethernetPayload(Buffer.from([1]), 0));
});

void test("splitNethernetPayload rejects payload requiring too many segments", () => {
  assert.throws(() => splitNethernetPayload(Buffer.alloc(257, 1), 1));
});

void test("NethernetSegmentReassembler rejects segment missing header", () => {
  const reassembler = new NethernetSegmentReassembler();
  assert.throws(() => reassembler.consume(Buffer.alloc(0)));
});
