import {
  DEFAULT_NAVIGATION_GOAL_PROBE_RADIUS_BLOCKS,
  DEFAULT_NAVIGATION_MAX_EXPANDED_NODES,
  DEFAULT_NAVIGATION_MAX_SEARCH_RADIUS_BLOCKS,
  DEFAULT_NAVIGATION_MAX_STEP_DOWN_BLOCKS,
  DEFAULT_NAVIGATION_MAX_STEP_UP_BLOCKS
} from "../constants.js";

export type NavigationGridCell = { x: number; y: number; z: number };

type NavigationGridNode = NavigationGridCell & { gScore: number; fScore: number; parentKey: string | null };

export type NavigationPathfinderOptions = {
  isStandable: (cell: NavigationGridCell) => boolean | null;
  maxExpandedNodes?: number;
  maxSearchRadiusBlocks?: number;
  maxStepUpBlocks?: number;
  maxStepDownBlocks?: number;
  goalProbeRadiusBlocks?: number;
};

const CARDINAL_NEIGHBORS: ReadonlyArray<Pick<NavigationGridCell, "x" | "z">> = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 }
];
const EXPLORATION_GOAL_LOCAL_RADIUS_BLOCKS = 8;

const toCellKey = (cell: NavigationGridCell): string => `${cell.x}:${cell.y}:${cell.z}`;

const toHeuristic = (left: NavigationGridCell, right: NavigationGridCell): number => {
  const deltaX = Math.abs(left.x - right.x);
  const deltaZ = Math.abs(left.z - right.z);
  const deltaY = Math.abs(left.y - right.y);
  return deltaX + deltaZ + deltaY * 0.5;
};

const toPath = (nodesByKey: Map<string, NavigationGridNode>, lastKey: string): NavigationGridCell[] => {
  const path: NavigationGridCell[] = [];
  let nextKey: string | null = lastKey;
  while (nextKey) {
    const node = nodesByKey.get(nextKey);
    if (!node) break;
    path.push({ x: node.x, y: node.y, z: node.z });
    nextKey = node.parentKey;
  }
  path.reverse();
  return path;
};

const toTargetCandidates = (target: NavigationGridCell, radius: number): NavigationGridCell[] => {
  const candidates: NavigationGridCell[] = [];
  for (let deltaX = -radius; deltaX <= radius; deltaX += 1) {
    for (let deltaY = -radius; deltaY <= radius; deltaY += 1) {
      for (let deltaZ = -radius; deltaZ <= radius; deltaZ += 1) {
        const distance = Math.abs(deltaX) + Math.abs(deltaY) + Math.abs(deltaZ);
        if (distance > radius) continue;
        candidates.push({ x: target.x + deltaX, y: target.y + deltaY, z: target.z + deltaZ });
      }
    }
  }
  candidates.sort((left, right) => {
    const leftDistance = Math.abs(left.x - target.x) + Math.abs(left.y - target.y) + Math.abs(left.z - target.z);
    const rightDistance = Math.abs(right.x - target.x) + Math.abs(right.y - target.y) + Math.abs(right.z - target.z);
    return leftDistance - rightDistance;
  });
  return candidates;
};

const resolveGoal = (
  target: NavigationGridCell,
  isStandable: NavigationPathfinderOptions["isStandable"],
  goalProbeRadiusBlocks: number
): NavigationGridCell | null => {
  for (const candidate of toTargetCandidates(target, goalProbeRadiusBlocks)) {
    if (isStandable(candidate) === true) return candidate;
  }
  return null;
};
const resolveStart = (
  start: NavigationGridCell,
  isStandable: NavigationPathfinderOptions["isStandable"],
  maxStepUpBlocks: number,
  maxStepDownBlocks: number
): NavigationGridCell | null => {
  if (isStandable(start) === true) return start;
  const maxProbeSteps = Math.max(maxStepUpBlocks, maxStepDownBlocks);
  for (let step = 1; step <= maxProbeSteps; step += 1) {
    if (step <= maxStepDownBlocks) {
      const lowerCandidate = { x: start.x, y: start.y - step, z: start.z };
      if (isStandable(lowerCandidate) === true) return lowerCandidate;
    }
    if (step <= maxStepUpBlocks) {
      const upperCandidate = { x: start.x, y: start.y + step, z: start.z };
      if (isStandable(upperCandidate) === true) return upperCandidate;
    }
  }
  return null;
};
const resolveExplorationGoal = (
  start: NavigationGridCell,
  target: NavigationGridCell,
  isStandable: NavigationPathfinderOptions["isStandable"],
  maxSearchRadiusBlocks: number,
  maxStepUpBlocks: number,
  maxStepDownBlocks: number
): NavigationGridCell | null => {
  const localSearchRadiusBlocks = Math.min(maxSearchRadiusBlocks, EXPLORATION_GOAL_LOCAL_RADIUS_BLOCKS);
  let bestCandidate: NavigationGridCell | null = null;
  let bestHeuristic = Number.POSITIVE_INFINITY;
  let bestDistanceFromStart = Number.NEGATIVE_INFINITY;
  for (let deltaX = -localSearchRadiusBlocks; deltaX <= localSearchRadiusBlocks; deltaX += 1) {
    for (let deltaZ = -localSearchRadiusBlocks; deltaZ <= localSearchRadiusBlocks; deltaZ += 1) {
      for (let deltaY = -maxStepDownBlocks; deltaY <= maxStepUpBlocks; deltaY += 1) {
        const candidate = { x: start.x + deltaX, y: start.y + deltaY, z: start.z + deltaZ };
        if (isStandable(candidate) !== true) continue;
        const distanceFromStart = Math.abs(deltaX) + Math.abs(deltaY) + Math.abs(deltaZ);
        if (distanceFromStart === 0) continue;
        const heuristic = toHeuristic(candidate, target);
        if (heuristic > bestHeuristic) continue;
        if (heuristic === bestHeuristic && distanceFromStart <= bestDistanceFromStart) continue;
        bestCandidate = candidate;
        bestHeuristic = heuristic;
        bestDistanceFromStart = distanceFromStart;
      }
    }
  }
  return bestCandidate;
};

