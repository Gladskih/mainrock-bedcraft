# Bedcraft Bedrock LAN Client MVP

Bedrock LAN discovery and join MVP built on PrismarineJS (bedrock-protocol + prismarine-auth). This tool scans the local network for Bedrock LAN servers, pings for status, and joins a selected server using Microsoft device code authentication.

Modern Bedrock LAN hosted worlds use NetherNet (WebRTC over UDP `7551`) rather than classic RakNet discovery (`4445`) + server port (`19132`). This project supports both transports via `--transport`.

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

Select RakNet backend (default: `jsp-raknet` without native build tooling):

```bash
npm run join -- --host 192.168.1.50 --account "my-account" --raknet-backend native
```

Note: `join` disconnects after the first chunk is received to keep the MVP safe and minimal.

## Environment Variables

- `BEDCRAFT_ACCOUNT`: Required if `--account` is not provided.
- `BEDCRAFT_SERVER_NAME`: Default server name filter for scan/join.
- `BEDCRAFT_HOST`: Default host for `join`.
- `BEDCRAFT_PORT`: Default port for `join`.
- `BEDCRAFT_TRANSPORT`: `nethernet|raknet` (defaults to `nethernet`).
- `BEDCRAFT_DISCOVERY_TIMEOUT_MS`: Discovery timeout in milliseconds.
- `BEDCRAFT_CACHE_DIR`: Override token cache directory.
- `BEDCRAFT_CACHE_KEY_FILE`: Override cache key file path.
- `BEDCRAFT_CACHE_KEY`: Optional passphrase to derive the encryption key.
- `BEDCRAFT_LOG_LEVEL`: `trace|debug|info|warn|error|fatal`.
- `BEDCRAFT_FORCE_REFRESH`: Set to `true` to force a fresh login.
- `BEDCRAFT_SKIP_PING`: Set to `true` to skip the initial ping before join.
- `BEDCRAFT_RAKNET_BACKEND`: `native|js|node` or `raknet-native|jsp-raknet|raknet-node` (defaults to `jsp-raknet`).

## Authentication and Cache

Authentication uses Microsoft device code flow (no client secrets or password). Tokens are cached in an encrypted local cache. The encryption key is stored in the per-user config directory unless `BEDCRAFT_CACHE_KEY` is provided.

## Tests

```bash
npm run test:coverage
```

## Notes

- Uses Bedrock LAN discovery + status ping only; no gameplay packets in `scan`.
- No access to Minecraft installation files or UWP identity.
- Safe defaults: limited ping frequency, clean disconnect after validation.
