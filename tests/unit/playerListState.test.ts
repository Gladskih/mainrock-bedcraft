import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlayerListState } from "../../src/bedrock/playerListState.js";

void test("createPlayerListState tracks add and remove packets", () => {
  const snapshots: string[][] = [];
  const state = createPlayerListState({ onUpdate: (players) => snapshots.push(players) });
  state.handlePlayerListPacket({
    records: {
      type: "add",
      records: [
        { uuid: "1", username: "TargetPlayer" },
        { uuid: "2", username: "SrgGld" }
      ]
    }
  });
  assert.deepEqual(state.getSnapshot(), ["SrgGld", "TargetPlayer"]);
  state.handlePlayerListPacket({
    records: {
      type: "remove",
      records: [{ uuid: "1" }]
    }
  });
  assert.deepEqual(state.getSnapshot(), ["SrgGld"]);
  assert.deepEqual(snapshots.at(-1), ["SrgGld"]);
});

void test("createPlayerListState adds names from add_player packets", () => {
  const state = createPlayerListState();
  state.handleAddPlayerPacket({ username: "Alex" });
  state.handleAddPlayerPacket({ username: "Alex" });
  state.handleAddPlayerPacket({ username: "Steve" });
  assert.deepEqual(state.getSnapshot(), ["Alex", "Steve"]);
});

void test("createPlayerListState ignores invalid payloads", () => {
  const state = createPlayerListState();
  state.handlePlayerListPacket(null);
  state.handlePlayerListPacket({});
  state.handlePlayerListPacket({ records: { type: "unknown", records: [] } });
  state.handlePlayerListPacket({ records: { type: "add", records: "bad" } });
  state.handlePlayerListPacket({ records: { type: "remove", records: [{ username: "NoUuid" }] } });
  state.handleAddPlayerPacket({ username: 42 });
  assert.deepEqual(state.getSnapshot(), []);
});
