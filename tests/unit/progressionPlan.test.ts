import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getAvailableProgressionTasks,
  getDefaultProgressionPlan,
  type ProgressionTaskId,
  type ResourceType
} from "../../src/bot/progressionPlan.js";

const toSet = <T>(values: ReadonlyArray<T>): ReadonlySet<T> => new Set(values);

void test("getDefaultProgressionPlan returns stable ordered tasks", () => {
  const plan = getDefaultProgressionPlan();
  assert.equal(plan.length > 0, true);
  assert.equal(plan[0]?.id, "collect_logs");
  assert.equal(plan[plan.length - 1]?.id, "craft_iron_pickaxe");
});

void test("getAvailableProgressionTasks gates by prerequisites", () => {
  const completed = toSet<ProgressionTaskId>([]);
  const resources = toSet<ResourceType>([]);
  const available = getAvailableProgressionTasks(completed, resources);
  assert.deepEqual(available.map((task) => task.id), ["collect_logs"]);
});

void test("getAvailableProgressionTasks unlocks follow-up tasks", () => {
  const completed = toSet<ProgressionTaskId>(["collect_logs"]);
  const resources = toSet<ResourceType>(["log", "planks"]);
  const available = getAvailableProgressionTasks(completed, resources);
  assert.equal(available.some((task) => task.id === "craft_planks"), true);
  assert.equal(available.some((task) => task.id === "craft_sticks"), false);
});

void test("getAvailableProgressionTasks filters completed tasks", () => {
  const completed = toSet<ProgressionTaskId>(["collect_logs", "craft_planks"]);
  const resources = toSet<ResourceType>(["log", "planks", "sticks"]);
  const available = getAvailableProgressionTasks(completed, resources);
  assert.equal(available.some((task) => task.id === "craft_planks"), false);
});
