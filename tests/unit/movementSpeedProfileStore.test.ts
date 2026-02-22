import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import {
  createMovementSpeedProfileStore,
  toMovementSpeedProfileKey
} from "../../src/bot/movementSpeedProfileStore.js";

void test("movement speed profile store reads null for unknown key", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "movement-speed-profile-"));
  const profileStore = createMovementSpeedProfileStore(join(directoryPath, "profiles.json"));
  const speed = await profileStore.readSpeed("missing");
  assert.equal(speed, null);
});

void test("movement speed profile store persists and loads speed", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "movement-speed-profile-"));
  const profileStore = createMovementSpeedProfileStore(join(directoryPath, "profiles.json"));
  const profileKey = toMovementSpeedProfileKey({
    transport: "nethernet",
    host: "192.168.1.50",
    port: 7551,
    serverId: "999"
  });
  await profileStore.writeSpeed(profileKey, 1.37);
  const loadedSpeed = await profileStore.readSpeed(profileKey);
  assert.equal(loadedSpeed, 1.37);
});

void test("movement speed profile store ignores invalid speed values", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "movement-speed-profile-"));
  const profileStore = createMovementSpeedProfileStore(join(directoryPath, "profiles.json"));
  await profileStore.writeSpeed("invalid-speed", Number.NaN);
  const loadedSpeed = await profileStore.readSpeed("invalid-speed");
  assert.equal(loadedSpeed, null);
});

void test("toMovementSpeedProfileKey prefers server id when available", () => {
  const byId = toMovementSpeedProfileKey({
    transport: "nethernet",
    host: "192.168.1.50",
    port: 7551,
    serverId: "42"
  });
  const byHost = toMovementSpeedProfileKey({
    transport: "raknet",
    host: "LocalHost",
    port: 19132,
    serverId: null
  });
  assert.equal(byId, "nethernet|id:42");
  assert.equal(byHost, "raknet|host:localhost|port:19132");
});
