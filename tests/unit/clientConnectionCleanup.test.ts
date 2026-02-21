import assert from "node:assert/strict";
import { test } from "node:test";
import { disconnectClient, isRecoverableReadError } from "../../src/bedrock/clientConnectionCleanup.js";
import type { ClientLike } from "../../src/bedrock/clientTypes.js";

void test("disconnectClient closes all known transport layers", () => {
  let disconnectCalled = 0;
  let connectionClosed = 0;
  let raknetClosed = 0;
  let wrappedClientClosed = 0;
  disconnectClient({
    disconnect: () => {
      disconnectCalled += 1;
    },
    connection: {
      close: () => {
        connectionClosed += 1;
      },
      raknet: {
        close: () => {
          raknetClosed += 1;
        },
        client: {
          close: () => {
            wrappedClientClosed += 1;
          }
        }
      }
    }
  } as unknown as ClientLike);
  assert.equal(disconnectCalled, 1);
  assert.equal(connectionClosed, 1);
  assert.equal(raknetClosed, 1);
  assert.equal(wrappedClientClosed, 1);
});

void test("disconnectClient tolerates cleanup errors", () => {
  assert.doesNotThrow(() => disconnectClient({
    disconnect: () => {
      throw new Error("disconnect failed");
    },
    connection: {
      close: () => {
        throw new Error("connection close failed");
      },
      raknet: {
        close: () => {
          throw new Error("raknet close failed");
        },
        client: {
          close: () => {
            throw new Error("client close failed");
          }
        }
      }
    }
  } as unknown as ClientLike));
});

void test("disconnectClient ignores missing or non-function close fields", () => {
  assert.doesNotThrow(() => disconnectClient({
    disconnect: () => undefined,
    connection: {
      close: "not a function",
      raknet: {
        close: undefined,
        client: {
          close: null
        }
      }
    }
  } as unknown as ClientLike));
});

void test("isRecoverableReadError detects recoverable parser errors", () => {
  assert.equal(isRecoverableReadError({ message: "Read error for undefined : Missing characters in string" }), true);
  assert.equal(isRecoverableReadError({ message: "Connect timed out" }), false);
  assert.equal(isRecoverableReadError({}), false);
  assert.equal(isRecoverableReadError("Read error for undefined"), false);
  assert.equal(isRecoverableReadError(null), false);
});
