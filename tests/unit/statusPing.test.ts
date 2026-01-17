import assert from "node:assert/strict";
import { test } from "node:test";
import { pingServerStatus } from "../../src/bedrock/statusPing.js";

void test("pingServerStatus maps advertisement and latency", async () => {
  let call = 0;
  const status = await pingServerStatus("127.0.0.1", 19132, 50, {
    ping: async () => ({
      motd: "Server",
      name: "Server",
      levelName: "World",
      protocol: 754,
      version: "1.21.80",
      playersOnline: 1,
      playersMax: 10,
      serverId: "id",
      gamemodeId: 1,
      portV4: 19132,
      portV6: 19133
    }),
    now: () => {
      call += 1;
      return call === 1 ? 100 : 150;
    },
    withTimeout: async (promise) => promise
  });
  assert.equal(status.advertisement.motd, "Server");
  assert.equal(status.latencyMs, 50);
});
