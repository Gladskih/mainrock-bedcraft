import type { Logger } from "pino";
import { DEFAULT_NAVIGATION_REPLAN_INTERVAL_MS, DEFAULT_NAVIGATION_WAYPOINT_REACHED_DISTANCE_BLOCKS } from "../constants.js";
import type { Vector3 } from "../bedrock/joinClientHelpers.js";
import { findNavigationPath, type NavigationGridCell } from "./navigationGridPathfinder.js";

type NavigationWaypointResolverOptions = {
  logger: Logger;
  isStandable: (cell: NavigationGridCell) => boolean | null;
  now?: () => number;
  replanIntervalMs?: number;
};

export type NavigationWaypointResolver = {
  resolveWaypoint: (position: Vector3, target: Vector3 | null) => Vector3 | null;
  clear: () => void;
};

const toCellKey = (cell: NavigationGridCell): string => `${cell.x}:${cell.y}:${cell.z}`;

const toGridCell = (position: Vector3): NavigationGridCell => ({
  x: Math.floor(position.x),
  y: Math.floor(position.y),
  z: Math.floor(position.z)
});

const toWaypoint = (cell: NavigationGridCell, currentY: number): Vector3 => ({
  x: cell.x + 0.5,
  y: currentY,
  z: cell.z + 0.5
});
const toVerticalStandabilityProbe = (
  origin: NavigationGridCell,
  isStandable: (cell: NavigationGridCell) => boolean | null
): Array<{ y: number; standable: boolean | null }> => {
  const samples: Array<{ y: number; standable: boolean | null }> = [];
  for (let deltaY = -2; deltaY <= 2; deltaY += 1) {
    const y = origin.y + deltaY;
    samples.push({ y, standable: isStandable({ x: origin.x, y, z: origin.z }) });
  }
  return samples;
};
const countStandableNeighbors = (
  origin: NavigationGridCell,
  isStandable: (cell: NavigationGridCell) => boolean | null
): number => {
  let standableCount = 0;
  for (let deltaX = -2; deltaX <= 2; deltaX += 1) {
    for (let deltaY = -2; deltaY <= 2; deltaY += 1) {
      for (let deltaZ = -2; deltaZ <= 2; deltaZ += 1) {
        if (deltaX === 0 && deltaY === 0 && deltaZ === 0) continue;
        if (isStandable({ x: origin.x + deltaX, y: origin.y + deltaY, z: origin.z + deltaZ }) !== true) continue;
        standableCount += 1;
      }
    }
  }
  return standableCount;
};

const isWaypointReached = (position: Vector3, waypoint: NavigationGridCell): boolean => {
  const deltaX = position.x - (waypoint.x + 0.5);
  const deltaZ = position.z - (waypoint.z + 0.5);
  return Math.hypot(deltaX, deltaZ) <= DEFAULT_NAVIGATION_WAYPOINT_REACHED_DISTANCE_BLOCKS;
};

export const createNavigationWaypointResolver = (
  options: NavigationWaypointResolverOptions
): NavigationWaypointResolver => {
  const now = options.now ?? (() => Date.now());
  const replanIntervalMs = options.replanIntervalMs ?? DEFAULT_NAVIGATION_REPLAN_INTERVAL_MS;
  let activePath: NavigationGridCell[] | null = null;
  let activeTargetKey: string | null = null;
  let nextPathIndex = 1;
  let lastPlanAtMs = Number.NEGATIVE_INFINITY;
  const clear = (): void => {
    activePath = null;
    activeTargetKey = null;
    nextPathIndex = 1;
    lastPlanAtMs = Number.NEGATIVE_INFINITY;
  };
  return {
    clear,
    resolveWaypoint: (position, target) => {
      if (!target) {
        clear();
        return null;
      }
      const start = toGridCell(position);
      const goal = toGridCell(target);
      const goalKey = toCellKey(goal);
      if (goalKey === toCellKey(start)) return target;
      const shouldReplan = activePath === null
        || activeTargetKey !== goalKey
        || now() - lastPlanAtMs >= replanIntervalMs;
      if (shouldReplan) {
        const path = findNavigationPath(start, goal, { isStandable: options.isStandable });
        if (!path || path.length < 2) {
          const startStandable = options.isStandable(start);
          const goalStandable = options.isStandable(goal);
          options.logger.error?.(
            {
              event: "navigation_path_unavailable",
              start,
              goal,
              startStandable,
              goalStandable,
              startVerticalProbe: toVerticalStandabilityProbe(start, options.isStandable),
              goalVerticalProbe: toVerticalStandabilityProbe(goal, options.isStandable),
              startNeighborStandableCount: countStandableNeighbors(start, options.isStandable),
              goalNeighborStandableCount: countStandableNeighbors(goal, options.isStandable)
            },
            "Navigation failed to build a path to the target"
          );
          throw new Error("Navigation path unavailable");
        }
        activePath = path;
        activeTargetKey = goalKey;
        nextPathIndex = 1;
        lastPlanAtMs = now();
        options.logger.info?.(
          { event: "navigation_path_ready", nodes: path.length, start, goal },
          "Navigation path computed"
        );
      }
      if (!activePath) throw new Error("Navigation path state is unexpectedly empty");
      while (nextPathIndex < activePath.length) {
        const nextCell = activePath[nextPathIndex];
        if (!nextCell || !isWaypointReached(position, nextCell)) break;
        nextPathIndex += 1;
      }
      if (nextPathIndex >= activePath.length) return target;
      const nextWaypointCell = activePath[nextPathIndex];
      if (!nextWaypointCell) throw new Error("Navigation waypoint index overflow");
      return toWaypoint(nextWaypointCell, position.y);
    }
  };
};
