import assert from "node:assert/strict";
import { test } from "node:test";
import { createBotWorldState } from "../../src/bot/worldState.js";

void test("createBotWorldState starts with immutable empty snapshot", () => {
  const worldState = createBotWorldState(() => 100);
  const snapshot = worldState.getSnapshot();
  assert.equal(snapshot.updatedAtMs, 100);
  assert.equal(snapshot.localPlayer.runtimeEntityId, null);
  assert.equal(Object.keys(snapshot.entities).length, 0);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.localPlayer), true);
  assert.equal(Object.isFrozen(snapshot.entities), true);
});

void test("createBotWorldState updates local identity and pose immutably", () => {
  let nowValue = 0;
  const worldState = createBotWorldState(() => {
    nowValue += 10;
    return nowValue;
  });
  const previousSnapshot = worldState.getSnapshot();
  worldState.setLocalIdentity("1001", "SrgGld");
  worldState.setLocalPose("overworld", { x: 12, y: 64, z: -4 });
  const nextSnapshot = worldState.getSnapshot();
  assert.equal(previousSnapshot.localPlayer.runtimeEntityId, null);
  assert.equal(previousSnapshot.localPlayer.username, null);
  assert.equal(nextSnapshot.localPlayer.runtimeEntityId, "1001");
  assert.equal(nextSnapshot.localPlayer.username, "SrgGld");
  assert.equal(nextSnapshot.localPlayer.dimension, "overworld");
  assert.deepEqual(nextSnapshot.localPlayer.position, { x: 12, y: 64, z: -4 });
  assert.equal(nextSnapshot.updatedAtMs, 30);
});

void test("createBotWorldState manages entity lifecycle", () => {
  let nowValue = 100;
  const worldState = createBotWorldState(() => {
    nowValue += 1;
    return nowValue;
  });
  worldState.upsertEntity("2002", "targetplayer", { x: 1, y: 62, z: 3 });
  worldState.updateEntityPosition("2002", { x: 2, y: 62, z: 4 });
  worldState.removeEntity("2002");
  const snapshot = worldState.getSnapshot();
  assert.equal(Object.keys(snapshot.entities).length, 0);
});

void test("createBotWorldState ignores updates for unknown entities", () => {
  const worldState = createBotWorldState(() => 7);
  const previousSnapshot = worldState.getSnapshot();
  worldState.updateEntityPosition("missing", { x: 0, y: 0, z: 0 });
  worldState.removeEntity("missing");
  assert.equal(worldState.getSnapshot(), previousSnapshot);
});
