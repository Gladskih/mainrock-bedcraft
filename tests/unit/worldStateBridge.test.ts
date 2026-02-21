import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorldStateBridge } from "../../src/bedrock/worldStateBridge.js";

void test("createWorldStateBridge tracks local player state from auth and start game", () => {
  const bridge = createWorldStateBridge();
  bridge.setAuthenticatedPlayerName("SrgGld");
  bridge.setLocalFromStartGame("100", "overworld", { x: 1, y: 64, z: 2 });
  const snapshot = bridge.getSnapshot();
  assert.equal(snapshot.localPlayer.runtimeEntityId, "100");
  assert.equal(snapshot.localPlayer.username, "SrgGld");
  assert.equal(snapshot.localPlayer.dimension, "overworld");
  assert.deepEqual(snapshot.localPlayer.position, { x: 1, y: 64, z: 2 });
});

void test("createWorldStateBridge tracks add and remove lifecycle", () => {
  const bridge = createWorldStateBridge();
  bridge.handleAddPlayerPacket({ runtime_id: 10n, username: "targetplayer", position: { x: 5, y: 70, z: 6 } });
  bridge.handleAddEntityPacket({ runtime_entity_id: 20n, position: { x: 9, y: 65, z: 7 } });
  assert.equal(Object.keys(bridge.getSnapshot().entities).length, 2);
  bridge.handleRemoveEntityPacket({ runtime_id: 10n });
  bridge.handleRemoveEntityPacket({ entity_id: 20n });
  assert.equal(Object.keys(bridge.getSnapshot().entities).length, 0);
});

void test("createWorldStateBridge updates local and remote positions", () => {
  const bridge = createWorldStateBridge();
  bridge.setAuthenticatedPlayerName("SrgGld");
  bridge.setLocalFromStartGame("1", "overworld", { x: 0, y: 64, z: 0 });
  bridge.handleAddPlayerPacket({ runtime_id: 2n, username: "targetplayer", position: { x: 2, y: 64, z: 2 } });
  let localPosition = { x: 0, y: 64, z: 0 };
  bridge.handleMovePlayerPacket({ runtime_id: 1n, position: { x: 1, y: 64, z: 1 } }, (position) => {
    localPosition = position;
  });
  bridge.handleMovePlayerPacket({ runtime_id: 2n, position: { x: 8, y: 64, z: 8 } }, () => undefined);
  bridge.handleMoveEntityPacket({ runtime_entity_id: 2n, position: { x: 9, y: 64, z: 9 } });
  const snapshot = bridge.getSnapshot();
  assert.deepEqual(localPosition, { x: 1, y: 64, z: 1 });
  assert.deepEqual(snapshot.localPlayer.position, { x: 1, y: 64, z: 1 });
  assert.deepEqual(snapshot.entities["2"]?.position, { x: 9, y: 64, z: 9 });
});

void test("createWorldStateBridge ignores invalid packets", () => {
  const bridge = createWorldStateBridge();
  const previousSnapshot = bridge.getSnapshot();
  bridge.handleAddPlayerPacket({ runtime_id: 10n });
  bridge.handleAddEntityPacket({ position: { x: 1, y: 1, z: 1 } });
  bridge.handleMovePlayerPacket({ runtime_id: 1n }, () => undefined);
  bridge.handleMoveEntityPacket({ runtime_id: 1n });
  bridge.handleRemoveEntityPacket({});
  assert.equal(bridge.getSnapshot(), previousSnapshot);
});
