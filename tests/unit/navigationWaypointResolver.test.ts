import assert from "node:assert/strict";
import { test } from "node:test";
import type { Logger } from "pino";
import { createNavigationWaypointResolver } from "../../src/bot/navigationWaypointResolver.js";
import type { NavigationGridCell } from "../../src/bot/navigationGridPathfinder.js";

const toCellKey = (cell: NavigationGridCell): string => `${cell.x}:${cell.y}:${cell.z}`;

const createOpenPlaneStandability = (): ((cell: NavigationGridCell) => boolean | null) => {
  return (cell) => cell.y === 1;
};

void test("createNavigationWaypointResolver returns next waypoint on planned path", () => {
  const infoEvents: Array<{ event?: string }> = [];
  const logger = {
    info: (payload: { event?: string }) => infoEvents.push(payload),
    error: () => undefined
  } as unknown as Logger;
  const resolver = createNavigationWaypointResolver({
    logger,
    isStandable: createOpenPlaneStandability()
  });
  const waypoint = resolver.resolveWaypoint({ x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 0 });
  assert.equal(waypoint !== null, true);
  assert.equal((waypoint?.x ?? 0) > 0.5, true);
  assert.equal((waypoint?.x ?? 0) < 2.5, true);
  assert.equal(infoEvents.some((event) => event.event === "navigation_path_ready"), true);
});

void test("createNavigationWaypointResolver throws when no path is available", () => {
  const standableKeys = new Set<string>(["0:1:0"]);
  const resolver = createNavigationWaypointResolver({
    logger: { info: () => undefined, error: () => undefined } as unknown as Logger,
    isStandable: (cell) => standableKeys.has(toCellKey(cell))
  });
  assert.throws(() => resolver.resolveWaypoint({ x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 0 }));
});

void test("createNavigationWaypointResolver clears state when target disappears", () => {
  const resolver = createNavigationWaypointResolver({
    logger: { info: () => undefined, error: () => undefined } as unknown as Logger,
    isStandable: createOpenPlaneStandability()
  });
  const firstWaypoint = resolver.resolveWaypoint({ x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 0 });
  assert.equal(firstWaypoint !== null, true);
  assert.equal(resolver.resolveWaypoint({ x: 0, y: 1, z: 0 }, null), null);
  const secondWaypoint = resolver.resolveWaypoint({ x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 0 });
  assert.equal(secondWaypoint !== null, true);
});

