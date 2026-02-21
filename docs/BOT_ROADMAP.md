# Bot Implementation Roadmap

## Scope

This document defines incremental delivery for a Bedrock LAN bot that runs on top of Prismarine components already used in this repository.

## Research Snapshot (2026-02-21)

- `bedrock-protocol` is a low-level Bedrock protocol library, suitable as transport/protocol foundation but not a full gameplay AI framework: https://github.com/PrismarineJS/bedrock-protocol
- `prismarine-auth` is the official Prismarine auth path for Microsoft/Xbox flows: https://github.com/PrismarineJS/prismarine-auth
- `mineflayer` ecosystem is mature for Java edition workflows; Bedrock support remains an open request in the main project issue tracker: https://github.com/PrismarineJS/mineflayer/issues/842
- `node-minecraft-protocol` is explicitly focused on Java Edition, which explains why Mineflayer plugin stacks do not directly solve Bedrock bot behavior in this repository: https://github.com/PrismarineJS/node-minecraft-protocol
- LAN-hosted Bedrock worlds use NetherNet signaling/transport semantics (already implemented in this repository): https://github.com/df-mc/nethernet-spec

## Delivery Strategy

1. Build a reliable online runtime first.
2. Add observability and world-state ingestion.
3. Add safe movement primitives and action pacing.
4. Add resource-aware planning and execution.
5. Add hazard handling (liquids, falling blocks, mobs).
6. Add strategy layer (goal selection profiles).

## Phase 0: Runtime Reliability

- [x] Keep `join` alive by default instead of exiting after first chunk.
- [x] Keep legacy MVP behavior behind `--disconnect-after-first-chunk`.
- [x] Ensure graceful shutdown on `SIGINT` without false failure logs.
- [x] Stream chunks after first chunk and log bounded progress events.
- [ ] Add reconnect policy with capped retries and jitter.
- [ ] Add explicit offline/online state machine with recovery transitions.

## Phase 1: World State Ingestion

- [ ] Introduce `BotWorldState` module with immutable snapshots.
- [ ] Track bot pose from authoritative server movement packets.
- [ ] Track nearby entities with add/update/remove lifecycle.
- [ ] Decode chunk payloads into block-access API.
- [ ] Build block query primitives: `getBlock`, `isSolid`, `isLiquid`, `isPassable`.
- [ ] Add unit tests for chunk decode and block query correctness.

## Phase 2: Resource Detection

- [ ] Define resource taxonomy for progression: wood, stone, coal, iron, food, shelter blocks.
- [ ] Implement scanner over loaded chunks with distance scoring.
- [ ] Maintain confidence and freshness for resource observations.
- [ ] Expose resource map to planner with deterministic serialization.
- [ ] Add tests for ore/tree detection in synthetic chunks.

## Phase 3: Real-Time Action Loop

- [ ] Add server-safe tick loop at fixed cadence with budget accounting.
- [ ] Add action queue with cooldown, cancellation, and timeout.
- [ ] Add anti-flood guards for movement and interaction packets.
- [ ] Add deterministic replay logs for debugging and regression tests.
- [ ] Add integration test harness with mocked packet timelines.

## Phase 4: Movement and Navigation

- [ ] Implement local collision and step feasibility checks.
- [ ] Implement A* pathfinding over dynamic voxel grid.
- [ ] Handle jumps, sprint toggles, and edge safety constraints.
- [ ] Add stuck detection and local replanning.
- [ ] Add traversal policies for liquids and fall risk limits.
- [ ] Validate movement timing against server correction packets.

## Phase 5: Interaction Primitives

- [ ] Add block breaking state machine with tool selection hooks.
- [ ] Add block placement with support/adjacency validation.
- [ ] Add inventory model from server inventory packets.
- [ ] Add crafting flow with recipe resolution and station requirements.
- [ ] Add consumption and basic hunger/health safety behavior.

## Phase 6: Hazard Handling

- [ ] Add lava/water danger zones to nav cost map.
- [ ] Add falling-block risk model (sand/gravel roofs).
- [ ] Add hostile-mob proximity response (escape/shelter).
- [ ] Add emergency shelter builder action.
- [ ] Add conservative combat fallback only when unavoidable.

## Phase 7: Goal Planner

- [ ] Implement hierarchical goals with prerequisites and costs.
- [ ] Generate initial survival plan from current world/inventory state.
- [ ] Replan on state changes or blocked actions.
- [ ] Add strategy profiles: speedrun, safe-survival, builder, collector.
- [ ] Add CLI option for goal profile selection.

## Phase 8: Validation

- [ ] Add scenario tests against packet recordings.
- [ ] Add LAN soak test script for long-running sessions.
- [ ] Add metrics for packet rate, action rate, correction rate, disconnect causes.
- [ ] Define release checklist for ban-safety and graceful recovery.

## Current Iteration Notes

- This iteration ships Phase 0 runtime improvements and a first planner scaffold (`src/bot/progressionPlan.ts`).
- This iteration also ships the first goal variant: `follow-player` with packet-based target tracking and patrol fallback while the target is out of range.
- Resource scanning, navigation, and gameplay execution are intentionally staged for subsequent increments to keep behavior measurable and safe.
