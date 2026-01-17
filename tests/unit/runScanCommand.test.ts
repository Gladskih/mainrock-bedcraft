import assert from "node:assert/strict";
import { test } from "node:test";
import type { Logger } from "pino";
import { runScanCommand } from "../../src/command-line/runScanCommand.js";
import { DEFAULT_NETHERNET_PORT } from "../../src/constants.js";

const createLogger = (events: string[]): Logger => ({
  info: (data: { event?: string }) => {
    if (data.event) events.push(data.event);
  },
  warn: (data: { event?: string }) => {
    if (data.event) events.push(data.event);
  }
} as unknown as Logger);

const server = {
  host: "127.0.0.1",
  port: 19132,
  advertisement: {
    motd: "Test Server",
    levelName: "World",
    protocol: 754,
    version: "1.21.80",
    playersOnline: 1,
    playersMax: 10,
    serverId: "id",
    gamemode: "",
    gamemodeId: null,
    portV4: 19132,
    portV6: null
  },
  lastSeenMs: 0
};

void test("runScanCommand logs empty scan", async () => {
  const events: string[] = [];
  await runScanCommand({ timeoutMs: 1, serverNameFilter: undefined, transport: "raknet" }, createLogger(events), {
    discoverLanServers: async () => [],
    discoverNethernetLanServers: async () => [],
    pingServerStatus: async () => {
      throw new Error("unexpected");
    },
    delay: async () => undefined
  });
  assert.equal(events.includes("scan_empty"), true);
});

void test("runScanCommand logs ping result", async () => {
  const events: string[] = [];
  await runScanCommand({ timeoutMs: 1, serverNameFilter: undefined, transport: "raknet" }, createLogger(events), {
    discoverLanServers: async () => [server],
    discoverNethernetLanServers: async () => [],
    pingServerStatus: async () => ({ host: "127.0.0.1", port: 19132, advertisement: server.advertisement, latencyMs: 10 }),
    delay: async () => undefined
  });
  assert.equal(events.includes("scan_result"), true);
});

void test("runScanCommand logs ping failure", async () => {
  const events: string[] = [];
  await runScanCommand({ timeoutMs: 1, serverNameFilter: undefined, transport: "raknet" }, createLogger(events), {
    discoverLanServers: async () => [server],
    discoverNethernetLanServers: async () => [],
    pingServerStatus: async () => {
      throw new Error("ping failed");
    },
    delay: async () => undefined
  });
  assert.equal(events.includes("scan_ping_failed"), true);
});

void test("runScanCommand logs non-error ping failure", async () => {
  const events: string[] = [];
  await runScanCommand({ timeoutMs: 1, serverNameFilter: undefined, transport: "raknet" }, createLogger(events), {
    discoverLanServers: async () => [server],
    discoverNethernetLanServers: async () => [],
    pingServerStatus: async () => {
      throw "ping failed";
    },
    delay: async () => undefined
  });
  assert.equal(events.includes("scan_ping_failed"), true);
});

void test("runScanCommand logs no match", async () => {
  const events: string[] = [];
  await runScanCommand({ timeoutMs: 1, serverNameFilter: "Missing", transport: "raknet" }, createLogger(events), {
    discoverLanServers: async () => [server],
    discoverNethernetLanServers: async () => [],
    pingServerStatus: async () => ({ host: "127.0.0.1", port: 19132, advertisement: server.advertisement, latencyMs: 10 }),
    delay: async () => undefined
  });
  assert.equal(events.includes("scan_no_match"), true);
});

void test("runScanCommand filters matching servers", async () => {
  const events: string[] = [];
  await runScanCommand({ timeoutMs: 1, serverNameFilter: "Test", transport: "raknet" }, createLogger(events), {
    discoverLanServers: async () => [server],
    discoverNethernetLanServers: async () => [],
    pingServerStatus: async () => ({ host: "127.0.0.1", port: 19132, advertisement: server.advertisement, latencyMs: 10 }),
    delay: async () => undefined
  });
  assert.equal(events.includes("scan_result"), true);
});

void test("runScanCommand logs nethernet result", async () => {
  const events: string[] = [];
  await runScanCommand({ timeoutMs: 1, serverNameFilter: undefined, transport: "nethernet" }, createLogger(events), {
    discoverLanServers: async () => [],
    discoverNethernetLanServers: async () => [{
      host: "127.0.0.1",
      port: DEFAULT_NETHERNET_PORT,
      senderId: 1n,
      serverData: {
        nethernetVersion: 1,
        serverName: "Test Server",
        levelName: "World",
        gameType: 1,
        playersOnline: 1,
        playersMax: 10,
        editorWorld: false,
        transportLayer: 0
      },
      lastSeenMs: 0,
      latencyMs: 10
    }],
    pingServerStatus: async () => {
      throw new Error("unexpected");
    },
    delay: async () => undefined
  });
  assert.equal(events.includes("scan_result"), true);
});

void test("runScanCommand logs nethernet no match", async () => {
  const events: string[] = [];
  await runScanCommand({ timeoutMs: 1, serverNameFilter: "Missing", transport: "nethernet" }, createLogger(events), {
    discoverLanServers: async () => [],
    discoverNethernetLanServers: async () => [{
      host: "127.0.0.1",
      port: DEFAULT_NETHERNET_PORT,
      senderId: 1n,
      serverData: {
        nethernetVersion: 1,
        serverName: "Test Server",
        levelName: "World",
        gameType: 1,
        playersOnline: 1,
        playersMax: 10,
        editorWorld: false,
        transportLayer: 0
      },
      lastSeenMs: 0,
      latencyMs: 10
    }],
    pingServerStatus: async () => {
      throw new Error("unexpected");
    },
    delay: async () => undefined
  });
  assert.equal(events.includes("scan_no_match"), true);
});

void test("runScanCommand logs nethernet empty scan", async () => {
  const events: string[] = [];
  await runScanCommand({ timeoutMs: 1, serverNameFilter: undefined, transport: "nethernet" }, createLogger(events), {
    discoverLanServers: async () => [],
    discoverNethernetLanServers: async () => [],
    pingServerStatus: async () => {
      throw new Error("unexpected");
    },
    delay: async () => undefined
  });
  assert.equal(events.includes("scan_empty"), true);
});
