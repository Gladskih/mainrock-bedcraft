# Bedcraft Bedrock LAN Client MVP

Bedrock LAN discovery and join MVP built on PrismarineJS (bedrock-protocol + prismarine-auth). This tool scans the local network for Bedrock LAN servers, pings for status, and joins a selected server using Microsoft device code authentication.

Modern Bedrock LAN hosted worlds use NetherNet (WebRTC over UDP `7551`) rather than classic RakNet discovery (`4445`) + server port (`19132`). This project supports both transports via `--transport`.

## Architecture

- `prismarine-auth` handles Microsoft/Xbox authentication.
- `bedrock-protocol` handles Bedrock packet pipeline (login, start_game, chunks, events).
- `src/nethernet/*` provides a custom NetherNet transport layer for LAN-hosted worlds and is injected under `bedrock-protocol` when `--transport nethernet` is used.
- `src/bot/*` contains higher-level bot planning primitives (progression task graph and future behavior modules).
- `--transport raknet` uses standard RakNet transport via `bedrock-protocol`.

## Requirements

- Windows 10/11
- Node.js LTS (>= 20)

## Install

```bash
npm install
```

## Commands

Scan for LAN servers and show status:

```bash
npm run scan -- --timeout 5000
```

Scan using classic RakNet LAN discovery (MCPE multicast advertisements + RakNet ping):

```bash
npm run scan -- --transport raknet
```

Join a server by name (device code flow will open in your browser):

```bash
npm run join -- --name "My Server" --account "my-account"
```

Join a server by host/port (RakNet):

```bash
npm run join -- --transport raknet --host 192.168.1.50 --port 19132 --account "my-account"
```

Skip the initial server ping (useful when ping is blocked):

```bash
npm run join -- --host 192.168.1.50 --account "my-account" --skip-ping
```

Select RakNet backend (default: `raknet-native`):

```bash
npm run join -- --host 192.168.1.50 --account "my-account" --raknet-backend native
```

Force legacy one-shot behavior (disconnect after first chunk):

```bash
npm run join -- --name "My Server" --account "my-account" --disconnect-after-first-chunk
```

Follow a specific player once visible to the bot:

```bash
npm run join -- --name "My Server" --account "my-account" --goal follow-player --follow-player "TargetPlayer"
```

Probe current online player names (join briefly, collect `player_list`, then disconnect):

```bash
npm run players -- --name "My Server" --account "my-account" --wait 10000
```

Default behavior: `join` stays connected, keeps receiving chunk stream updates, and runs until you stop the process (for example, `Ctrl+C`).
While connected, the bot uses `--goal safe-walk` by default and sends paced `player_auth_input` packets.
In `follow-player` mode, if the target player is not yet visible in server entity packets, the bot patrols and keeps searching.

## Development Commands

```bash
npm run lint
npm run typecheck
npm run test:quick
npm run test:module -- tests/unit/<module>.test.ts
npm run test:coverage
npm run build
```

## Environment Variables

- `BEDCRAFT_ACCOUNT`: Required if `--account` is not provided.
- `BEDCRAFT_SERVER_NAME`: Default server name filter for scan/join.
- `BEDCRAFT_HOST`: Default host for `join`.
- `BEDCRAFT_PORT`: Default port for `join`.
- `BEDCRAFT_TRANSPORT`: `nethernet|raknet` (defaults to `nethernet`).
- `BEDCRAFT_DISCOVERY_TIMEOUT_MS`: Discovery timeout in milliseconds.
- `BEDCRAFT_CACHE_DIR`: Override token cache directory.
- `BEDCRAFT_CACHE_KEY_FILE`: Override encrypted key blob file path.
- `BEDCRAFT_CACHE_KEY`: Optional passphrase to override OS-backed key storage.
- `BEDCRAFT_LOG_LEVEL`: `trace|debug|info|warn|error|fatal`.
- `BEDCRAFT_FORCE_REFRESH`: Set to `true` to force a fresh login.
- `BEDCRAFT_SKIP_PING`: Set to `true` to skip the initial ping before join.
- `BEDCRAFT_DISCONNECT_AFTER_FIRST_CHUNK`: Set to `true` to keep legacy one-shot join behavior.
- `BEDCRAFT_RAKNET_BACKEND`: `native|node` or `raknet-native|raknet-node` (defaults to `raknet-native`).
- `BEDCRAFT_GOAL`: `safe-walk|follow-player` (defaults to `safe-walk`).
- `BEDCRAFT_FOLLOW_PLAYER`: Target player name for `follow-player` goal.
- `BEDCRAFT_PLAYERS_WAIT_MS`: Probe window for `players` command after login.

## Authentication and Cache

Authentication uses Microsoft device code flow (no client secrets or password). Tokens are cached in an encrypted local cache. On Windows, the cache encryption key is protected with DPAPI (CurrentUser scope) before being persisted to disk.

Device-code browser behavior is controlled by Microsoft identity policies. If there is no active Microsoft browser session, or if risk-based checks trigger re-authentication, the browser will request full sign-in (password/MFA) instead of a single "Allow" confirmation.

## Testing RakNet Transport

`scan` in RakNet mode only discovers LAN advertisements. It does not discover public internet servers.

To validate RakNet quickly:

1. Start an official Bedrock Dedicated Server on your LAN (`UDP 19132`).
2. Run `npm run scan -- --transport raknet`.
3. Run `npm run join -- --transport raknet --host <server-ip> --port 19132 --account <account>`.

Verification status as of February 7, 2026:

- Public RakNet probes were run against `mco.lbsg.net`, `geo.hivebedrock.network`, `play.cubecraft.net`, and `play.galaxite.net`.
- `raknet-native` reliably receives server packets on those targets.
- `raknet-node` can ping public targets but did not establish a session on tested public targets (timeouts and protocol errors).
- Full authenticated public join is still marked unverified in this repo because it requires an interactive Microsoft device-code login during test execution.

## Why `jsp-raknet` Was Removed

- Official Bedrock Dedicated Server docs do not define low-level RakNet handshake constants; they cover setup/hosting only: https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/getting-started?view=minecraft-bedrock-stable
- Bedrock protocol reference used by server implementers documents `Open Connection Request 1` with protocol version `11` (currently): https://wiki.bedrock.dev/servers/raknet
- The `jsp-raknet` upstream package itself is marked unstable in its npm page/readme, and the repository is archived:
  - https://www.npmjs.com/package/jsp-raknet/v/2.2.0
  - https://github.com/JSPrismarine/RakNet
- In this project, `jsp-raknet` repeatedly failed against public Bedrock targets (timeouts/rejections), so it is no longer exposed as a selectable backend.

## Tests

```bash
npm run test:coverage
```

## Notes

- Uses Bedrock LAN discovery + status ping only; no gameplay packets in `scan`.
- No access to Minecraft installation files or UWP identity.
- Safe defaults: limited ping frequency, clean disconnect after validation.
- Logs are compact JSON with `time` (plus payload and `msg`) and intentionally omit level fields (`level`/`severity`).

## Project Policies

- `SECURITY.md`: security policy and reporting process.
- `CONTRIBUTING.md`: development workflow and contribution guidelines.
- `CODE_OF_CONDUCT.md`: collaboration standards.
- `CHANGELOG.md`: release history.
- `SUPPORT.md`: support expectations and scope.
- `LICENSE.md`: license text.
