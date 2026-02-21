import assert from "node:assert/strict";
import { test } from "node:test";
import { createPlayerListProbe } from "../../src/bedrock/playerListProbe.js";

void test("createPlayerListProbe triggers callback once when started", async () => {
  let calls = 0;
  const probe = createPlayerListProbe({
    enabled: true,
    maxWaitMs: 10,
    settleWaitMs: 10,
    onElapsed: () => {
      calls += 1;
    }
  });
  probe.start();
  probe.start();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(calls, 1);
});

void test("createPlayerListProbe clear cancels pending timer", async () => {
  let calls = 0;
  const probe = createPlayerListProbe({
    enabled: true,
    maxWaitMs: 15,
    settleWaitMs: 15,
    onElapsed: () => {
      calls += 1;
    }
  });
  probe.start();
  probe.clear();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(calls, 0);
});

void test("createPlayerListProbe disabled mode never starts timer", async () => {
  let calls = 0;
  const probe = createPlayerListProbe({
    enabled: false,
    maxWaitMs: 10,
    settleWaitMs: 10,
    onElapsed: () => {
      calls += 1;
    }
  });
  probe.start();
  probe.notePlayersObserved();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(calls, 0);
});

void test("createPlayerListProbe finalizes early after observed player updates", async () => {
  let calls = 0;
  const probe = createPlayerListProbe({
    enabled: true,
    maxWaitMs: 1000,
    settleWaitMs: 20,
    onElapsed: () => {
      calls += 1;
    }
  });
  probe.start();
  probe.notePlayersObserved();
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(calls, 1);
});

void test("createPlayerListProbe resets settle timer on repeated updates", async () => {
  let calls = 0;
  const probe = createPlayerListProbe({
    enabled: true,
    maxWaitMs: 1000,
    settleWaitMs: 30,
    onElapsed: () => {
      calls += 1;
    }
  });
  probe.start();
  probe.notePlayersObserved();
  await new Promise((resolve) => setTimeout(resolve, 20));
  probe.notePlayersObserved();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls, 0);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls, 1);
});

void test("createPlayerListProbe completeNow finalizes immediately", async () => {
  let calls = 0;
  const probe = createPlayerListProbe({
    enabled: true,
    maxWaitMs: 1000,
    settleWaitMs: 1000,
    onElapsed: () => {
      calls += 1;
    }
  });
  probe.start();
  probe.completeNow();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(calls, 1);
});
