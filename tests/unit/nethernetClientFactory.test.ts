import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Authflow } from "prismarine-auth";
import type { Logger } from "pino";
import { createNethernetClient, disableBedrockEncryptionForNethernet } from "../../src/bedrock/joinClient.js";
import type { CreateNethernetClientDependencies } from "../../src/bedrock/joinClient.js";
import { DEFAULT_RAKNET_BACKEND } from "../../src/constants.js";

const createLogger = (): Logger => ({
  info: () => undefined
} as unknown as Logger);

const defaultAuthflow = { username: "user" } as Authflow;

void test("disableBedrockEncryptionForNethernet overrides startEncryption once", () => {
  const logs: Array<{ event?: string; mode?: string }> = [];
  const logger = { info: (data: { event?: string; mode?: string }) => logs.push(data) } as unknown as Logger;
  const client: { startEncryption: (iv: Buffer) => void } = { startEncryption: () => undefined };
  disableBedrockEncryptionForNethernet(client, logger);
  client.startEncryption(Buffer.alloc(16));
  client.startEncryption(Buffer.alloc(16));
  assert.equal(logs.filter((entry) => entry.event === "encryption" && entry.mode === "disabled_for_nethernet").length, 1);
});

void test("createNethernetClient wires up bedrock client and transport", () => {
  class FakeBedrockClient extends EventEmitter {
    initCalled = 0;
    connectCalled = 0;
    closeCalled = false;
    writeCalls: Array<{ name: string; params: object }> = [];
    connection: { close?: () => void } | null = { close: () => {
      this.closeCalled = true;
    } };
    startEncryption: (iv: Buffer) => void = () => undefined;
    init(): void {
      this.initCalled += 1;
    }
    connect(): void {
      this.connectCalled += 1;
    }
    write(name: string, params: object): void {
      this.writeCalls.push({ name, params });
    }
    queue(name: string, params: object): void {
      this.write(name, params);
    }
    disconnect(): void {}
  }
  const fakeBedrockClient = new FakeBedrockClient();
  const receivedClientOptions: Array<{ delayedInit?: boolean }> = [];
  const transport = {} as unknown as ReturnType<CreateNethernetClientDependencies["createNethernetRakClient"]>;
  const dependencies: CreateNethernetClientDependencies = {
    createBedrockClient: (options) => {
      receivedClientOptions.push(options as unknown as { delayedInit?: boolean });
      return fakeBedrockClient;
    },
    createNethernetRakClient: () => transport
  };
  const client = createNethernetClient(
    {
      host: "127.0.0.1",
      port: 7551,
      username: "user",
      authflow: defaultAuthflow,
      flow: "live",
      deviceType: "Nintendo",
      skipPing: true,
      raknetBackend: DEFAULT_RAKNET_BACKEND,
      conLog: null
    },
    createLogger(),
    1n,
    2n,
    dependencies
  );
  assert.equal(receivedClientOptions.some((options) => options.delayedInit === true), true);
  assert.equal(fakeBedrockClient.initCalled, 1);
  assert.equal(fakeBedrockClient.closeCalled, true);
  assert.equal((client as unknown as { connection?: unknown }).connection, transport);
  (client as unknown as { queue: (name: string, params: object) => void }).queue("test", {});
  assert.equal(fakeBedrockClient.writeCalls.some((call) => call.name === "test"), true);
  assert.equal(fakeBedrockClient.connectCalled, 1);
});
