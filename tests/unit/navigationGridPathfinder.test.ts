import assert from "node:assert/strict";
import { test } from "node:test";
import { findNavigationPath, type NavigationGridCell } from "../../src/bot/navigationGridPathfinder.js";

const toCellKey = (cell: NavigationGridCell): string => `${cell.x}:${cell.y}:${cell.z}`;

const createStandableResolver = (
  standableKeys: Set<string>,
  unknownKeys: Set<string> = new Set<string>()
): ((cell: NavigationGridCell) => boolean | null) => {
  return (cell) => {
    const key = toCellKey(cell);
    if (unknownKeys.has(key)) return null;
    return standableKeys.has(key);
  };
};

void test("findNavigationPath routes around blocked cardinal cell", () => {
  const standableKeys = new Set<string>();
  for (let x = -2; x <= 4; x += 1) {
    for (let z = -2; z <= 2; z += 1) {
      standableKeys.add(`${x}:1:${z}`);
    }
  }
  standableKeys.delete("1:1:0");
  const path = findNavigationPath(
    { x: 0, y: 1, z: 0 },
    { x: 2, y: 1, z: 0 },
    { isStandable: createStandableResolver(standableKeys) }
  );
  assert.equal(Array.isArray(path), true);
  assert.equal((path ?? []).some((cell) => cell.z !== 0), true);
});

void test("findNavigationPath allows one-block step up and down", () => {
  const standableKeys = new Set<string>([
    "0:1:0",
    "1:2:0",
    "2:1:0"
  ]);
  const path = findNavigationPath(
    { x: 0, y: 1, z: 0 },
    { x: 2, y: 1, z: 0 },
    {
      isStandable: createStandableResolver(standableKeys),
      maxSearchRadiusBlocks: 4
    }
  );
  assert.deepEqual(path, [
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 2, z: 0 },
    { x: 2, y: 1, z: 0 }
  ]);
});

void test("findNavigationPath returns null when target area is unknown", () => {
  const standableKeys = new Set<string>(["0:1:0"]);
  const unknownKeys = new Set<string>(["2:1:0", "1:1:0", "2:1:1", "2:1:-1", "2:2:0", "2:0:0"]);
  const path = findNavigationPath(
    { x: 0, y: 1, z: 0 },
    { x: 2, y: 1, z: 0 },
    { isStandable: createStandableResolver(standableKeys, unknownKeys) }
  );
  assert.equal(path, null);
});

void test("findNavigationPath respects max expanded node budget", () => {
  const standableKeys = new Set<string>();
  for (let x = -10; x <= 10; x += 1) {
    for (let z = -10; z <= 10; z += 1) {
      standableKeys.add(`${x}:1:${z}`);
    }
  }
  const path = findNavigationPath(
    { x: 0, y: 1, z: 0 },
    { x: 10, y: 1, z: 10 },
    {
      isStandable: createStandableResolver(standableKeys),
      maxExpandedNodes: 3
    }
  );
  assert.equal(path, null);
});

void test("findNavigationPath probes nearby standable start height when spawn cell is not standable", () => {
  const standableKeys = new Set<string>([
    "0:1:0",
    "1:1:0",
    "2:1:0"
  ]);
  const path = findNavigationPath(
    { x: 0, y: 2, z: 0 },
    { x: 2, y: 1, z: 0 },
    { isStandable: createStandableResolver(standableKeys) }
  );
  assert.deepEqual(path, [
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 1, z: 0 },
    { x: 2, y: 1, z: 0 }
  ]);
});
