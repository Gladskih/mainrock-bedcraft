# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- GitHub Actions CI workflow for `lint`, `typecheck`, and unit test validation on `push`/`pull_request`.

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
