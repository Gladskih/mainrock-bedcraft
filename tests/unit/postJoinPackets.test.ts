import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Logger } from "pino";
import { MAX_CHUNK_RADIUS_REQUEST_CHUNKS } from "../../src/constants.js";
import { configurePostJoinPackets } from "../../src/bedrock/postJoinPackets.js";

class FakeClient extends EventEmitter {
  queueCalls: Array<{ name: string; params: object }> = [];
  writeCalls: Array<{ name: string; params: object }> = [];
  queue(name: string, params: object): void {
    this.queueCalls.push({ name, params });
  }
  write(name: string, params: object): void {
    this.writeCalls.push({ name, params });
  }
  disconnect(): void {}
}

const createLogger = (
  events: Array<{ event?: string; serverChunkRadius?: number; effectiveChunkRadius?: number }>
): Logger => ({
  info: (entry: { event?: string; serverChunkRadius?: number; effectiveChunkRadius?: number }) => {
    events.push(entry);
  }
} as unknown as Logger);

void test("configurePostJoinPackets requests max chunk radius then applies soft cap", async () => {
  const client = new FakeClient();
  const events: Array<{ event?: string; serverChunkRadius?: number; effectiveChunkRadius?: number }> = [];
  const runtime = configurePostJoinPackets(client, createLogger(events), 1, 10);
  client.emit("join");
  await new Promise((resolve) => setTimeout(resolve, 20));
  const firstChunkRadiusRequest = client.queueCalls.find((call) => call.name === "request_chunk_radius");
  const firstChunkRadius = (firstChunkRadiusRequest?.params as { chunk_radius?: number } | undefined)?.chunk_radius;
  assert.equal(firstChunkRadius, MAX_CHUNK_RADIUS_REQUEST_CHUNKS);
  client.emit("chunk_radius_update", { chunk_radius: 24 });
  const chunkRadiusRequests = client.queueCalls.filter((call) => call.name === "request_chunk_radius");
  const lastChunkRadiusRequest = chunkRadiusRequests[chunkRadiusRequests.length - 1];
  assert.equal((lastChunkRadiusRequest?.params as { chunk_radius?: number } | undefined)?.chunk_radius, 10);
  assert.equal(events.some((event) => event.event === "chunk_radius_update" && event.serverChunkRadius === 24 && event.effectiveChunkRadius === 10), true);
  runtime.cleanup();
});

void test("configurePostJoinPackets keeps server radius when it is within soft cap", async () => {
  const client = new FakeClient();
  const runtime = configurePostJoinPackets(client, createLogger([]), 1, 12);
  client.emit("join");
  await new Promise((resolve) => setTimeout(resolve, 20));
  client.emit("chunk_radius_update", { chunk_radius: 8 });
  const chunkRadiusRequests = client.queueCalls.filter((call) => call.name === "request_chunk_radius");
  assert.equal(chunkRadiusRequests.length, 1);
  const requestedChunkRadius = (chunkRadiusRequests[0]?.params as { chunk_radius?: number } | undefined)?.chunk_radius;
  assert.equal(requestedChunkRadius, MAX_CHUNK_RADIUS_REQUEST_CHUNKS);
  runtime.cleanup();
});
