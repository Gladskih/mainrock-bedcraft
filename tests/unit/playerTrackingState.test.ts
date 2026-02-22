import assert from "node:assert/strict";
import { test } from "node:test";
import type { Logger } from "pino";
import { createPlayerTrackingState } from "../../src/bedrock/playerTrackingState.js";

const createLogger = (events: Array<{ event?: string }>): Logger => ({
  info: (fields: { event?: string }) => {
    events.push(fields);
  }
} as unknown as Logger);

void test("createPlayerTrackingState resolves follow target from add_player packet", () => {
  const events: Array<{ event?: string }> = [];
  const state = createPlayerTrackingState(createLogger(events), "TargetPlayer");
  state.handleAddPlayerPacket({ runtime_id: 10n, username: "targetplayer", position: { x: 3, y: 70, z: 4 } });
  const targetPosition = state.resolveFollowTargetPosition();
  assert.deepEqual(targetPosition, { x: 3, y: 70, z: 4 });
  assert.equal(events.some((event) => event.event === "follow_target_acquired"), true);
  assert.equal(events.some((event) => event.event === "player_seen"), true);
});

void test("createPlayerTrackingState updates local and tracked player positions on move", () => {
  const state = createPlayerTrackingState(createLogger([]), "TargetPlayer");
  state.setLocalRuntimeEntityId("1");
  state.handleAddPlayerPacket({ runtime_id: 2n, username: "TargetPlayer", position: { x: 0, y: 70, z: 0 } });
  let localPosition = { x: 0, y: 70, z: 0 };
  state.handleMovePlayerPacket({ runtime_id: 1, position: { x: 1, y: 70, z: 2 } }, (position) => {
    localPosition = position;
  });
  state.handleMovePlayerPacket({ runtime_id: 2, position: { x: 8, y: 70, z: 9 } }, () => undefined);
  assert.deepEqual(localPosition, { x: 1, y: 70, z: 2 });
  assert.deepEqual(state.resolveFollowTargetPosition(), { x: 8, y: 70, z: 9 });
});

void test("createPlayerTrackingState clears follow target on remove_entity packet", () => {
  const events: Array<{ event?: string }> = [];
  const state = createPlayerTrackingState(createLogger(events), "TargetPlayer");
  state.handleAddPlayerPacket({ runtime_id: 3n, username: "TargetPlayer", position: { x: 0, y: 70, z: 0 } });
  state.handleRemoveEntityPacket({ runtime_id: 3 });
  assert.equal(state.resolveFollowTargetPosition(), null);
  assert.equal(events.some((event) => event.event === "follow_target_lost"), true);
});

void test("createPlayerTrackingState does not use fallback target when explicit name is missing", () => {
  const events: Array<{ event?: string }> = [];
  const state = createPlayerTrackingState(createLogger(events), "UnknownPlayer");
  state.setLocalRuntimeEntityId("1");
  state.handleAddPlayerPacket({ runtime_id: 1n, username: "SrgGld", position: { x: 0, y: 70, z: 0 } });
  state.handleAddPlayerPacket({ runtime_id: 2n, username: "targetplayer", position: { x: 8, y: 70, z: 9 } });
  assert.equal(state.resolveFollowTargetPosition(), null);
  assert.equal(events.some((event) => event.event === "follow_target_fallback"), false);
});

void test("createPlayerTrackingState emits follow_target_missing when target entity no longer matches explicit name", () => {
  const events: Array<{ event?: string }> = [];
  const state = createPlayerTrackingState(createLogger(events), "TargetPlayer");
  state.handleAddPlayerPacket({ runtime_id: 2n, username: "TargetPlayer", position: { x: 5, y: 70, z: 5 } });
  assert.deepEqual(state.resolveFollowTargetPosition(), { x: 5, y: 70, z: 5 });
  state.handleAddPlayerPacket({ runtime_id: 2n, username: "Alex", position: { x: 6, y: 70, z: 6 } });
  assert.equal(state.resolveFollowTargetPosition(), null);
  assert.equal(events.some((event) => event.event === "follow_target_missing"), true);
});
