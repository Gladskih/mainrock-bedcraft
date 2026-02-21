# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- New `players` CLI command to join briefly, collect online player names from `player_list`/`add_player`, and disconnect automatically after a configurable wait window.
- Reconnect policy for `join` with capped retries, exponential backoff, and jitter (`--reconnect-retries`, `--reconnect-base-delay`, `--reconnect-max-delay`).
- Explicit join runtime state machine with validated transitions (`offline`, `auth_ready`, `discovering`, `connecting`, `online`, `retry_waiting`, `failed`).
- New immutable `BotWorldState` module (`src/bot/worldState.ts`) to persist local player/entity snapshots for future pathfinding and resource logic.

### Changed

- `join` runtime now supports dedicated player-list probe mode used by `players`, including bounded auto-disconnect timing.
- Logger output now omits level fields entirely (`level`/`severity`) and keeps only payload + `time` + `msg`.

## [0.3.0] - 2026-02-21

### Added

- GitHub Actions CI workflow for `lint`, `typecheck`, and unit test validation on `push`/`pull_request`.
- `docs/BOT_ROADMAP.md` with phased implementation plan for long-running bot behavior, world-state ingestion, navigation, and goal planning.
- Initial progression planner module (`src/bot/progressionPlan.ts`) with unit-tested task dependency/resource gating primitives.
- Movement loop module (`src/bot/movementLoop.ts`) that sends paced `player_auth_input` updates for safe-walk and follow-player goals.
- CLI and env goal controls: `--goal`, `--follow-player`, `BEDCRAFT_GOAL`, and `BEDCRAFT_FOLLOW_PLAYER`.
- Runtime player tracking state module for `add_player`/`move_player`/`remove_entity` handling and follow-target resolution.

### Changed

- `join` now stays connected by default and continues receiving chunk stream updates.
- Added CLI switch `--disconnect-after-first-chunk` and env override `BEDCRAFT_DISCONNECT_AFTER_FIRST_CHUNK` for legacy one-shot behavior.
- Added bounded runtime telemetry events (`chunk_progress`, `runtime_heartbeat`) to observe long sessions.
- Logger output switched to compact JSON format with `time` and `severity` fields; redundant `event` field is dropped from payload output.
- `follow-player` mode now patrols when target coordinates are unavailable and switches to pursuit when target entity packets are discovered.

### Fixed

- `SIGINT` shutdown path now exits join loop gracefully without reporting a false join failure.
- Prismarine auth console output (for example `[msa] Signed in with Microsoft`) is now bridged into structured logger output.

## [0.2.0] - 2026-02-21

### Added

- Windows DPAPI codec and key storage abstraction for authentication cache encryption keys.
- Focused cleanup helpers for client connection shutdown and recoverable parser error handling.
- Project governance documents: `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `LICENSE.md`.
- Additional unit test modules for DPAPI codec/storage, join host resolution, and connection cleanup paths.

### Changed

- Default RakNet backend switched to `raknet-native`.
- Removed `jsp-raknet` from user-selectable CLI options (`--raknet-backend native|node`).
- Updated dependency stack to `bedrock-protocol@^3.53.0` and `minecraft-data@^3.105.0` to support current protocol versions.
- `README.md` now documents architecture layering (Prismarine auth/protocol + custom NetherNet transport).

### Fixed

- NetherNet join flow now succeeds on current LAN host versions where previous builds reported `failed_client` due to version metadata mismatch.
- Join cleanup now more reliably closes backend-specific resources and avoids stale background processes in timeout/error paths.

## [0.1.0] - 2026-01-17

### Added

- Bedrock LAN discovery for NetherNet and RakNet transports.
- Status scan command with structured output.
- Join command with Microsoft device code authentication.
- Encrypted token cache and Windows DPAPI-protected key blob support.
- RakNet backend selection.
- Unit tests with branch coverage gate.