const resolveVerticalOffsets = (maxStepUpBlocks: number, maxStepDownBlocks: number): number[] => {
  const offsets = [0];
  for (let step = 1; step <= maxStepUpBlocks; step += 1) offsets.push(step);
  for (let step = 1; step <= maxStepDownBlocks; step += 1) offsets.push(-step);
  return offsets;
};

const pickLowestFScoreIndex = (openKeys: string[], nodesByKey: Map<string, NavigationGridNode>): number => {
  let lowestIndex = 0;
  for (let index = 1; index < openKeys.length; index += 1) {
    const leftKey = openKeys[index];
    const rightKey = openKeys[lowestIndex];
    if (!leftKey || !rightKey) continue;
    const left = nodesByKey.get(leftKey);
    const right = nodesByKey.get(rightKey);
    if (!left || !right) continue;
    if (left.fScore >= right.fScore) continue;
    lowestIndex = index;
  }
  return lowestIndex;
};

const isWithinRadius = (
  origin: NavigationGridCell,
  candidate: NavigationGridCell,
  maxRadiusBlocks: number
): boolean => {
  return Math.abs(candidate.x - origin.x) <= maxRadiusBlocks && Math.abs(candidate.z - origin.z) <= maxRadiusBlocks;
};

export const findNavigationPath = (
  start: NavigationGridCell,
  target: NavigationGridCell,
  options: NavigationPathfinderOptions
): NavigationGridCell[] | null => {
  const maxExpandedNodes = options.maxExpandedNodes ?? DEFAULT_NAVIGATION_MAX_EXPANDED_NODES;
  const maxSearchRadiusBlocks = options.maxSearchRadiusBlocks ?? DEFAULT_NAVIGATION_MAX_SEARCH_RADIUS_BLOCKS;
  const maxStepUpBlocks = options.maxStepUpBlocks ?? DEFAULT_NAVIGATION_MAX_STEP_UP_BLOCKS;
  const maxStepDownBlocks = options.maxStepDownBlocks ?? DEFAULT_NAVIGATION_MAX_STEP_DOWN_BLOCKS;
  const goalProbeRadiusBlocks = options.goalProbeRadiusBlocks ?? DEFAULT_NAVIGATION_GOAL_PROBE_RADIUS_BLOCKS;
  const resolvedStart = resolveStart(start, options.isStandable, maxStepUpBlocks, maxStepDownBlocks);
  const goal = resolveGoal(target, options.isStandable, goalProbeRadiusBlocks)
    ?? resolveExplorationGoal(
      resolvedStart ?? start,
      target,
      options.isStandable,
      maxSearchRadiusBlocks,
      maxStepUpBlocks,
      maxStepDownBlocks
    );
  if (!goal || !resolvedStart) return null;
  if (toCellKey(goal) === toCellKey(resolvedStart) && toCellKey(target) !== toCellKey(resolvedStart)) return null;
  const startKey = toCellKey(resolvedStart);
  const goalKey = toCellKey(goal);
  const nodesByKey = new Map<string, NavigationGridNode>([
    [startKey, { ...resolvedStart, gScore: 0, fScore: toHeuristic(resolvedStart, goal), parentKey: null }]
  ]);
  const openKeys = [startKey];
  const closedKeys = new Set<string>();
  const verticalOffsets = resolveVerticalOffsets(maxStepUpBlocks, maxStepDownBlocks);
  let expandedNodes = 0;
  while (openKeys.length > 0) {
    const currentIndex = pickLowestFScoreIndex(openKeys, nodesByKey);
    const currentKey = openKeys.splice(currentIndex, 1)[0];
    if (!currentKey) continue;
    const currentNode = nodesByKey.get(currentKey);
    if (!currentNode) continue;
    if (currentKey === goalKey) return toPath(nodesByKey, currentKey);
    closedKeys.add(currentKey);
    expandedNodes += 1;
    if (expandedNodes > maxExpandedNodes) return null;
    for (const neighborOffset of CARDINAL_NEIGHBORS) {
      const baseNeighbor = {
        x: currentNode.x + neighborOffset.x,
        y: currentNode.y,
        z: currentNode.z + neighborOffset.z
      };
      if (!isWithinRadius(resolvedStart, baseNeighbor, maxSearchRadiusBlocks)) continue;
      for (const verticalOffset of verticalOffsets) {
        const neighbor = { ...baseNeighbor, y: baseNeighbor.y + verticalOffset };
        if (options.isStandable(neighbor) !== true) continue;
        const neighborKey = toCellKey(neighbor);
        if (closedKeys.has(neighborKey)) continue;
        const stepCost = 1 + Math.abs(verticalOffset) * 0.5;
        const tentativeGScore = currentNode.gScore + stepCost;
        const existingNode = nodesByKey.get(neighborKey);
        if (existingNode && tentativeGScore >= existingNode.gScore) continue;
        nodesByKey.set(neighborKey, {
          ...neighbor,
          gScore: tentativeGScore,
          fScore: tentativeGScore + toHeuristic(neighbor, goal),
          parentKey: currentKey
        });
        if (!openKeys.includes(neighborKey)) openKeys.push(neighborKey);
        break;
      }
    }
  }
  return null;
};
